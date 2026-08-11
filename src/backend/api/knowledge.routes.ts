import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import multer from 'multer';
import axios from 'axios';
import { DocumentService } from '../services/document.service';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB max

// ─── GET /api/knowledge — Listar documentos da base de conhecimento ──────────
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;

    const { data, error } = await supabaseAdmin
      .from('knowledge_docs')
      .select('id, filename, file_size, created_at, content_preview')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/knowledge — Upload de documento ───────────────────────────────
router.post('/', requireAuth, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'Nenhum ficheiro enviado.' });
    }

    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
    ];

    if (!allowedTypes.some(t => file.mimetype.startsWith(t) || file.mimetype.includes('pdf') || file.mimetype.includes('word'))) {
      return res.status(400).json({ error: 'Tipo de ficheiro não suportado. Use PDF, DOCX ou TXT.' });
    }

    // Extrair texto do documento
    const base64 = file.buffer.toString('base64');
    const extractedText = await DocumentService.extractTextFromBase64(base64, file.mimetype);

    if (!extractedText || extractedText.trim().length < 10) {
      return res.status(400).json({ error: 'Não foi possível extrair texto do documento. Verifique se o ficheiro não está vazio ou protegido.' });
    }

    // Guardar no banco
    const { data, error } = await supabaseAdmin
      .from('knowledge_docs')
      .insert({
        org_id: orgId,
        filename: file.originalname,
        file_size: file.size,
        mime_type: file.mimetype,
        content: extractedText,
        content_preview: extractedText.substring(0, 200) + (extractedText.length > 200 ? '...' : ''),
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`[KNOWLEDGE] Documento "${file.originalname}" carregado para org ${orgId}. ${extractedText.length} caracteres extraídos.`);

    res.json({
      message: `Documento "${file.originalname}" carregado com sucesso!`,
      doc: data,
      chars_extracted: extractedText.length,
    });
  } catch (err: any) {
    console.error('[KNOWLEDGE] Erro no upload:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/knowledge/:id — Remover documento ──────────────────────────
router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('knowledge_docs')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId); // Garantir que só remove os seus próprios docs

    if (error) throw error;

    res.json({ message: 'Documento removido com sucesso.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/knowledge/context — Obter conteúdo completo para o prompt ──────
// (uso interno pelo AI service via import directo, mas pode ser útil via HTTP)
router.get('/context', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;

    const { data, error } = await supabaseAdmin
      .from('knowledge_docs')
      .select('filename, content')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const combined = (data || [])
      .map(d => `=== ${d.filename} ===\n${d.content}`)
      .join('\n\n');

    res.json({ content: combined, doc_count: data?.length || 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/knowledge/:id — Obter detalhe e conteúdo do documento ──────────
router.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const { id } = req.params;

    const { data: doc, error } = await supabaseAdmin
      .from('knowledge_docs')
      .select('id, filename, file_size, mime_type, content, content_preview, created_at')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (error || !doc) {
      return res.status(404).json({ error: 'Documento não encontrado.' });
    }

    res.json(doc);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/knowledge/:id/download — Fazer download de documento ────────────
router.get('/:id/download', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const { id } = req.params;

    const { data: doc, error } = await supabaseAdmin
      .from('knowledge_docs')
      .select('filename, mime_type, content')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (error || !doc) {
      return res.status(404).json({ error: 'Documento não encontrado.' });
    }

    let filename = doc.filename || 'documento.txt';
    let mimeType = doc.mime_type || 'text/plain';

    // Como o conteúdo armazenado é o texto plano extraído pelo RAG (e não o ficheiro binário original),
    // forçamos o tipo text/plain e extensão .txt para garantir que abre perfeitamente em qualquer leitor.
    const isBinaryMime = mimeType.includes('pdf') || mimeType.includes('word') || mimeType.includes('officedocument') || mimeType.includes('msword');
    if (isBinaryMime) {
      mimeType = 'text/plain; charset=utf-8';
      if (!filename.toLowerCase().endsWith('.txt')) {
        filename = filename.replace(/\.[^.]+$/, '') + '_texto.txt';
      }
    } else {
      mimeType = 'text/plain; charset=utf-8';
    }

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(Buffer.from(doc.content || '', 'utf-8'));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/knowledge/site — Adicionar conteúdo de um site ───────────────
router.post('/site', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    let { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL é obrigatória.' });
    }

    url = url.trim();
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    // 1. Fetch HTML com User-Agent de navegador real para evitar bloqueios 403/406
    const response = await axios.get(url, { 
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
      },
      timeout: 20000,
      maxRedirects: 5,
    });
    
    let html = response.data;
    if (typeof html !== 'string') html = JSON.stringify(html);

    // 2. Limpeza (remover scripts, estilos, cabeçalhos e tags HTML)
    let text = html
      .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, '')
      .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, '')
      .replace(/<noscript\b[^>]*>([\s\S]*?)<\/noscript>/gim, '')
      .replace(/<header\b[^>]*>([\s\S]*?)<\/header>/gim, ' ')
      .replace(/<footer\b[^>]*>([\s\S]*?)<\/footer>/gim, ' ')
      .replace(/<[^>]+>/gm, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();

    if (text.length < 30) {
      return res.status(400).json({ error: 'Não foi possível extrair conteúdo relevante deste site. Verifique se o site não exige autenticação.' });
    }

    // Limitar a 30 000 caracteres
    const finalContent = text.substring(0, 30_000);

    // 3. Guardar no banco
    const { data, error } = await supabaseAdmin
      .from('knowledge_docs')
      .insert({
        org_id: orgId,
        filename: url.replace(/^https?:\/\//i, '').substring(0, 60),
        file_size: finalContent.length,
        mime_type: 'text/html',
        content: finalContent,
        content_preview: `Site: ${url}\n\n` + finalContent.substring(0, 180) + '...',
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: 'Conteúdo do site importado com sucesso!',
      doc: data,
    });
  } catch (err: any) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error('[KNOWLEDGE] Erro ao importar site:', detail);
    res.status(500).json({ error: `Erro ao aceder ao site: ${err.message || detail}` });
  }
});

export default router;
