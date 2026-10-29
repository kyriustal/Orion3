"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const supabase_1 = require("../config/supabase");
const router = (0, express_1.Router)();
// ─── GET /api/instructions — Listar instruções ──────────────────────────────
router.get('/', auth_1.requireAuth, async (req, res) => {
    try {
        const orgId = req.user?.orgId;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('bot_instructions')
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
// ─── POST /api/instructions — Criar ou Editar instrução ──────────────────────
router.post('/', auth_1.requireAuth, async (req, res) => {
    try {
        const orgId = req.user?.orgId;
        const { id, title, content } = req.body;
        if (!content)
            return res.status(400).json({ error: 'Conteúdo é obrigatório' });
        const payload = { org_id: orgId, title, content };
        if (id) {
            // Editar
            const { data, error } = await supabase_1.supabaseAdmin
                .from('bot_instructions')
                .update(payload)
                .eq('id', id)
                .eq('org_id', orgId)
                .select()
                .single();
            if (error)
                throw error;
            return res.json(data);
        }
        else {
            // Criar
            const { data, error } = await supabase_1.supabaseAdmin
                .from('bot_instructions')
                .insert(payload)
                .select()
                .single();
            if (error)
                throw error;
            return res.json(data);
        }
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ─── DELETE /api/instructions/:id — Eliminar instrução ──────────────────────
router.delete('/:id', auth_1.requireAuth, async (req, res) => {
    try {
        const orgId = req.user?.orgId;
        const { id } = req.params;
        const { error } = await supabase_1.supabaseAdmin
            .from('bot_instructions')
            .delete()
            .eq('id', id)
            .eq('org_id', orgId);
        if (error)
            throw error;
        res.json({ message: 'Instrução eliminada' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
