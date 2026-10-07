// src/backend/workers/followup.worker.ts
// Worker que executa a cada minuto e dispara follow-ups agendados
// Protocolo Padrão: Step 1 (12h) → mensagem fixa; Step 2+ (24h) → mensagem contextualizada por cenário
// Protocolo de Objeções: mensagens específicas B2C/B2B com botões interativos
// Intervalo de 5 segundos entre envios para números diferentes (evitar spam)

import {
  FollowupService,
  FOLLOWUP_MESSAGES,
  OBJECTION_PROTOCOLS,
  detectScenario,
  inferServiceAndBenefit,
  randomScheduledTime,
  fillPlaceholders,
  getObjectionScheduledDate,
  isConversationEndedInFarewell,
  formatGreeting,
} from '../services/followup.service';
import { WhatsAppService } from '../services/whatsapp.service';
import { FacebookService } from '../services/facebook.service';
import { supabaseAdmin }   from '../config/supabase';

/** Helper: aguardar N milissegundos */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Extrai o cenário pelo histórico (recente) ou pelo snapshot salvo */
async function resolveScenario(item: any): Promise<number> {
  try {
    const history = await FollowupService.fetchContext(item.org_id, item.customer_phone);
    if (history && history.length > 0) {
      const detected = detectScenario(history);
      if (detected) return detected;
    }
    if (item.context_snapshot) {
      const parsed = JSON.parse(item.context_snapshot);
      if (typeof parsed.scenario === 'number') return parsed.scenario;
    }
    return 4; // Cenário padrão
  } catch {
    return 4; // Cenário padrão
  }
}

/** Verifica se o item é um follow-up de objeção */
function isObjectionFlow(item: any): boolean {
  try {
    if (!item.context_snapshot) return false;
    const parsed = JSON.parse(item.context_snapshot);
    return parsed.flow === 'objection';
  } catch {
    return false;
  }
}

/** Construir a mensagem certa para o step atual (fluxo padrão de vendas condicionado ao contexto) */
async function buildFollowupMessage(item: any): Promise<string> {
  const step     = item.followup_step ?? 1;
  const name     = item.customer_name || '';
  const scenario = await resolveScenario(item);
  const history  = await FollowupService.fetchContext(item.org_id, item.customer_phone);

  let orgName = 'nossa equipe';
  let orgData: any = null;
  try {
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('name, social_object, product_description')
      .eq('id', item.org_id)
      .maybeSingle();
    if (org) {
      orgData = org;
      if (org.name) orgName = org.name;
    }
  } catch {}

  const { service, benefit } = inferServiceAndBenefit(history, orgData);
  const context = { service, benefit, orgName };

  if (step === 100) {
    let subject = service;
    try {
      if (item.context_snapshot) {
        const parsed = JSON.parse(item.context_snapshot);
        if (parsed.subject) subject = parsed.subject;
      }
    } catch {}
    const greeting = formatGreeting(name);
    return `${greeting} Esperamos que tenha corrido tudo bem com a sua consultoria na ${orgName} (${subject}). 😊\n\nGostaríamos muito de saber: como foi o atendimento? A sua avaliação e feedback são muito importantes para nós! ⭐`;
  }

  if (step === 1) return FOLLOWUP_MESSAGES.step1(name, scenario, context);
  if (step === 2) return FOLLOWUP_MESSAGES.step2(name, scenario, context);
  if (step === 3) return FOLLOWUP_MESSAGES.step3(name, scenario, context);
  if (step === 4) return FOLLOWUP_MESSAGES.step4(name, scenario, context);
  return FOLLOWUP_MESSAGES.step5(name, scenario, context);
}

