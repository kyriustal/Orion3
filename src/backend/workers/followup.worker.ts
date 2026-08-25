// src/backend/workers/followup.worker.ts
// Worker que executa a cada minuto e dispara follow-ups agendados
// Protocolo: Step 1 (12h) → mensagem fixa; Step 2+ (24h) → mensagem contextualizada por cenário
// Intervalo de 5 segundos entre envios para números diferentes (evitar spam)

import { FollowupService, FOLLOWUP_MESSAGES, detectScenario, randomScheduledTime } from '../services/followup.service';
import { WhatsAppService } from '../services/whatsapp.service';
import { FacebookService } from '../services/facebook.service';
import { supabaseAdmin }   from '../config/supabase';

/** Helper: aguardar N milissegundos */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Extrai o cenário salvo no context_snapshot ou tenta detetar pelo histórico */
async function resolveScenario(item: any): Promise<number> {
  try {
    if (item.context_snapshot) {
      const parsed = JSON.parse(item.context_snapshot);
      if (typeof parsed.scenario === 'number') return parsed.scenario;
    }
    // Fallback: detetar pelo histórico
    const history = await FollowupService.fetchContext(item.org_id, item.customer_phone);
    return detectScenario(history);
  } catch {
    return 4; // Cenário padrão
  }
}

/** Construir a mensagem certa para o step atual */
async function buildFollowupMessage(item: any): Promise<string> {
  const step     = item.followup_step ?? 1;
  const name     = item.customer_name || '';
  const scenario = await resolveScenario(item);

  if (step === 100) {
    let subject = 'o seu processo de visto';
    try {
      if (item.context_snapshot) {
        const parsed = JSON.parse(item.context_snapshot);
        if (parsed.subject) subject = parsed.subject;
      }
    } catch {}
    const greeting = name ? `Olá, ${name}!` : 'Olá!';
    return `${greeting} Esperamos que tenha corrido tudo bem com a sua consultoria na On Visa (${subject}). 😊\n\nGostaríamos muito de saber: como foi o atendimento? A sua avaliação e feedback são muito importantes para nós! ⭐`;
  }

  if (step === 1) return FOLLOWUP_MESSAGES.step1(name);
  if (step === 2) return FOLLOWUP_MESSAGES.step2(name, scenario);
  if (step === 3) return FOLLOWUP_MESSAGES.step3(name, scenario);
  if (step === 4) return FOLLOWUP_MESSAGES.step4(name, scenario);
  return FOLLOWUP_MESSAGES.step5(name);
}

