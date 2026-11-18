"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const insights_service_1 = require("../services/insights.service");
const router = (0, express_1.Router)();
// ─── GET /api/insights/summary — Métricas de qualidade da IA ─────────────────
router.get('/summary', auth_1.requireAuth, async (req, res) => {
    try {
        const orgId = req.user?.orgId || req.user?.id;
        if (!orgId) {
            return res.status(400).json({ error: 'Organização não identificada.' });
        }
        const period = (['24h', '7d', '30d', '90d'].includes(req.query.period)
            ? req.query.period
            : '7d');
        const channel = req.query.channel || 'all';
        const summary = await insights_service_1.InsightsService.getSummary(orgId, period, channel);
        res.json(summary);
    }
    catch (err) {
        console.error('[INSIGHTS API] Erro ao obter resumo:', err.message);
        res.status(500).json({ error: 'Erro ao gerar métricas de insights', details: err.message });
    }
});
exports.default = router;