/** Constrói a mensagem e botões para follow-ups de objeção (B2C/B2B) */
function buildObjectionMessage(item: any): {
  bodyText: string;
  buttons: { id: string; title: string }[];
} | null {
  try {
    const parsed = JSON.parse(item.context_snapshot);
    const audience: 'b2c' | 'b2b' = parsed.audience || 'b2c';
    const objectionType: string = parsed.objectionType;

    if (!objectionType) return null;

    const protocolConfig = OBJECTION_PROTOCOLS[audience]?.[objectionType as keyof typeof OBJECTION_PROTOCOLS['b2c']];
    if (!protocolConfig) return null;

    // Preencher placeholders com dados do contexto
    const bodyText = fillPlaceholders(protocolConfig.textTemplate, {
      clientName:       parsed.customerName || item.customer_name || '',
      botName:          parsed.botName || 'Assistente',
      productOrService: parsed.product || parsed.service || 'nosso serviço',
      service:          parsed.service || 'nosso serviço',
      benefit:          parsed.benefit || 'o seu processo',
    });

    const buttons = protocolConfig.buttons.map(b => ({
      id: b.id,
      title: b.buttonTitle,
    }));

    return { bodyText, buttons };
  } catch (err: any) {
    console.warn('[FOLLOWUP WORKER] Erro ao construir mensagem de objeção:', err.message);
    return null;
  }
}

