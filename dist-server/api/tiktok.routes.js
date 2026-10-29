"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../config/supabase");
const auth_1 = require("../middleware/auth");
const tiktok_service_1 = require("../services/tiktok.service");
const router = (0, express_1.Router)();
// ─── GET /api/tiktok/config ───────────────────────────────────────────────────
router.get('/config', auth_1.requireAuth, async (req, res) => {
    try {
        const { data } = await supabase_1.supabaseAdmin
            .from('tiktok_config')
            .select('id, open_id, display_name, username, avatar_url, is_active, comment_automation_enabled, created_at')
            .eq('org_id', req.user.orgId)
            .maybeSingle();
        res.json(data || null);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ─── GET /api/tiktok/auth-url ─────────────────────────────────────────────────
// Gera a URL de autorização OAuth para o utilizador abrir no browser
router.get('/auth-url', auth_1.requireAuth, async (req, res) => {
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const redirectUri = process.env.TIKTOK_REDIRECT_URI || `${process.env.VITE_APP_URL}/api/tiktok/callback`;
    if (!clientKey) {
        return res.status(400).json({ error: 'TIKTOK_CLIENT_KEY não configurado no .env' });
    }
    const state = `${req.user.orgId}:${Date.now()}`;
    const url = tiktok_service_1.TikTokService.getAuthUrl(clientKey, redirectUri, state);
    res.json({ url });
});
// ─── GET /api/tiktok/callback ─────────────────────────────────────────────────
// Callback OAuth — troca o código por tokens e guarda no Supabase
router.get('/callback', async (req, res) => {
    const { code, state, error } = req.query;
    if (error) {
        return res.redirect(`/dashboard/tiktok-config?error=${encodeURIComponent(String(error))}`);
    }
    if (!code || !state) {
        return res.redirect('/dashboard/tiktok-config?error=missing_params');
    }
    const orgId = String(state).split(':')[0];
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
    const redirectUri = process.env.TIKTOK_REDIRECT_URI || `${process.env.VITE_APP_URL}/api/tiktok/callback`;
    try {
        const tokenData = await tiktok_service_1.TikTokService.exchangeCodeForToken(String(code), clientKey, clientSecret, redirectUri);
        if (!tokenData) {
            return res.redirect('/dashboard/tiktok-config?error=token_exchange_failed');
        }
        // Buscar info do perfil
        const userInfo = await tiktok_service_1.TikTokService.getUserInfo(tokenData.access_token);
        const expiry = new Date(Date.now() + tokenData.expires_in * 1000);
        await supabase_1.supabaseAdmin.from('tiktok_config').upsert({
            org_id: orgId,
            open_id: tokenData.open_id,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            token_expires_at: expiry.toISOString(),
            client_key: clientKey,
            client_secret: clientSecret,
            display_name: userInfo?.display_name || 'TikTok',
            username: userInfo?.username || tokenData.open_id,
            is_active: true,
            comment_automation_enabled: false,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'org_id' });
        console.log(`[TIKTOK] Conta conectada para org ${orgId}: @${userInfo?.username}`);
        res.redirect('/dashboard/tiktok-config?success=1');
    }
    catch (err) {
        console.error('[TIKTOK] Erro no callback:', err.message);
        res.redirect(`/dashboard/tiktok-config?error=${encodeURIComponent(err.message)}`);
    }
});
// ─── PUT /api/tiktok/config ───────────────────────────────────────────────────
// Atualiza configurações (ex: toggle automação)
router.put('/config', auth_1.requireAuth, async (req, res) => {
    try {
        const { comment_automation_enabled } = req.body;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('tiktok_config')
            .update({ comment_automation_enabled, updated_at: new Date().toISOString() })
            .eq('org_id', req.user.orgId)
            .select()
            .single();
        if (error)
            throw error;
        res.json(data);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ─── DELETE /api/tiktok/config ────────────────────────────────────────────────
router.delete('/config', auth_1.requireAuth, async (req, res) => {
    try {
        await supabase_1.supabaseAdmin
            .from('tiktok_config')
            .update({ is_active: false, comment_automation_enabled: false })
            .eq('org_id', req.user.orgId);
        res.json({ message: 'TikTok desconectado.' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
