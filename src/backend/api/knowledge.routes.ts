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
    // RFC 5987: suporte a nomes de ficheiro com caracteres especiais (acentos, espaços, etc.)
    const safeAsciiFilename = filename.replace(/[^\x20-\x7E]/g, '_');
    const encodedFilename = encodeURIComponent(filename).replace(/'/g, '%27');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeAsciiFilename}"; filename*=UTF-8''${encodedFilename}`
    );
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

    // Cabeçalhos que imitam um navegador real para evitar bloqueios 403/406
    const requestHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
    };

    // Agente HTTPS personalizado: tolera servidores com TLS restrito ou certificados problemáticos
    const https = await import('https');
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false,   // permite certificados self-signed / expirados
      keepAlive: true,
      timeout: 25000,
    });

    // Função auxiliar para tentar o fetch com tratamento de erros TLS
    const attemptFetch = async (targetUrl: string) => {
      return axios.get(targetUrl, {
        headers: requestHeaders,
        timeout: 25000,
        maxRedirects: 8,
        httpsAgent,
        decompress: true,
      });
    };

    let response;
    try {
      // 1ª tentativa: URL original (HTTPS ou HTTP conforme fornecido)
      response = await attemptFetch(url);
    } catch (firstErr: any) {
      const isTlsOrNetworkError = (
        firstErr.code === 'ECONNRESET' ||
        firstErr.code === 'ECONNREFUSED' ||
        firstErr.code === 'ENOTFOUND' ||
        firstErr.code === 'ETIMEDOUT' ||
        firstErr.code === 'ERR_TLS_CERT_ALTNAME_INVALID' ||
        firstErr.message?.toLowerCase().includes('tls') ||
        firstErr.message?.toLowerCase().includes('ssl') ||
        firstErr.message?.toLowerCase().includes('socket disconnected') ||
        firstErr.message?.toLowerCase().includes('secure connection')
      );

      // 2ª tentativa: se HTTPS falhou por TLS, tentar com HTTP simples
      if (isTlsOrNetworkError && url.startsWith('https://')) {
        const httpUrl = url.replace(/^https:\/\//i, 'http://');
        console.warn(`[KNOWLEDGE] HTTPS falhou (${firstErr.code || firstErr.message}). A tentar via HTTP: ${httpUrl}`);
        try {
          response = await attemptFetch(httpUrl);
        } catch (secondErr: any) {
          throw secondErr; // relançar o erro da 2ª tentativa
        }
      } else {
        throw firstErr;
      }
    }

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
      return res.status(400).json({ error: 'Não foi possível extrair conteúdo relevante deste site. O site pode exigir autenticação ou ser gerado dinamicamente (JavaScript).' });
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
    // Mapear erros de rede para mensagens amigáveis em português
    let userMessage = err.message;
    if (err.code === 'ECONNREFUSED') {
      userMessage = 'O servidor recusou a ligação. Verifique se o endereço está correcto.';
    } else if (err.code === 'ENOTFOUND') {
      userMessage = 'Domínio não encontrado. Verifique se o endereço do site está correcto.';
    } else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
      userMessage = 'O site demorou demasiado a responder. Tente novamente mais tarde.';
    } else if (
      err.message?.toLowerCase().includes('tls') ||
      err.message?.toLowerCase().includes('ssl') ||
      err.message?.toLowerCase().includes('socket disconnected') ||
      err.message?.toLowerCase().includes('secure connection')
    ) {
      userMessage = 'Erro de segurança TLS/SSL ao ligar ao site. O servidor pode ter uma configuração de segurança incompatível.';
    } else if (err.response?.status === 403) {
      userMessage = 'Acesso negado (403). O site bloqueou o nosso pedido.';
    } else if (err.response?.status === 404) {
      userMessage = 'Página não encontrada (404). Verifique o endereço.';
    }

    console.error('[KNOWLEDGE] Erro ao importar site:', err.code || err.message);
    res.status(500).json({ error: userMessage });
  }
});

export default router;
