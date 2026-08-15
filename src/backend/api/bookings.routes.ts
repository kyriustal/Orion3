import { Router } from 'express';
import { supabase } from '../config/supabase';
import { createGoogleCalendarEvent } from '../services/calendar.service';

const router = Router();

// /api/bookings
router.post('/', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, service, date, time, orgId } = req.body;

    // 1. Verificação de Conflito (Mesmo Dia, Hora e Serviço)
    const { data: existingBooking } = await supabase
      .from('bookings')
      .select('id')
      .eq('appointment_date', date)
      .eq('appointment_time', time)
      .eq('service', service)
      .maybeSingle();

    if (existingBooking) {
        return res.status(409).json({ 
            error: 'Horário Indisponível', 
            details: 'Já existe um agendamento para este serviço neste horário. Por favor, escolha outro momento.' 
        });
    }

    // 2. Se estiver livre, prossegue com o agendamento
    const { data, error } = await supabase
      .from('bookings')
      .insert({
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        service,
        appointment_date: date,
        appointment_time: time,
        org_id: orgId || 'default'
      })
      .select()
      .single();

    if (error) {
        console.warn('Tabela bookings não encontrada, simulando sucesso...', error.message);
        // Fallback para desenvolvimento
    }

    // 3. Sincronização automática com Google Calendar se ativado
    let googleCalendarResult = null;
    try {
      const targetOrgId = orgId || 'default';
      const fullName = `${firstName || ''} ${lastName || ''}`.trim() || 'Cliente';
      const eventSummary = service ? `${service} - ${fullName}` : `Agendamento - ${fullName}`;
      const eventDescription = `Agendamento de Serviço\nServiço: ${service || 'Atendimento'}\nCliente: ${fullName}\nTelefone: ${phone || 'N/A'}\nEmail: ${email || 'N/A'}`;

      googleCalendarResult = await createGoogleCalendarEvent(targetOrgId, {
        summary: eventSummary,
        description: eventDescription,
        appointmentDate: date,
        appointmentTime: time,
        customerName: fullName,
        customerEmail: email,
        customerPhone: phone,
      });

      if (googleCalendarResult?.success) {
        console.log('[BOOKINGS] Evento sincronizado com Google Calendar:', googleCalendarResult.eventId);
      }
    } catch (calErr: any) {
      console.warn('[BOOKINGS] Aviso ao tentar sincronizar com calendário:', calErr.message);
    }

    res.status(201).json({ 
      message: 'Agendamento realizado!', 
      data,
      calendar: googleCalendarResult?.success ? { synced: true, link: googleCalendarResult.htmlLink } : { synced: false }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao processar agendamento', details: error.message });
  }
});

// Listar agendamentos (para o painel administrativo)
router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabase
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
