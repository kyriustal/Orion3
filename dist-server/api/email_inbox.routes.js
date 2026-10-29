"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../config/supabase");
const auth_1 = require("../middleware/auth");
const authVerify_1 = require("../utils/authVerify");
const email_inbox_service_1 = require("../services/email_inbox.service");
const router = (0, express_1.Router)();
// ─── GET /api/email-inbox/config ──────────────────────────────────────────────
router.get('/config', auth_1.requireAuth, async (req, res) => {
    try {
        const { data } = await supabase_1.supabaseAdmin
            .from('email_inbox_config')
            .select('id, imap_host, imap_port, imap_user, imap_password, imap_tls, smtp_host, smtp_port, smtp_user, smtp_password, smtp_from, is_active, automation_enabled, auto_reply_prompt, created_at')
            .eq('org_id', req.user.orgId)
            .maybeSingle();
        res.json(data || null);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ─── POST /api/email-inbox/config ─────────────────────────────────────────────
router.post('/config', auth_1.requireAuth, async (req, res) => {
    try {
        const orgId = req.user.orgId;
        const { imap_host, imap_port, imap_user, imap_password, imap_tls, smtp_host, smtp_port, smtp_user, smtp_password, smtp_from, automation_enabled, auto_reply_prompt, password } = req.body;
        if (!imap_host || !imap_user || !imap_password) {
            return res.status(400).json({ error: 'imap_host, imap_user e imap_password são obrigatórios.' });
        }
        // Verificar se já existe configuração existente (edição)
        const { data: existing } = await supabase_1.supabaseAdmin
            .from('email_inbox_config')
            .select('id, is_active')
            .eq('org_id', orgId)
            .maybeSingle();
        if (existing) {
            const authCheck = await (0, authVerify_1.verifyUserPassword)(req.user?.id, req.user?.email, password);
            if (!authCheck.valid) {
                return res.status(401).json({ error: authCheck.error || 'Palavra-passe incorreta. Acesso negado para editar as credenciais de e-mail.' });
            }
        }
        // Testar ligação IMAP antes de guardar
        const testEmails = await email_inbox_service_1.EmailInboxService.fetchUnreadEmails({
            host: imap_host,
            port: imap_port || 993,
            user: imap_user,
            password: imap_password,
            tls: imap_tls !== false,
        });
        const { data, error } = await supabase_1.supabaseAdmin
            .from('email_inbox_config')
            .upsert({
            org_id: orgId,
            imap_host,
            imap_port: imap_port || 993,
            imap_user,
            imap_password,
            imap_tls: imap_tls !== false,
            smtp_host: smtp_host || imap_host,
            smtp_port: smtp_port || 587,
            smtp_user: smtp_user || imap_user,
            smtp_password: smtp_password || imap_password,
            smtp_from: smtp_from || imap_user,
            is_active: true,
            automation_enabled: automation_enabled || false,
            auto_reply_prompt: auto_reply_prompt || null,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'org_id' })
            .select('id, imap_host, imap_port, imap_user, imap_password, imap_tls, smtp_host, smtp_port, smtp_user, smtp_password, smtp_from, is_active, automation_enabled, auto_reply_prompt')
            .single();
        if (error)
            throw error;
        res.json({
            message: `Caixa de entrada conectada com sucesso! ${testEmails.length} email(s) não lido(s) encontrado(s).`,
            data,
        });
    }
    catch (err) {
        console.error('[EMAIL-INBOX] Erro ao guardar config:', err.message);
        res.status(500).json({ error: err.message });
    }
});
// ─── PUT /api/email-inbox/config ──────────────────────────────────────────────
// Atualiza apenas automação on/off
router.put('/config', auth_1.requireAuth, async (req, res) => {
    try {
        const { automation_enabled } = req.body;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('email_inbox_config')
            .update({ automation_enabled, updated_at: new Date().toISOString() })
            .eq('org_id', req.user.orgId)
            .select('id, automation_enabled')
            .single();
        if (error)
            throw error;
        res.json(data);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ─── DELETE /api/email-inbox/config ───────────────────────────────────────────
router.delete('/config', auth_1.requireAuth, async (req, res) => {
    try {
        await supabase_1.supabaseAdmin
            .from('email_inbox_config')
            .update({ is_active: false, automation_enabled: false })
            .eq('org_id', req.user.orgId);
        res.json({ message: 'Caixa de entrada desconectada.' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ─── POST /api/email-inbox/test ───────────────────────────────────────────────
// Testa ligação IMAP e retorna número de emails não lidos
router.post('/test', auth_1.requireAuth, async (req, res) => {
    try {
        const { imap_host, imap_port, imap_user, imap_password, imap_tls } = req.body;
        const emails = await email_inbox_service_1.EmailInboxService.fetchUnreadEmails({
            host: imap_host,
            port: imap_port || 993,
            user: imap_user,
            password: imap_password,
            tls: imap_tls !== false,
        });
        res.json({ success: true, unread_count: emails.length, message: `Ligação IMAP bem-sucedida! ${emails.length} email(s) não lido(s).` });
    }
    catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});
exports.default = router;
