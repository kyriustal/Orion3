// src/backend/scratch/test_google_and_email.ts
import { syncCalendarEvent } from '../services/calendar.service';
import { EmailService } from '../services/email.service';
import { supabaseAdmin } from '../config/supabase';

async function test() {
  const orgId = 'b4647d91-6352-4947-8988-0df409b245b3';

  console.log('--- TESTANDO GOOGLE CALENDAR ---');
  try {
    const calRes = await syncCalendarEvent(orgId, {
      summary: 'TESTE DE SINCRONIZAÇÃO - Orion AI',
      appointmentDate: '2026-09-12',
      appointmentTime: '09:00',
      customerName: 'Cliente Teste',
      customerPhone: '+244923456789',
      description: 'Evento de teste para validação de tokens e agenda',
    });
    console.log('Resultado Google Calendar:', calRes);
  } catch (err: any) {
    console.error('Erro Google Calendar:', err);
  }

  console.log('\n--- TESTANDO EMAIL À EMPRESA ---');
  try {
    const mailRes = await EmailService.sendBookingNotificationToCompany({
      orgId,
      customerName: 'Cliente Teste',
      customerPhone: '+244923456789',
      customerEmail: 'teste@exemplo.com',
      date: '2026-09-12',
      time: '09:00',
      subject: 'Consulta de Teste',
      companyName: 'On Visa',
      channelOrigin: 'WhatsApp Chatbot',
      isReschedule: false,
    });
    console.log('Resultado Envio Email:', mailRes);
  } catch (err: any) {
    console.error('Erro Envio Email:', err);
  }
}

test().catch(console.error);
