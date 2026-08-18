import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { BookingService } from '../services/booking.service';

const router = Router();

// /api/bookings
router.post('/', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, service, date, time, orgId } = req.body;
    const targetOrgId = orgId || 'default';
    const fullName = `${firstName || ''} ${lastName || ''}`.trim() || firstName || '';

    // 1. Validação e Processamento completo através do BookingService
    const result = await BookingService.processBooking(targetOrgId, {
      name: fullName,
      subject: service,
      email: email || undefined,
      phone: phone || undefined,
      date,
      time,
    }, { channelOrigin: 'Web Form / API' });

    if (!result.success) {
      return res.status(400).json({
        error: 'Dados de agendamento incompletos ou inválidos',
        details: result.error,
      });
    }

    res.status(201).json({
      message: 'Agendamento realizado com sucesso!',
      bookingId: result.bookingId,
      calendar: result.calendarEventId ? { synced: true, link: result.calendarHtmlLink } : { synced: false },
      alertsScheduled: result.alertsScheduled,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao processar agendamento', details: error.message });
  }
});

// Listar agendamentos (para o painel administrativo)
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('bookings')
      .select('*')
      .order('appointment_date', { ascending: true });
    
    if (error) throw error;
    res.json({ bookings: data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
