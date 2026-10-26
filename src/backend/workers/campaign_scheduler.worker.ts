// src/backend/workers/campaign_scheduler.worker.ts
// Worker de agendamento de campanhas em massa (SCHEDULED)
// Verifica a cada 30 segundos se há campanhas com horário programado atingido

import { supabaseAdmin } from '../config/supabase';
import { processCampaign } from '../api/campaigns.routes';

let isRunning = false;

export async function checkScheduledCampaigns() {
  if (isRunning) return;
  isRunning = true;

  try {
    const nowIso = new Date().toISOString();

    // 1. Buscar campanhas com status SCHEDULED
    const { data: scheduledCampaigns, error } = await supabaseAdmin
      .from('campaigns')
      .select('id, org_id, name, status, scheduled_at, filters')
      .eq('status', 'SCHEDULED')
      .limit(25);

    if (error) {
      if (!error.message.includes('relation "campaigns" does not exist')) {
        console.error('[CAMPAIGN SCHEDULER] Erro ao consultar campanhas agendadas:', error.message);
      }
      return;
    }

    if (!scheduledCampaigns || scheduledCampaigns.length === 0) {
      return;
    }

    const nowTime = Date.now();

    for (const camp of scheduledCampaigns) {
      // Obter scheduled_at da coluna ou do fallback dentro de filters
      const targetTime = camp.scheduled_at || camp.filters?.scheduled_at;
      if (!targetTime) continue;

      const targetTimeMs = new Date(targetTime).getTime();

      // Se a data/hora programada já foi alcançada
      if (targetTimeMs <= nowTime) {
        console.log(`[CAMPAIGN SCHEDULER] ⏰ Horário alcançado para a campanha "${camp.name}" (${camp.id}). Data agendada: ${targetTime}. Iniciando disparo...`);

        // Atualizar status para SENDING imediatamente para evitar dupla execução concorrente
        const { error: updateErr } = await supabaseAdmin
          .from('campaigns')
          .update({ 
            status: 'SENDING',
            updated_at: new Date().toISOString()
          })
          .eq('id', camp.id)
          .eq('status', 'SCHEDULED');

        if (updateErr) {
          console.error(`[CAMPAIGN SCHEDULER] Erro ao mudar status da campanha ${camp.id} para SENDING:`, updateErr.message);
          continue;
        }

        // Executar o envio da campanha
        processCampaign(camp.id, camp.org_id).catch(err => {
          console.error(`[CAMPAIGN SCHEDULER] Falha ao processar campanha ${camp.id}:`, err.message);
        });
      }
    }
  } catch (err: any) {
    console.error('[CAMPAIGN SCHEDULER] Erro global no worker:', err.message);
  } finally {
    isRunning = false;
  }
}

// Iniciar verificação no boot e rodar a cada 30 segundos
checkScheduledCampaigns();
const campaignSchedulerInterval = setInterval(checkScheduledCampaigns, 30_000);

console.log('[CAMPAIGN SCHEDULER] ✅ Worker de agendamento de campanhas em massa ativo (intervalo: 30s)');

export { campaignSchedulerInterval };
