import 'dotenv/config';
import { supabaseAdmin } from '../config/supabase';
import { getGoogleAccessToken, testGoogleCalendarConnection, syncCalendarEvent } from '../services/calendar.service';

async function runTest() {
  console.log('=== TESTE DE DIAGNÓSTICO DO GOOGLE CALENDAR ===');
  
  // 1. Buscar todas as organizações
  const { data: orgs, error } = await supabaseAdmin
    .from('organizations')
    .select('id, name, calendar_provider, google_refresh_token, google_user_refresh_token, google_client_id, google_client_secret');

  if (error) {
    console.error('Erro ao buscar organizações:', error.message);
    return;
  }

  console.log(`Encontradas ${orgs?.length || 0} organizações:`);
  for (const org of orgs || []) {
    const hasToken = !!(org.google_refresh_token || org.google_user_refresh_token);
    const tokenPreview = (org.google_refresh_token || org.google_user_refresh_token || '').substring(0, 15) + '...';
    console.log(`- Org "${org.name}" (${org.id}):`);
    console.log(`  calendar_provider: ${org.calendar_provider}`);
    console.log(`  has_google_token: ${hasToken} (${hasToken ? tokenPreview : 'NENHUM TOKEN'})`);

    // Testar getGoogleAccessToken
    console.log(`  A testar obtenção de access_token...`);
    const tokenResult = await getGoogleAccessToken(org.id);
    if (!tokenResult.accessToken) {
      console.log(`  ❌ Falha no token: ${tokenResult.error}`);
    } else {
      console.log(`  ✅ Access token obtido com sucesso!`);
      
      // Testar conexão
      const conn = await testGoogleCalendarConnection(org.id);
      console.log(`  Conexão: ${conn.success ? 'OK (Calendário: ' + conn.calendar?.summary + ')' : 'FALHA: ' + conn.error}`);

      // Testar criação de evento
      console.log(`  A testar criação de evento no Google Calendar...`);
      const eventRes = await syncCalendarEvent(org.id, {
        summary: `Consulta Teste Orion - Diagnóstico`,
        appointmentDate: '2026-09-05',
        appointmentTime: '10:00',
        customerName: 'Cliente Teste',
        customerEmail: 'onvisaexpress@gmail.com',
        customerPhone: '+244912345678',
        description: 'Teste automático de integração Orion'
      });

      console.log(`  Resultado do Agendamento:`, eventRes);
    }
    console.log('--------------------------------------------------');
  }
}

runTest().catch(console.error);
