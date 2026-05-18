import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── GET /api/assets — Listar assets ─────────────────────────────────────────
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const { data, error } = await supabaseAdmin
      .from('public_assets')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/assets — Upload de asset ──────────────────────────────────────
router.post('/', requireAuth, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const { description } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'Nenhum ficheiro enviado' });

    const fileName = `${orgId}/${Date.now()}_${file.originalname}`;
    
    // 1. Upload para o Supabase Storage (Bucket: assets)
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('assets')
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: true
      });

    if (uploadError) throw uploadError;

    // 2. Obter URL pública
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('assets')
      .getPublicUrl(fileName);

    // 3. Guardar no banco
    const { data, error } = await supabaseAdmin
      .from('public_assets')
      .insert({
        org_id: orgId,
        filename: file.originalname,
        file_url: publicUrl,
        mime_type: file.mimetype,
        description: description || file.originalname
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/assets/:id ──────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const { id } = req.params;

    // 1. Buscar info do ficheiro
    const { data: asset } = await supabaseAdmin
      .from('public_assets')
      .select('file_url')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (asset) {
      // Tentar extrair o path do storage (assumindo formato padrão)
      const path = asset.file_url.split('/assets/')[1];
      if (path) {
        await supabaseAdmin.storage.from('assets').remove([path]);
      }
    }

    const { error } = await supabaseAdmin
      .from('public_assets')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId);

    if (error) throw error;
    res.json({ message: 'Asset removido' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
