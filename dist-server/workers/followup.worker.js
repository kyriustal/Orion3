"use strict";
// src/backend/workers/followup.worker.ts
// Worker que executa a cada minuto e dispara follow-ups agendados
// Fluxo padrão: Step 1 (configurável) → Step 2 (configurável, inativo por defeito) → fim silencioso
// Protocolo de Objeções: mensagens específicas B2C/B2B com botões interativos (inalterado)
// Intervalo de 5 segundos entre envios para números diferentes (evitar spam)
Object.defineProperty(exports, "__esModule", { value: true });
exports.workerInterval = void 0;
const followup_service_1 = require("../services/followup.service");
const followup_routes_1 = require("../api/followup.routes");
const whatsapp_service_1 = require("../services/whatsapp.service");
const facebook_service_1 = require("../services/facebook.service");
const supabase_1 = require("../config/supabase");
/** Cache em memória das configurações por org (refrescado a cada ciclo) */
const orgSettingsCache = new Map();
/** Carregar (ou usar cache de) definições de follow-up da org */
async function getOrgFollowupSettings(orgId) {
    if (orgSettingsCache.has(orgId))
        return orgSettingsCache.get(orgId);
    try {
        const { data } = await supabase_1.supabaseAdmin
            .from('followup_settings')
            .select('*')
            .eq('org_id', orgId)
            .maybeSingle();
        const settings = { ...followup_routes_1.FOLLOWUP_SETTINGS_DEFAULTS, ...(data ?? {}) };
        orgSettingsCache.set(orgId, settings);
        // TTL de 5 minutos
        setTimeout(() => orgSettingsCache.delete(orgId), 5 * 60 * 1000);
        return settings;
    }
    catch {
        return { ...followup_routes_1.FOLLOWUP_SETTINGS_DEFAULTS };
    }
}
/** Verifica se o momento atual está dentro da janela de envio configurada */
function isWithinSendWindow(settings) {
    const now = new Date();
    const luandaOffset = 60; // WAT = UTC+1
    const luandaMs = now.getTime() + (luandaOffset - now.getTimezoneOffset()) * 60000;
    const luanda = new Date(luandaMs);
    const currentDay = luanda.getDay(); // 0=Dom .. 6=Sab
    const allowedDays = Array.isArray(settings.allowed_days) ? settings.allowed_days : [1, 2, 3, 4, 5, 6];
    if (!allowedDays.includes(currentDay))
        return false;
    const currentHHMM = `${String(luanda.getHours()).padStart(2, '0')}:${String(luanda.getMinutes()).padStart(2, '0')}`;
    const start = settings.send_window_start || '09:00';
    const end = settings.send_window_end || '20:00';
    return currentHHMM >= start && currentHHMM <= end;
}
/** Helper: aguardar N milissegundos */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/** Extrai o cenário pelo histórico (recente) ou pelo snapshot salvo */
async function resolveScenario(item) {
    try {
        const history = await followup_service_1.FollowupService.fetchContext(item.org_id, item.customer_phone);
        if (history && history.length > 0) {
            const detected = (0, followup_service_1.detectScenario)(history);
            if (detected)
                return detected;
        }
        if (item.context_snapshot) {
            const parsed = JSON.parse(item.context_snapshot);
            if (typeof parsed.scenario === 'number')
                return parsed.scenario;
        }
        return 4; // Cenário padrão
    }
    catch {
        return 4; // Cenário padrão
    }
}
/** Verifica se o item é um follow-up de objeção */
function isObjectionFlow(item) {
    try {
        if (!item.context_snapshot)
            return false;
        const parsed = JSON.parse(item.context_snapshot);
        return parsed.flow === 'objection';
    }
    catch {
        return false;
    }
}
/** Constrói a mensagem certa para o step atual, respeitando configurações da org */
async function buildFollowupMessage(item, settings) {
    const step = item.followup_step ?? 1;
    const name = item.customer_name || '';
    const scenario = await resolveScenario(item);
    const history = await followup_service_1.FollowupService.fetchContext(item.org_id, item.customer_phone);
    let orgName = 'nossa equipa';
    let orgData = null;
    try {
        const { data: org } = await supabase_1.supabaseAdmin
            .from('organizations')
            .select('name, social_object, product_description')
            .eq('id', item.org_id)
            .maybeSingle();
        if (org) {
            orgData = org;
            if (org.name)
                orgName = org.name;
        }
    }
    catch { }
    const { service, benefit } = (0, followup_service_1.inferServiceAndBenefit)(history, orgData);
    const context = { service, benefit, orgName };
    // Step 100: avaliação pós-atendimento (mantido inalterado)
    if (step === 100) {
        let subject = service;
        try {
            if (item.context_snapshot) {
                const parsed = JSON.parse(item.context_snapshot);
                if (parsed.subject)
                    subject = parsed.subject;
            }
        }
        catch { }
        const greeting = (0, followup_service_1.formatGreeting)(name);
        return `${greeting} Esperamos que tenha corrido tudo bem com a sua consultoria na ${orgName} (${subject}). 😊\n\nGostaríamos muito de saber: como foi o atendimento? A sua avaliação e feedback são muito importantes para nós! ⭐`;
    }
    // Step 1: verificar se está ativo e se existe mensagem personalizada
    if (step === 1) {
        if (settings.step1_enabled === false)
            return ''; // step desativado
        if (settings.step1_message && settings.step1_message.trim()) {
            // Substituir variáveis na mensagem personalizada
            const firstName = (0, followup_service_1.cleanGreetingName)(name);
            return settings.step1_message
                .replace(/\{nome\}/gi, firstName || 'Cliente')
                .replace(/\{servico\}/gi, service)
                .replace(/\{empresa\}/gi, orgName);
        }
        return followup_service_1.FOLLOWUP_MESSAGES.step1(name, scenario, context);
    }
    // Step 2: verificar se está ativo e se existe mensagem personalizada
    if (step === 2) {
        if (settings.step2_enabled === false)
            return ''; // step desativado
        if (settings.step2_message && settings.step2_message.trim()) {
            const firstName = (0, followup_service_1.cleanGreetingName)(name);
            return settings.step2_message
                .replace(/\{nome\}/gi, firstName || 'Cliente')
                .replace(/\{servico\}/gi, service)
                .replace(/\{empresa\}/gi, orgName);
        }
        return followup_service_1.FOLLOWUP_MESSAGES.step2(name, scenario, context);
    }
    return '';
}
/** Constrói a mensagem e botões para follow-ups de objeção (B2C/B2B) */
function buildObjectionMessage(item) {
    try {
        const parsed = JSON.parse(item.context_snapshot);
        const audience = parsed.audience || 'b2c';
        const objectionType = parsed.objectionType;
        if (!objectionType)
            return null;
        const protocolConfig = followup_service_1.OBJECTION_PROTOCOLS[audience]?.[objectionType];
        if (!protocolConfig)
            return null;
        // Preencher placeholders com dados do contexto
        const bodyText = (0, followup_service_1.fillPlaceholders)(protocolConfig.textTemplate, {
            clientName: parsed.customerName || item.customer_name || '',
            botName: parsed.botName || 'Assistente',
            productOrService: parsed.product || parsed.service || 'nosso serviço',
            service: parsed.service || 'nosso serviço',
            benefit: parsed.benefit || 'o seu processo',
        });
        const buttons = protocolConfig.buttons.map(b => ({
            id: b.id,
            title: b.buttonTitle,
        }));
        return { bodyText, buttons };
    }
    catch (err) {
        console.warn('[FOLLOWUP WORKER] Erro ao construir mensagem de objeção:', err.message);
        return null;
    }
}
async function runFollowups() {
    try {
        const due = await followup_service_1.FollowupService.getDue();
        if (due.length === 0)
            return;
        console.log(`[FOLLOWUP WORKER] ${due.length} follow-up(s) a processar...`);
        for (const item of due) {
            try {
                // ── 0. Carregar definições da org para este follow-up ─────────────
                const orgSettings = await getOrgFollowupSettings(item.org_id);
                // Se os follow-ups estão globalmente desativados para a org, cancelar
                if (orgSettings.enabled === false) {
                    console.log(`[FOLLOWUP] 🚫 Follow-ups desativados para a org ${item.org_id}. Cancelando ${item.id}.`);
                    await followup_service_1.FollowupService.setStatus(item.id, 'cancelled');
                    continue;
                }
                // ── 0b. Verificar janela de envio (apenas fluxo padrão) ───────────
                const objectionFlow = isObjectionFlow(item);
                if (!objectionFlow && !isWithinSendWindow(orgSettings)) {
                    // Não cancelar — reagendar para dentro da janela automaticamente
                    console.log(`[FOLLOWUP] ⏰ Fora da janela de envio (${orgSettings.send_window_start}–${orgSettings.send_window_end}). Follow-up ${item.id} adiado.`);
                    continue;
                }
                // ── 1. Verificar se o cliente respondeu depois do momento agendado ──
                const replied = await followup_service_1.FollowupService.clientRepliedAfter(item.org_id, item.customer_phone, item.scheduled_at);
                if (replied) {
                    console.log(`[FOLLOWUP] Cliente ${item.customer_phone} respondeu. Cancelando follow-up ${item.id}.`);
                    await followup_service_1.FollowupService.setStatus(item.id, 'cancelled');
                    continue;
                }
                // ── 1b. REGRA 1 (re-check): Verificar se o cliente possui agendamento confirmado/ativo ──
                const hasBooking = await followup_service_1.FollowupService.hasActiveBooking(item.org_id, item.customer_phone);
                if (hasBooking) {
                    console.log(`[FOLLOWUP] 🚫 Cliente ${item.customer_phone} já possui agendamento confirmado/ativo. Follow-up ${item.id} cancelado no envio.`);
                    await followup_service_1.FollowupService.setStatus(item.id, 'cancelled');
                    await followup_service_1.FollowupService.cancelPendingForPhone(item.org_id, item.customer_phone);
                    continue;
                }
                // ── 1c. REGRA 1b (re-check): Verificar se a conversa terminou com agendamento ──
                const history = await followup_service_1.FollowupService.fetchContext(item.org_id, item.customer_phone);
                if ((0, followup_service_1.hasConversationEndedWithBooking)(history)) {
                    console.log(`[FOLLOWUP] 🚫 Conversa com ${item.customer_phone} terminou com agendamento confirmado no chat. Follow-up ${item.id} cancelado no envio.`);
                    await followup_service_1.FollowupService.setStatus(item.id, 'cancelled');
                    await followup_service_1.FollowupService.cancelPendingForPhone(item.org_id, item.customer_phone);
                    await followup_service_1.FollowupService.concludeConversation({
                        orgId: item.org_id,
                        phone: item.customer_phone,
                        platform: item.platform || 'whatsapp',
                        customerName: item.customer_name,
                        reason: 'booking_completed_in_chat',
                    });
                    continue;
                }
                // ── 1d. REGRA 2 (re-check): Verificar se a conversa terminou em despedida desde que o follow-up foi agendado ──
                if ((0, followup_service_1.isConversationEndedInFarewell)(history)) {
                    console.log(`[FOLLOWUP] 🚫 Conversa com ${item.customer_phone} terminou em despedida. Follow-up ${item.id} cancelado no envio.`);
                    await followup_service_1.FollowupService.setStatus(item.id, 'cancelled');
                    await followup_service_1.FollowupService.cancelPendingForPhone(item.org_id, item.customer_phone);
                    await followup_service_1.FollowupService.concludeConversation({
                        orgId: item.org_id,
                        phone: item.customer_phone,
                        platform: item.platform || 'whatsapp',
                        customerName: item.customer_name,
                        reason: 'farewell_detected',
                    });
                    continue;
                }
                // ── 2. Buscar configurações da organização ─────────────────────────
                let accessToken = '';
                let phoneNumberId = '';
                let pageId = '';
                if (item.platform === 'whatsapp' || !item.platform) {
                    const { data: waCfg } = await supabase_1.supabaseAdmin
                        .from('whatsapp_config')
                        .select('access_token, phone_number_id')
                        .eq('org_id', item.org_id)
                        .eq('is_active', true)
                        .maybeSingle();
                    if (!waCfg) {
                        console.warn(`[FOLLOWUP] Nenhuma config WhatsApp para org ${item.org_id}. Ignorando.`);
                        await followup_service_1.FollowupService.setStatus(item.id, 'cancelled');
                        continue;
                    }
                    accessToken = waCfg.access_token;
                    phoneNumberId = waCfg.phone_number_id;
                }
                else if (item.platform === 'facebook') {
                    const { data: fbCfg } = await supabase_1.supabaseAdmin
                        .from('facebook_config')
                        .select('access_token, page_id')
                        .eq('org_id', item.org_id)
                        .eq('is_active', true)
                        .maybeSingle();
                    if (!fbCfg) {
                        console.warn(`[FOLLOWUP] Nenhuma config Facebook para org ${item.org_id}. Ignorando.`);
                        await followup_service_1.FollowupService.setStatus(item.id, 'cancelled');
                        continue;
                    }
                    accessToken = fbCfg.access_token;
                    pageId = fbCfg.page_id;
                }
                else if (item.platform === 'instagram') {
                    const { data: igCfg } = await supabase_1.supabaseAdmin
                        .from('instagram_config')
                        .select('access_token, ig_user_id')
                        .eq('org_id', item.org_id)
                        .eq('is_active', true)
                        .maybeSingle();
                    if (!igCfg) {
                        console.warn(`[FOLLOWUP] Nenhuma config Instagram para org ${item.org_id}. Ignorando.`);
                        await followup_service_1.FollowupService.setStatus(item.id, 'cancelled');
                        continue;
                    }
                    accessToken = igCfg.access_token;
                    pageId = igCfg.ig_user_id;
                }
                // ═══════════════════════════════════════════════════════════════════
                // ── FLUXO DE OBJEÇÃO (B2C / B2B com botões interativos) ──────────
                // ═══════════════════════════════════════════════════════════════════
                if (objectionFlow) {
                    const objMsg = buildObjectionMessage(item);
                    const currentStep = item.followup_step ?? 1;
                    if (!objMsg) {
                        console.warn(`[FOLLOWUP] Não foi possível construir mensagem de objeção para ${item.customer_phone}. Cancelando.`);
                        await followup_service_1.FollowupService.setStatus(item.id, 'cancelled');
                        continue;
                    }
                    console.log(`[FOLLOWUP] 🎯 Enviando objeção step ${currentStep} para ${item.customer_phone}: "${objMsg.bodyText.substring(0, 60)}..."`);
                    // Enviar com botões interativos (WhatsApp) ou como texto (Facebook/Instagram)
                    let sent = false;
                    if (item.platform === 'whatsapp' || !item.platform) {
                        const sentId = await whatsapp_service_1.WhatsAppService.sendInteractiveButtons(phoneNumberId, item.customer_phone, objMsg.bodyText, objMsg.buttons, accessToken);
                        sent = !!sentId;
                    }
                    else if (item.platform === 'facebook' || item.platform === 'instagram') {
                        // Facebook e Instagram não suportam botões interativos da mesma forma; enviar como texto com emojis
                        const buttonLines = objMsg.buttons.map((b, idx) => `[Botão ${idx + 1}] ${b.title}`).join('\n');
                        const fullText = `${objMsg.bodyText}\n\n${buttonLines}`;
                        await facebook_service_1.FacebookService.sendMessage(pageId, item.customer_phone, fullText, accessToken);
                        sent = true;
                    }
                    if (!sent) {
                        console.warn(`[FOLLOWUP] Falha ao enviar objeção para ${item.customer_phone}. Mantendo pendente.`);
                        continue;
                    }
                    // Persistir no histórico
                    const buttonLines = objMsg.buttons.map((b, idx) => `[Botão ${idx + 1}] ${b.title}`).join('\n');
                    const fullTextForHistory = `${objMsg.bodyText}\n\n${buttonLines}`;
                    await supabase_1.supabaseAdmin.from('conversation_history').insert({
                        org_id: item.org_id,
                        customer_phone: item.customer_phone,
                        sender: 'bot',
                        text: fullTextForHistory,
                        metadata: { platform: item.platform || 'whatsapp', followup_id: item.id, followup_step: currentStep, type: 'followup_objection' },
                    });
                    await followup_service_1.FollowupService.setStatus(item.id, 'sent');
                    console.log(`[FOLLOWUP] ✅ Objeção step ${currentStep} enviado para ${item.customer_phone}`);
                    // ── Agendar próximo step para objeções multi-step ──────────────
                    // B2C budget_prepare: step 1 (7d) → step 2 (30d) → step 3 (90d) = 3 steps
                    // Todos os outros tipos de objeção têm apenas 1 step
                    try {
                        const parsed = JSON.parse(item.context_snapshot);
                        const audience = parsed.audience || 'b2c';
                        const objectionType = parsed.objectionType;
                        const maxObjSteps = (audience === 'b2c' && objectionType === 'budget_prepare') ? 3 : 1;
                        if (currentStep < maxObjSteps) {
                            const nextStep = currentStep + 1;
                            const nextScheduledAt = (0, followup_service_1.getObjectionScheduledDate)(audience, objectionType, nextStep);
                            const nextContext = JSON.stringify({
                                ...parsed,
                                step: nextStep,
                            });
                            const { error: nextErr } = await supabase_1.supabaseAdmin
                                .from('followup_schedules')
                                .insert({
                                org_id: item.org_id,
                                customer_phone: item.customer_phone,
                                platform: item.platform || 'whatsapp',
                                scheduled_at: nextScheduledAt.toISOString(),
                                status: 'pending',
                                followup_step: nextStep,
                                context_snapshot: nextContext,
                                customer_name: item.customer_name,
                                last_message_id: item.last_message_id,
                            });
                            if (nextErr) {
                                console.warn(`[FOLLOWUP] Aviso ao agendar próximo step de objeção (step ${nextStep}) para ${item.customer_phone}:`, nextErr.message);
                            }
                            else {
                                console.log(`[FOLLOWUP] 📅 Próximo follow-up de objeção (${audience}/${objectionType} step ${nextStep}) agendado para ${item.customer_phone} em ${nextScheduledAt.toISOString()}`);
                            }
                        }
                        else {
                            console.log(`[FOLLOWUP] ⏹ Sequência de objeção (${audience}/${objectionType}) concluída para ${item.customer_phone}.`);
                            await followup_service_1.FollowupService.concludeConversation({
                                orgId: item.org_id,
                                phone: item.customer_phone,
                                platform: item.platform || 'whatsapp',
                                customerName: item.customer_name,
                                reason: `objection_completed (${audience}/${objectionType})`,
                            });
                        }
                    }
                    catch (ctxErr) {
                        console.warn(`[FOLLOWUP] Erro ao processar próximo step de objeção para ${item.customer_phone}:`, ctxErr.message);
                    }
                    await sleep(5000);
                    continue;
                }
                // ═══════════════════════════════════════════════════════════════════
                // ── FLUXO PADRÃO DE VENDAS (steps 1-5 com mensagens fixas) ────────
                // ═══════════════════════════════════════════════════════════════════
                const message = await buildFollowupMessage(item, orgSettings);
                const currentStep = item.followup_step ?? 1;
                // ── Step desativado (mensagem vazia) → cancelar silenciosamente ─────
                if (!message || message.trim() === '') {
                    console.log(`[FOLLOWUP] ⏭ Step ${currentStep} para ${item.customer_phone} desativado (mensagem vazia). Cancelando silenciosamente.`);
                    await followup_service_1.FollowupService.setStatus(item.id, 'cancelled');
                    await followup_service_1.FollowupService.cancelPendingForPhone(item.org_id, item.customer_phone);
                    await sleep(5000);
                    continue;
                }
                console.log(`[FOLLOWUP] Enviando step ${currentStep} para ${item.customer_phone} (${item.platform}): "${message.substring(0, 60)}..."`);
                // ── 4. Enviar mensagem pelo canal correto ─────────────────────────
                let sent = false;
                if (item.platform === 'whatsapp' || !item.platform) {
                    const sentId = await whatsapp_service_1.WhatsAppService.sendTextMessage(phoneNumberId, item.customer_phone, message, accessToken);
                    sent = !!sentId;
                }
                else if (item.platform === 'facebook' || item.platform === 'instagram') {
                    await facebook_service_1.FacebookService.sendMessage(pageId, item.customer_phone, message, accessToken);
                    sent = true;
                }
                if (!sent) {
                    console.warn(`[FOLLOWUP] Falha ao enviar mensagem para ${item.customer_phone}. Mantendo pendente para próxima tentativa.`);
                    // Não cancelar — tentar novamente na próxima volta do worker
                    continue;
                }
                // ── 5. Persistir mensagem no histórico ────────────────────────────
                await supabase_1.supabaseAdmin.from('conversation_history').insert({
                    org_id: item.org_id,
                    customer_phone: item.customer_phone,
                    sender: 'bot',
                    text: message,
                    metadata: { platform: item.platform || 'whatsapp', followup_id: item.id, followup_step: currentStep, type: 'followup' },
                });
                // ── 6. Marcar como enviado ────────────────────────────────────────
                await followup_service_1.FollowupService.setStatus(item.id, 'sent');
                console.log(`[FOLLOWUP] ✅ Step ${currentStep} enviado para ${item.customer_phone}`);
                // ── 7. Agendar próximo follow-up ou encerrar silenciosamente ────────────────
                // Fluxo padrão: máximo 2 steps (Step 1 →12h, Step 2 →24h → encerramento cordial)
                const MAX_STEPS = 2;
                if (currentStep === 100) {
                    console.log(`[FOLLOWUP] ⭐ Avaliação pós-atendimento enviada para ${item.customer_phone}. Sequência concluída com sucesso.`);
                    await followup_service_1.FollowupService.concludeConversation({
                        orgId: item.org_id,
                        phone: item.customer_phone,
                        platform: item.platform || 'whatsapp',
                        customerName: item.customer_name,
                        reason: 'review_completed (step 100)',
                    });
                }
                else if (currentStep < MAX_STEPS) {
                    const nextStep = currentStep + 1;
                    // Step 2 sempre 24h depois (encerramento cordial)
                    const nextScheduledAt = (0, followup_service_1.randomScheduledTime)(24);
                    // Preservar contexto
                    const scenario = await resolveScenario(item);
                    const contextSnapshot = JSON.stringify({
                        flow: 'standard',
                        scenario,
                        lastBotReply: message.substring(0, 500),
                    });
                    const { error: nextErr } = await supabase_1.supabaseAdmin
                        .from('followup_schedules')
                        .insert({
                        org_id: item.org_id,
                        customer_phone: item.customer_phone,
                        platform: item.platform || 'whatsapp',
                        scheduled_at: nextScheduledAt.toISOString(),
                        status: 'pending',
                        followup_step: nextStep,
                        context_snapshot: contextSnapshot,
                        customer_name: item.customer_name,
                        last_message_id: item.last_message_id,
                    });
                    if (nextErr) {
                        console.warn(`[FOLLOWUP] Aviso ao agendar step ${nextStep} para ${item.customer_phone}:`, nextErr.message);
                    }
                    else {
                        console.log(`[FOLLOWUP] 📅 Próximo follow-up (step ${nextStep}) agendado para ${item.customer_phone} em ${nextScheduledAt.toISOString()}`);
                    }
                }
                else {
                    // Step 2 enviado → encerrar silenciosamente (sem nota no chat)
                    console.log(`[FOLLOWUP] ⏹ Fluxo padrão concluído para ${item.customer_phone} (step ${currentStep}/${MAX_STEPS}). A encerrar silenciosamente.`);
                    await followup_service_1.FollowupService.cancelPendingForPhone(item.org_id, item.customer_phone);
                }
                // ── 8. Intervalo de 5 segundos entre envios de números diferentes ─
                await sleep(5000);
            }
            catch (itemErr) {
                console.error(`[FOLLOWUP] Erro no item ${item.id}:`, itemErr.message);
            }
        }
    }
    catch (err) {
        console.error('[FOLLOWUP WORKER] Erro global:', err.message);
    }
}
// Executar imediatamente ao iniciar, depois a cada 60 segundos
runFollowups();
const workerInterval = setInterval(runFollowups, 60_000);
exports.workerInterval = workerInterval;
console.log('[FOLLOWUP WORKER] ✅ Worker de follow-up iniciado (fluxo padrão 12h/24h · 2 steps + objeções B2C/B2B, intervalo: 60s)');