async function runFollowups() {
  try {
    const due = await FollowupService.getDue();
    if (due.length === 0) return;

    console.log(`[FOLLOWUP WORKER] ${due.length} follow-up(s) a processar...`);

    for (const item of due) {
      try {
        // ── 1. Verificar se o cliente respondeu depois do momento agendado ──
        const replied = await FollowupService.clientRepliedAfter(
          item.org_id,
          item.customer_phone,
          item.scheduled_at
        );

        if (replied) {
          console.log(`[FOLLOWUP] Cliente ${item.customer_phone} respondeu. Cancelando follow-up ${item.id}.`);
          await FollowupService.setStatus(item.id, 'cancelled');
          continue;
        }

        // ── 2. Buscar configurações da organização ─────────────────────────
        let accessToken   = '';
        let phoneNumberId = '';
        let pageId        = '';

        if (item.platform === 'whatsapp' || !item.platform) {
          const { data: waCfg } = await supabaseAdmin
            .from('whatsapp_config')
            .select('access_token, phone_number_id')
            .eq('org_id', item.org_id)
            .eq('is_active', true)
            .maybeSingle();

          if (!waCfg) {
            console.warn(`[FOLLOWUP] Nenhuma config WhatsApp para org ${item.org_id}. Ignorando.`);
            await FollowupService.setStatus(item.id, 'cancelled');
            continue;
          }
          accessToken   = waCfg.access_token;
          phoneNumberId = waCfg.phone_number_id;

        } else if (item.platform === 'facebook') {
          const { data: fbCfg } = await supabaseAdmin
            .from('facebook_config')
            .select('access_token, page_id')
            .eq('org_id', item.org_id)
            .eq('is_active', true)
            .maybeSingle();

          if (!fbCfg) {
            console.warn(`[FOLLOWUP] Nenhuma config Facebook para org ${item.org_id}. Ignorando.`);
            await FollowupService.setStatus(item.id, 'cancelled');
            continue;
          }
          accessToken = fbCfg.access_token;
          pageId      = fbCfg.page_id;

        } else if (item.platform === 'instagram') {
          const { data: igCfg } = await supabaseAdmin
            .from('instagram_config')
            .select('access_token, ig_user_id')
            .eq('org_id', item.org_id)
            .eq('is_active', true)
            .maybeSingle();

          if (!igCfg) {
            console.warn(`[FOLLOWUP] Nenhuma config Instagram para org ${item.org_id}. Ignorando.`);
            await FollowupService.setStatus(item.id, 'cancelled');
            continue;
          }
          accessToken = igCfg.access_token;
          pageId      = igCfg.ig_user_id;
        }

        // ── 3. Construir mensagem do step atual ───────────────────────────
        const message = await buildFollowupMessage(item);
        const currentStep = item.followup_step ?? 1;

        console.log(`[FOLLOWUP] Enviando step ${currentStep} para ${item.customer_phone} (${item.platform}): "${message.substring(0, 60)}..."`);

        // ── 4. Enviar mensagem pelo canal correto ─────────────────────────
        let sent = false;
        if (item.platform === 'whatsapp' || !item.platform) {
          const sentId = await WhatsAppService.sendTextMessage(
            phoneNumberId,
            item.customer_phone,
            message,
            accessToken
          );
          sent = !!sentId;
        } else if (item.platform === 'facebook' || item.platform === 'instagram') {
          await FacebookService.sendMessage(
            pageId,
            item.customer_phone,
            message,
            accessToken
          );
          sent = true;
        }

        if (!sent) {
          console.warn(`[FOLLOWUP] Falha ao enviar mensagem para ${item.customer_phone}. Mantendo pendente para próxima tentativa.`);
          // Não cancelar — tentar novamente na próxima volta do worker
          continue;
        }

        // ── 5. Persistir mensagem no histórico ────────────────────────────
        await supabaseAdmin.from('conversation_history').insert({
          org_id:         item.org_id,
          customer_phone: item.customer_phone,
          sender:         'bot',
          text:           message,
          metadata:       { platform: item.platform || 'whatsapp', followup_id: item.id, followup_step: currentStep, type: 'followup' },
        });

        // ── 6. Marcar como enviado ────────────────────────────────────────
        await FollowupService.setStatus(item.id, 'sent');
        console.log(`[FOLLOWUP] ✅ Step ${currentStep} enviado para ${item.customer_phone}`);

        // ── 7. Agendar próximo follow-up (se for fluxo de vendas step < 5) ───
        // Limite: 5 follow-ups máximos (12h → +24h → +24h → +48h → +72h)
        const MAX_STEPS = 5;
        if (currentStep === 100) {
          console.log(`[FOLLOWUP] ⭐ Avaliação pós-atendimento enviada para ${item.customer_phone}. Sequência concluída com sucesso.`);
        } else if (currentStep < MAX_STEPS) {
          const nextStep = currentStep + 1;

          // Intervalos progressivos: step1→24h, step2→24h, step3→48h, step4→72h
          const delayHours = nextStep <= 2 ? 24 : nextStep === 3 ? 48 : 72;
          const nextScheduledAt = randomScheduledTime(delayHours);

          // Obter cenário atual para preservar contexto
          const scenario = await resolveScenario(item);
          const contextSnapshot = JSON.stringify({
            scenario,
            lastBotReply: message.substring(0, 500)
          });

          const { error: nextErr } = await supabaseAdmin
            .from('followup_schedules')
            .insert({
              org_id:           item.org_id,
              customer_phone:   item.customer_phone,
              platform:         item.platform || 'whatsapp',
              scheduled_at:     nextScheduledAt.toISOString(),
              status:           'pending',
              followup_step:    nextStep,
              context_snapshot: contextSnapshot,
              customer_name:    item.customer_name,
              last_message_id:  item.last_message_id,
            });

          if (nextErr) {
            console.warn(`[FOLLOWUP] Aviso ao agendar próximo follow-up (step ${nextStep}) para ${item.customer_phone}:`, nextErr.message);
          } else {
            console.log(`[FOLLOWUP] 📅 Próximo follow-up (step ${nextStep}) agendado para ${item.customer_phone} em ${nextScheduledAt.toISOString()}`);
          }
        } else {
          console.log(`[FOLLOWUP] ⏹ Limite de ${MAX_STEPS} follow-ups atingido para ${item.customer_phone}. Sequência encerrada.`);
        }

        // ── 8. Intervalo de 5 segundos entre envios de números diferentes ─
        await sleep(5000);

      } catch (itemErr: any) {
        console.error(`[FOLLOWUP] Erro no item ${item.id}:`, itemErr.message);
      }
    }
  } catch (err: any) {
    console.error('[FOLLOWUP WORKER] Erro global:', err.message);
  }
}

// Executar imediatamente ao iniciar, depois a cada 60 segundos
runFollowups();
const workerInterval = setInterval(runFollowups, 60_000);

console.log('[FOLLOWUP WORKER] ✅ Worker de follow-up iniciado (protocolo 12h/24h/48h/72h, intervalo: 60s)');

export { workerInterval };
