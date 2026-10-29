"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const supabase_1 = require("../config/supabase");
const multer_1 = __importDefault(require("multer"));
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
// ─── GET /api/assets — Listar assets ─────────────────────────────────────────
router.get('/', auth_1.requireAuth, async (req, res) => {
    try {
        const orgId = req.user?.orgId;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('public_assets')
            .select('*')
            .eq('org_id', orgId)
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        res.json(data || []);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ─── POST /api/assets — Upload de asset ──────────────────────────────────────
router.post('/', auth_1.requireAuth, upload.single('file'), async (req, res) => {
    try {
        const orgId = req.user?.orgId;
        const { description } = req.body;
        const file = req.file;
        if (!file)
            return res.status(400).json({ error: 'Nenhum ficheiro enviado' });
        // Sanitizar o nome do ficheiro — Supabase Storage não aceita espaços nem acentos
        const sanitizedName = file.originalname
            .normalize('NFD') // decompõe caracteres acentuados (ó → o + ́)
            .replace(/[\u0300-\u036f]/g, '') // remove as marcas de acento
            .replace(/[^a-zA-Z0-9._-]/g, '_') // substitui espaços e símbolos por underscore
            .replace(/_+/g, '_') // colapsa underscores consecutivos
            .replace(/^_|_$/g, ''); // remove underscores no início/fim
        const fileName = `${orgId}/${Date.now()}_${sanitizedName}`;
        // 1. Garantir que o bucket 'assets' existe (cria se necessário)
        const { data: buckets } = await supabase_1.supabaseAdmin.storage.listBuckets();
        const bucketExists = buckets?.some(b => b.name === 'assets');
        if (!bucketExists) {
            const { error: bucketErr } = await supabase_1.supabaseAdmin.storage.createBucket('assets', { public: true });
            if (bucketErr) {
                console.error('[ASSETS] Erro ao criar bucket:', bucketErr.message);
                return res.status(500).json({ error: `Erro ao criar bucket de armazenamento: ${bucketErr.message}` });
            }
            console.log('[ASSETS] ✅ Bucket "assets" criado automaticamente.');
        }
        // 2. Upload para o Supabase Storage (Bucket: assets)
        const { error: uploadError } = await supabase_1.supabaseAdmin.storage
            .from('assets')
            .upload(fileName, file.buffer, {
            contentType: file.mimetype,
            upsert: true,
        });
        if (uploadError) {
            console.error('[ASSETS] Erro no upload para Storage:', uploadError.message);
            return res.status(500).json({ error: `Erro no upload: ${uploadError.message}` });
        }
        // 3. Obter URL pública
        const { data: { publicUrl } } = supabase_1.supabaseAdmin.storage
            .from('assets')
            .getPublicUrl(fileName);
        // 4. Guardar no banco
        const { data, error } = await supabase_1.supabaseAdmin
            .from('public_assets')
            .insert({
            org_id: orgId,
            filename: file.originalname,
            file_url: publicUrl,
            mime_type: file.mimetype,
            description: description || file.originalname,
        })
            .select()
            .single();
        if (error) {
            console.error('[ASSETS] Erro ao guardar no banco:', error.message);
            return res.status(500).json({ error: `Erro ao guardar no banco: ${error.message}` });
        }
        console.log(`[ASSETS] ✅ Asset "${file.originalname}" carregado para org ${orgId}.`);
        res.json(data);
    }
    catch (err) {
        console.error('[ASSETS] Erro inesperado:', err.message);
        res.status(500).json({ error: err.message });
    }
});
// ─── DELETE /api/assets/:id ──────────────────────────────────────────────────
router.delete('/:id', auth_1.requireAuth, async (req, res) => {
    try {
        const orgId = req.user?.orgId;
        const { id } = req.params;
        // 1. Buscar info do ficheiro
        const { data: asset } = await supabase_1.supabaseAdmin
            .from('public_assets')
            .select('file_url')
            .eq('id', id)
            .eq('org_id', orgId)
            .single();
        if (asset) {
            // Tentar extrair o path do storage (assumindo formato padrão)
            const path = asset.file_url.split('/assets/')[1];
            if (path) {
                await supabase_1.supabaseAdmin.storage.from('assets').remove([path]);
            }
        }
        const { error } = await supabase_1.supabaseAdmin
            .from('public_assets')
            .delete()
            .eq('id', id)
            .eq('org_id', orgId);
        if (error)
            throw error;
        res.json({ message: 'Asset removido' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
