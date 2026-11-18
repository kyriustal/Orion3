import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { InsightsService, InsightsPeriod } from '../services/insights.service';

const router = Router();

// ─── GET /api/insights/summary — Métricas de qualidade da IA ─────────────────
router.get('/summary', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user?.orgId || req.user?.id;
    if (!orgId) {
      return res.status(400).json({ error: 'Organização não identificada.' });
    }

    const period = (['24h', '7d', '30d', '90d'].includes(req.query.period as string)
      ? req.query.period
      : '7d') as InsightsPeriod;
    const channel = (req.query.channel as string) || 'all';

    const summary = await InsightsService.getSummary(orgId, period, channel);
    res.json(summary);
  } catch (err: any) {
    console.error('[INSIGHTS API] Erro ao obter resumo:', err.message);
    res.status(500).json({ error: 'Erro ao gerar métricas de insights', details: err.message });
  }
});

export default router;
