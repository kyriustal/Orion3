"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const supabase_1 = require("../config/supabase");
const push_service_1 = require("../services/push.service");
const router = (0, express_1.Router)();
// ─── GET /api/push/public-key — Devolver chave VAPID pública para o frontend ──
router.get('/public-key', (_req, res) => {
    const key = push_service_1.PushService.getPublicKey();
    if (!key) {
        return res.status(503).json({ error: 'Web Push não configurado no servidor.' });
    }
    res.json({ publicKey: key });
});
// ─── POST /api/push/subscribe — Guardar assinatura de dispositivo ─────────────
router.post('/subscribe', auth_1.requireAuth, async (req, res) => {
    try {
        const orgId = req.user?.orgId;
        const userId = req.user?.id;
        const { subscription } = req.body;
        if (!orgId || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
            return res.status(400).json({ error: 'Dados de assinatura inválidos.' });
        }
        const userAgent = req.headers['user-agent'] || null;
        // Upsert para evitar duplicados pelo endpoint
        const { error } = await supabase_1.supabaseAdmin
            .from('push_subscriptions')
            .upsert({
            org_id: orgId,
            user_id: userId || null,
            endpoint: subscription.endpoint,
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
            user_agent: userAgent,
        }, { onConflict: 'endpoint' });
        if (error) {
            console.error('[PUSH ROUTE] Erro ao guardar assinatura:', error.message);
            return res.status(500).json({ error: 'Erro ao guardar assinatura.' });
        }
        console.log(`[PUSH ROUTE] ✅ Nova assinatura registada para org ${orgId}`);
        res.json({ message: 'Assinatura de notificações registada com sucesso.' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ─── DELETE /api/push/unsubscribe — Remover assinatura ───────────────────────
router.delete('/unsubscribe', auth_1.requireAuth, async (req, res) => {
    try {
        const { endpoint } = req.body;
        if (!endpoint)
            return res.status(400).json({ error: 'Endpoint obrigatório.' });
        await supabase_1.supabaseAdmin
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', endpoint);
        res.json({ message: 'Assinatura removida.' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
