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

// ─── POST /api/knowledge/site — Adicionar conteúdo de um site ───────────────
router.post('/site', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const { url } = req.body;

    if (!url || !url.startsWith('http')) {
      return res.status(400).json({ error: 'URL inválida. Deve começar com http:// ou https://' });
    }

    // 1. Fetch HTML
    const response = await axios.get(url, { 
      headers: { 'User-Agent': 'OrionBot/1.0' },
      timeout: 15000 
    });
    
    let html = response.data;
    if (typeof html !== 'string') html = JSON.stringify(html);

    // 2. Limpeza básica (remover scripts, estilos e tags)
    let text = html
      .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, '')
      .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, '')
      .replace(/<[^>]+>/gm, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (text.length < 50) {
      return res.status(400).json({ error: 'Não foi possível extrair conteúdo relevante deste site.' });
    }

    // Limitar a 20 000 caracteres
    const finalContent = text.substring(0, 20_000);

    // 3. Guardar no banco
    const { data, error } = await supabaseAdmin
      .from('knowledge_docs')
      .insert({
        org_id: orgId,
        filename: url.replace(/^https?:\/\//, '').substring(0, 50),
        file_size: finalContent.length,
        mime_type: 'text/html',
        content: finalContent,
        content_preview: `Site: ${url}\n\n` + finalContent.substring(0, 150) + '...',
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
    res.status(500).json({ error: `Erro ao aceder ao site: ${detail}` });
  }
});

export default router;
