// src/backend/api/followup.routes.ts
import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { FollowupService, parseDelay } from '../services/followup.service';
import { supabaseAdmin } from '../config/supabase';

const router = Router();

// ─── POST /api/followup — Agendar um follow-up ────────────────────────────────
router.post('/followup', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user?.orgId;
    const { phone, platform = 'whatsapp', delay, customPrompt, lastMessageId } = req.body;

    if (!phone)    return res.status(400).json({ error: 'O campo "phone" é obrigatório.' });
    if (!delay)    return res.status(400).json({ error: 'O campo "delay" é obrigatório (ex.: "2h", "3d", "1w", "2m").' });
    if (!['whatsapp', 'facebook'].includes(platform)) {
      return res.status(400).json({ error: 'Platform deve ser "whatsapp" ou "facebook".' });
    }

    // Validar o delay antes de tentar guardar
    let scheduledAt: Date;
    try {
      scheduledAt = parseDelay(delay);
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }

    await FollowupService.schedule({ orgId, phone, platform, delay, customPrompt, lastMessageId });

    res.json({
      message:      'Follow-up agendado com sucesso.',
      scheduled_at: scheduledAt.toISOString(),
    });
  } catch (err: any) {
    console.error('[FOLLOWUP ROUTE] Erro ao agendar:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/followup — Listar agendamentos da organização ─────────────────
router.get('/followup', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId  = req.user?.orgId;
    const status = (req.query.status as string) || 'pending';
    const data   = await FollowupService.listByOrg(orgId, status);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/followup/all — Listar todos (pendentes, enviados, cancelados) ──
router.get('/followup/all', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user?.orgId;
    const data  = await FollowupService.listByOrg(orgId);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/followup/:id — Cancelar um agendamento ─────────────────────
router.delete('/followup/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user?.orgId;
    const { id } = req.params;

    // Confirmar que o registo pertence à organização
    const { data: existing } = await supabaseAdmin
      .from('followup_schedules')
      .select('id')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle();

    if (!existing) return res.status(404).json({ error: 'Follow-up não encontrado.' });

    await FollowupService.setStatus(id, 'cancelled');
    res.json({ message: 'Follow-up cancelado com sucesso.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
