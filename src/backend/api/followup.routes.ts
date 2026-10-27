// src/backend/api/followup.routes.ts
import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { FollowupService, parseDelay } from '../services/followup.service';
import { supabaseAdmin } from '../config/supabase';

// ─── Defaults de configuração (usados quando a org ainda não personalizou) ──
export const FOLLOWUP_SETTINGS_DEFAULTS = {
  enabled:           true,
  step1_enabled:     true,
  step1_delay_hours: 12,
  step1_message:     null,   // null = usar template dinâmico da followup.service
  step2_enabled:     false,
  step2_delay_hours: 24,
  step2_message:     null,
  send_window_start: '09:00',
  send_window_end:   '20:00',
  allowed_days:      [1, 2, 3, 4, 5, 6], // Seg-Sab
};

const router = Router();

// ─── POST /api/followup — Agendar um follow-up ────────────────────────────────
router.post('/followup', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user!.orgId!;
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
    const orgId  = req.user!.orgId!;
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
    const orgId = req.user!.orgId!;
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

// ─── GET /api/followup/settings — Ler configurações da org ──────────────────
router.get('/followup/settings', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user!.orgId!;
    const { data } = await supabaseAdmin
      .from('followup_settings')
      .select('*')
      .eq('org_id', orgId)
      .maybeSingle();

    // Mesclar com defaults para garantir que todos os campos existam
    res.json({ ...FOLLOWUP_SETTINGS_DEFAULTS, ...(data ?? {}), org_id: orgId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/followup/settings — Guardar configurações da org ───────────────
router.put('/followup/settings', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user!.orgId!;
    const {
      enabled,
      step1_enabled,
      step1_delay_hours,
      step1_message,
      step2_enabled,
      step2_delay_hours,
      step2_message,
      send_window_start,
      send_window_end,
      allowed_days,
    } = req.body;

    // Validações básicas
    if (step1_delay_hours !== undefined && (typeof step1_delay_hours !== 'number' || step1_delay_hours < 1 || step1_delay_hours > 168)) {
      return res.status(400).json({ error: 'step1_delay_hours deve estar entre 1 e 168 horas.' });
    }
    if (step2_delay_hours !== undefined && (typeof step2_delay_hours !== 'number' || step2_delay_hours < 1 || step2_delay_hours > 720)) {
      return res.status(400).json({ error: 'step2_delay_hours deve estar entre 1 e 720 horas.' });
    }
    if (allowed_days !== undefined && (!Array.isArray(allowed_days) || allowed_days.length === 0)) {
      return res.status(400).json({ error: 'allowed_days deve ser um array não vazio.' });
    }

    const payload: Record<string, any> = {
      org_id:            orgId,
      updated_at:        new Date().toISOString(),
    };

    if (enabled           !== undefined) payload.enabled           = enabled;
    if (step1_enabled     !== undefined) payload.step1_enabled     = step1_enabled;
    if (step1_delay_hours !== undefined) payload.step1_delay_hours = step1_delay_hours;
    if (step1_message     !== undefined) payload.step1_message     = step1_message || null;
    if (step2_enabled     !== undefined) payload.step2_enabled     = step2_enabled;
    if (step2_delay_hours !== undefined) payload.step2_delay_hours = step2_delay_hours;
    if (step2_message     !== undefined) payload.step2_message     = step2_message || null;
    if (send_window_start !== undefined) payload.send_window_start = send_window_start;
    if (send_window_end   !== undefined) payload.send_window_end   = send_window_end;
    if (allowed_days      !== undefined) payload.allowed_days      = allowed_days;

    const { data, error } = await supabaseAdmin
      .from('followup_settings')
      .upsert(payload, { onConflict: 'org_id' })
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Configurações de follow-up guardadas com sucesso.', settings: data });
  } catch (err: any) {
    console.error('[FOLLOWUP SETTINGS] Erro ao guardar:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
