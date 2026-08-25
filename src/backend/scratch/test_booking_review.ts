import { BookingService } from '../services/booking.service';
import { supabaseAdmin } from '../config/supabase';

async function testBookingReview() {
  console.log('=== TESTE AGENDAMENTO + AVALIAÇÃO PÓS-ATENDIMENTO ===');
  
  // Buscar uma organização válida
  const { data: org } = await supabaseAdmin.from('organizations').select('id').limit(1).single();
  if (!org) {
    console.error('Nenhuma org encontrada.');
    return;
  }

  const result = await BookingService.processBooking(org.id, {
    name: 'Teste Cliente Review',
    phone: '244999999999',
    email: 'teste.review@exemplo.com',
    subject: 'Visto Polónia',
    date: '2026-09-15',
    time: '11:00',
    source: 'simulation'
  });

  console.log('Resultado BookingService:', result);

  // Consultar follow-up schedules para ver se a avaliação pós-atendimento foi gerada
  const { data: followups } = await supabaseAdmin
    .from('followup_schedules')
    .select('*')
    .eq('customer_phone', '244999999999');

  console.log('Follow-up Schedules gerados:', JSON.stringify(followups, null, 2));

  // Limpeza de teste
  await supabaseAdmin.from('followup_schedules').delete().eq('customer_phone', '244999999999');
  await supabaseAdmin.from('appointment_reminders').delete().eq('customer_phone', '244999999999');
  if (result.bookingId) {
    await supabaseAdmin.from('bookings').delete().eq('id', result.bookingId);
  }
  console.log('🧹 Limpeza de dados de teste concluída com sucesso.');
}

testBookingReview();
