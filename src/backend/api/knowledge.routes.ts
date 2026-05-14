import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import multer from 'multer';
import { DocumentService } from '../services/document.service';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB max

// ─── GET /api/knowledge — Listar documentos da base de conhecimento ──────────
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.id;

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
    const orgId = req.user?.id;
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
    const orgId = req.user?.id;
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
    const orgId = req.user?.id;

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

export default router;
