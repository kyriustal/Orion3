"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../config/supabase");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Listar automações
router.get('/', auth_1.requireAuth, async (req, res) => {
    try {
        const orgId = req.user.orgId;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('automations')
            .select('*')
            .eq('org_id', orgId);
        if (error && error.code !== 'PGRST116')
            throw error;
        res.json(data || []);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Criar automação
router.post('/', auth_1.requireAuth, async (req, res) => {
    try {
        const orgId = req.user.orgId;
        const { name, type, config } = req.body;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('automations')
            .insert({
            org_id: orgId,
            name,
            type,
            config,
            status: 'active'
        })
            .select()
            .single();
        if (error)
            throw error;
        res.status(201).json(data);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Alternar status (Ativo/Inativo)
router.put('/:id/toggle', auth_1.requireAuth, async (req, res) => {
    try {
        const { status } = req.body;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('automations')
            .update({ status })
            .eq('id', req.params.id);
        if (error)
            throw error;
        res.json({ message: 'Status atualizado' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
