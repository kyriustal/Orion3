// src/backend/api/business_hours.routes.ts
import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';

const router = Router();

export interface BusinessDaySchedule {
  day_of_week: number; // 0 = Domingo, 1 = Segunda, 2 = Terça, 3 = Quarta, 4 = Quinta, 5 = Sexta, 6 = Sábado
  is_open: boolean;
  open_time: string; // '08:00'
  close_time: string; // '18:00'
}

export const DEFAULT_BUSINESS_HOURS: BusinessDaySchedule[] = [
  { day_of_week: 0, is_open: false, open_time: '08:00', close_time: '12:00' }, // Domingo
  { day_of_week: 1, is_open: true,  open_time: '08:00', close_time: '18:00' }, // Segunda
  { day_of_week: 2, is_open: true,  open_time: '08:00', close_time: '18:00' }, // Terça
  { day_of_week: 3, is_open: true,  open_time: '08:00', close_time: '18:00' }, // Quarta
  { day_of_week: 4, is_open: true,  open_time: '08:00', close_time: '18:00' }, // Quinta
  { day_of_week: 5, is_open: true,  open_time: '08:00', close_time: '18:00' }, // Sexta
  { day_of_week: 6, is_open: true,  open_time: '08:00', close_time: '13:00' }, // Sábado
];

/**
 * GET /api/settings/business-hours
 * Devolve os horários configurados da organização (7 dias da semana).
 */
router.get('/settings/business-hours', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user?.orgId || req.user?.id;
    if (!orgId) return res.status(401).json({ error: 'Organização não identificada.' });

    const { data, error } = await supabaseAdmin
      .from('business_hours')
      .select('day_of_week, is_open, open_time, close_time')
      .eq('org_id', orgId)
      .order('day_of_week', { ascending: true });

    if (error && error.code !== 'PGRST116') {
      console.warn('[BusinessHours] Aviso ao ler business_hours:', error.message);
    }

    // Se já existirem dados no banco, mesclar com o padrão para garantir os 7 dias completos
    const map = new Map<number, BusinessDaySchedule>();
    DEFAULT_BUSINESS_HOURS.forEach(d => map.set(d.day_of_week, { ...d }));

    if (data && data.length > 0) {
      data.forEach(item => {
        map.set(item.day_of_week, {
          day_of_week: item.day_of_week,
          is_open: !!item.is_open,
          open_time: item.open_time ? item.open_time.substring(0, 5) : '08:00',
          close_time: item.close_time ? item.close_time.substring(0, 5) : '18:00',
        });
      });
    }

    const result = Array.from(map.values()).sort((a, b) => a.day_of_week - b.day_of_week);
    res.json(result);
  } catch (err: any) {
    console.error('[BusinessHours GET] Erro:', err.message);
    res.status(500).json({ error: 'Erro ao carregar horários de funcionamento', details: err.message });
  }
});

/**
 * PUT /api/settings/business-hours
 * Guarda ou actualiza os horários de funcionamento para todos os dias.
 */
router.put('/settings/business-hours', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user?.orgId || req.user?.id;
    if (!orgId) return res.status(401).json({ error: 'Organização não identificada.' });

    const days: BusinessDaySchedule[] = req.body.days || req.body;
    if (!Array.isArray(days) || days.length === 0) {
      return res.status(400).json({ error: 'Formato inválido. Esperada lista de dias.' });
    }

    const rows = days.map(d => ({
      org_id: orgId,
      day_of_week: d.day_of_week,
      is_open: Boolean(d.is_open),
      open_time: d.open_time ? (d.open_time.length === 5 ? `${d.open_time}:00` : d.open_time) : '08:00:00',
      close_time: d.close_time ? (d.close_time.length === 5 ? `${d.close_time}:00` : d.close_time) : '18:00:00',
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabaseAdmin
      .from('business_hours')
      .upsert(rows, { onConflict: 'org_id,day_of_week' });

    if (error) {
      console.error('[BusinessHours PUT] Erro no upsert:', error.message);
      throw error;
    }

    console.log(`[BusinessHours] ✅ Horários de funcionamento atualizados para a org ${orgId}`);
    res.json({ success: true, message: 'Horários atualizados com sucesso.' });
  } catch (err: any) {
    console.error('[BusinessHours PUT] Erro:', err.message);
    res.status(500).json({ error: 'Erro ao guardar horários de funcionamento', details: err.message });
  }
});

export default router;