async function runFollowups() {
  try {
    const due = await FollowupService.getDue();
    if (due.length === 0) return;

    console.log(`[FOLLOWUP WORKER] ${due.length} follow-up(s) a processar...`);

    for (const item of due) {
      try {
        // ── 0. Identificar se é fluxo de objeção ou padrão ────────────────
        const objectionFlow = isObjectionFlow(item);

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

        // ── 1b. REGRA 1 (re-check): Verificar se o cliente adquiriu agendamento desde que o follow-up foi marcado ──
        const hasBooking = await FollowupService.hasActiveBooking(item.org_id, item.customer_phone);
        if (hasBooking) {
          console.log(`[FOLLOWUP] ℹ️ Cliente ${item.customer_phone} já possui agendamento. Follow-up ${item.id} cancelado no envio.`);
          await FollowupService.setStatus(item.id, 'cancelled');
          continue;
        }

        // ── 1c. REGRA 2 (re-check): Verificar se a conversa terminou em despedida desde que o follow-up foi agendado ──
        const history = await FollowupService.fetchContext(item.org_id, item.customer_phone);
        if (isConversationEndedInFarewell(history)) {
          console.log(`[FOLLOWUP] ℹ️ Conversa com ${item.customer_phone} terminou em despedida. Follow-up ${item.id} cancelado no envio.`);
          await FollowupService.setStatus(item.id, 'cancelled');
          await FollowupService.concludeConversation({
            orgId: item.org_id,
            phone: item.customer_phone,
            platform: item.platform || 'whatsapp',
            customerName: item.customer_name,
            reason: 'farewell_detected',
          });
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

        // ═══════════════════════════════════════════════════════════════════
        // ── FLUXO DE OBJEÇÃO (B2C / B2B com botões interativos) ──────────
        // ═══════════════════════════════════════════════════════════════════
        if (objectionFlow) {
          const objMsg = buildObjectionMessage(item);
          const currentStep = item.followup_step ?? 1;

          if (!objMsg) {
            console.warn(`[FOLLOWUP] Não foi possível construir mensagem de objeção para ${item.customer_phone}. Cancelando.`);
            await FollowupService.setStatus(item.id, 'cancelled');
            continue;
          }

          console.log(`[FOLLOWUP] 🎯 Enviando objeção step ${currentStep} para ${item.customer_phone}: "${objMsg.bodyText.substring(0, 60)}..."`);

          // Enviar com botões interativos (WhatsApp) ou como texto (Facebook/Instagram)
          let sent = false;
          if (item.platform === 'whatsapp' || !item.platform) {
            const sentId = await WhatsAppService.sendInteractiveButtons(
              phoneNumberId,
              item.customer_phone,
              objMsg.bodyText,
              objMsg.buttons,
              accessToken
            );
            sent = !!sentId;
          } else if (item.platform === 'facebook' || item.platform === 'instagram') {
            // Facebook e Instagram não suportam botões interativos da mesma forma; enviar como texto com emojis
            const buttonLines = objMsg.buttons.map((b, idx) => `[Botão ${idx + 1}] ${b.title}`).join('\n');
            const fullText = `${objMsg.bodyText}\n\n${buttonLines}`;
            await FacebookService.sendMessage(pageId, item.customer_phone, fullText, accessToken);
            sent = true;
          }

          if (!sent) {
            console.warn(`[FOLLOWUP] Falha ao enviar objeção para ${item.customer_phone}. Mantendo pendente.`);
            continue;
          }

          // Persistir no histórico
          const buttonLines = objMsg.buttons.map((b, idx) => `[Botão ${idx + 1}] ${b.title}`).join('\n');
          const fullTextForHistory = `${objMsg.bodyText}\n\n${buttonLines}`;
          await supabaseAdmin.from('conversation_history').insert({
            org_id:         item.org_id,
            customer_phone: item.customer_phone,
            sender:         'bot',
            text:           fullTextForHistory,
            metadata:       { platform: item.platform || 'whatsapp', followup_id: item.id, followup_step: currentStep, type: 'followup_objection' },
          });

          await FollowupService.setStatus(item.id, 'sent');
          console.log(`[FOLLOWUP] ✅ Objeção step ${currentStep} enviado para ${item.customer_phone}`);

          // ── Agendar próximo step para objeções multi-step ──────────────
          // B2C budget_prepare: step 1 (7d) → step 2 (30d) → step 3 (90d) = 3 steps
          // Todos os outros tipos de objeção têm apenas 1 step
          try {
            const parsed = JSON.parse(item.context_snapshot);
            const audience: 'b2c' | 'b2b' = parsed.audience || 'b2c';
            const objectionType: string = parsed.objectionType;

            const maxObjSteps = (audience === 'b2c' && objectionType === 'budget_prepare') ? 3 : 1;

            if (currentStep < maxObjSteps) {
              const nextStep = currentStep + 1;
              const nextScheduledAt = getObjectionScheduledDate(audience, objectionType, nextStep);

              const nextContext = JSON.stringify({
                ...parsed,
                step: nextStep,
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
                  context_snapshot: nextContext,
                  customer_name:    item.customer_name,
                  last_message_id:  item.last_message_id,
                });

              if (nextErr) {
                console.warn(`[FOLLOWUP] Aviso ao agendar próximo step de objeção (step ${nextStep}) para ${item.customer_phone}:`, nextErr.message);
              } else {
                console.log(`[FOLLOWUP] 📅 Próximo follow-up de objeção (${audience}/${objectionType} step ${nextStep}) agendado para ${item.customer_phone} em ${nextScheduledAt.toISOString()}`);
              }
            } else {
              console.log(`[FOLLOWUP] ⏹ Sequência de objeção (${audience}/${objectionType}) concluída para ${item.customer_phone}.`);
              await FollowupService.concludeConversation({
                orgId:        item.org_id,
                phone:        item.customer_phone,
                platform:     item.platform || 'whatsapp',
                customerName: item.customer_name,
                reason:       `objection_completed (${audience}/${objectionType})`,
              });
            }
          } catch (ctxErr: any) {
            console.warn(`[FOLLOWUP] Erro ao processar próximo step de objeção para ${item.customer_phone}:`, ctxErr.message);
          }

          await sleep(5000);
          continue;
        }

        // ═══════════════════════════════════════════════════════════════════
        // ── FLUXO PADRÃO DE VENDAS (steps 1-5 com mensagens fixas) ────────
        // ═══════════════════════════════════════════════════════════════════
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
          await FollowupService.concludeConversation({
            orgId:        item.org_id,
            phone:        item.customer_phone,
            platform:     item.platform || 'whatsapp',
            customerName: item.customer_name,
            reason:       'review_completed (step 100)',
          });
        } else if (currentStep < MAX_STEPS) {
          const nextStep = currentStep + 1;

          // Intervalos progressivos: step1→24h, step2→24h, step3→48h, step4→72h
          const delayHours = nextStep <= 2 ? 24 : nextStep === 3 ? 48 : 72;
          const nextScheduledAt = randomScheduledTime(delayHours);

          // Obter cenário atual para preservar contexto
          const scenario = await resolveScenario(item);
          const contextSnapshot = JSON.stringify({
            flow: 'standard',
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
          // Última mensagem do follow-up padrão (step 5) enviada -> Dar por concluído!
          await FollowupService.concludeConversation({
            orgId:        item.org_id,
            phone:        item.customer_phone,
            platform:     item.platform || 'whatsapp',
            customerName: item.customer_name,
            reason:       `standard_followup_completed (step ${currentStep}/${MAX_STEPS})`,
          });
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

console.log('[FOLLOWUP WORKER] ✅ Worker de follow-up iniciado (protocolo padrão 12h/24h/48h/72h + objeções B2C/B2B, intervalo: 60s)');

export { workerInterval };
