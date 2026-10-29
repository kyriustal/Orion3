"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processInstagramWebhook = processInstagramWebhook;
const express_1 = require("express");
const supabase_1 = require("../config/supabase");
const ai_service_1 = require("../services/ai.service");
const instagram_service_1 = require("../services/instagram.service");
const auth_1 = require("../middleware/auth");
const followup_service_1 = require("../services/followup.service");
const booking_service_1 = require("../services/booking.service");
const google_sheets_service_1 = require("../services/google_sheets.service");
const socket_1 = require("../socket");
const audio_service_1 = require("../services/audio.service");
const email_service_1 = require("../services/email.service");
const axios_1 = __importDefault(require("axios"));
const router = (0, express_1.Router)();
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'orion_secure_token_123';
// Dedup de mensagens Instagram processadas
const processedIgMessages = new Set();
setInterval(() => processedIgMessages.clear(), 10 * 60 * 1000);
// ─── GET /api/instagram/config ────────────────────────────────────────────────
router.get('/config', auth_1.requireAuth, async (req, res) => {
    try {
        const orgId = req.user?.orgId;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('instagram_config')
            .select('id, instagram_user_id, page_id, display_name, username, access_token, is_active, created_at')
            .eq('org_id', orgId)
            .maybeSingle();
        if (error)
            throw error;
        res.json(data || null);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ─── POST /api/instagram/config — Guardar com validação automática ─────────────
router.post('/config', auth_1.requireAuth, async (req, res) => {
    try {
        const orgId = req.user?.orgId;
        const { access_token, display_name } = req.body;
        if (!access_token) {
            return res.status(400).json({ error: 'access_token é obrigatório.' });
        }
        // Verificar se já existe configuração existente (edição)
        const { data: existing } = await supabase_1.supabaseAdmin
            .from('instagram_config')
            .select('id, is_active')
            .eq('org_id', orgId)
            .maybeSingle();
        // Validar token e obter Instagram Business Account ID automaticamente
        const igInfo = await instagram_service_1.InstagramService.validateAndGetIgId(access_token);
        if (!igInfo) {
            return res.status(400).json({
                error: 'Não foi possível encontrar uma conta Instagram Business ligada a este token.',
                details: 'Certifique-se que: (1) A sua conta Instagram está no modo Business/Creator; (2) Está ligada a uma Facebook Page; (3) O token tem as permissões: instagram_manage_messages, pages_messaging.',
            });
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('instagram_config')
            .upsert({
            org_id: orgId,
            instagram_user_id: igInfo.igUserId,
            access_token,
            display_name: display_name || igInfo.username,
            username: igInfo.username,
            is_active: true,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'org_id' })
            .select()
            .single();
        if (error)
            throw error;
        console.log(`[INSTAGRAM] Configuração guardada para @${igInfo.username} (ID: ${igInfo.igUserId})`);
        res.json({
            message: `Instagram conectado com sucesso! @${igInfo.username}`,
            data,
        });
    }
    catch (err) {
        console.error('[INSTAGRAM] Erro ao guardar config:', err.message);
        res.status(500).json({ error: err.message });
    }
});
// ─── DELETE /api/instagram/config — Desconectar Instagram ─────────────────────
router.delete('/config', auth_1.requireAuth, async (req, res) => {
    try {
        const orgId = req.user?.orgId;
        const { error } = await supabase_1.supabaseAdmin
            .from('instagram_config')
            .update({ is_active: false })
            .eq('org_id', orgId);
        if (error)
            throw error;
        res.json({ message: 'Instagram desconectado.' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ─── GET /api/instagram/webhook — Verificação Meta ────────────────────────────
router.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('[INSTAGRAM WEBHOOK] Verificado com sucesso.');
        res.status(200).send(challenge);
    }
    else {
        console.warn('[INSTAGRAM WEBHOOK] Token inválido na verificação.');
        res.sendStatus(403);
    }
});
async function processInstagramWebhook(body) {
    try {
        if (!body)
            return;
        // Suportar tanto object='instagram' quanto page (Meta pode enviar ambos)
        if (body.object !== 'instagram' && body.object !== 'page')
            return;
        for (const entry of (body.entry || [])) {
            const messaging = entry.messaging?.[0];
            if (!messaging)
                continue;
            const message = messaging.message;
            if (!message)
                continue;
            // Ignorar echoes (mensagens enviadas pelo próprio agente)
            if (message.is_echo)
                continue;
            const messageId = message.mid;
            const senderId = messaging.sender?.id;
            const recipientId = messaging.recipient?.id; // Este é o Instagram User ID da nossa página
            if (!messageId || !senderId || !recipientId)
                continue;
            // Dedup
            if (processedIgMessages.has(messageId)) {
                console.log(`[INSTAGRAM WEBHOOK] Mensagem ${messageId} já processada. Ignorando.`);
                continue;
            }
            processedIgMessages.add(messageId);
            const userText = message.text || '';
            const attachments = message.attachments || [];
            console.log(`[INSTAGRAM WEBHOOK] Nova DM de ${senderId} para página ${recipientId}`);
            // 1. Buscar configuração pelo Instagram User ID da página
            const { data: config } = await supabase_1.supabaseAdmin
                .from('instagram_config')
                .select('org_id, access_token, display_name, instagram_user_id')
                .eq('instagram_user_id', recipientId)
                .eq('is_active', true)
                .maybeSingle();
            if (!config) {
                console.warn(`[INSTAGRAM WEBHOOK] Nenhuma config activa para ig_user_id: ${recipientId}`);
                continue;
            }
            const { org_id: orgId, access_token: accessToken, instagram_user_id: igUserId } = config;
            // Buscar nome personalizado (chatbot_name)
            const { data: org } = await supabase_1.supabaseAdmin
                .from('organizations')
                .select('chatbot_name')
                .eq('id', orgId)
                .maybeSingle();
            const botName = org?.chatbot_name || config.display_name || 'Assistente';
            // 2. Determinar o texto da mensagem e descarregar anexos se aplicável
            let messageText = userText;
            let attachmentMediaUrl = null;
            let attachmentFileName = null;
            let attachmentMimeType = null;
            let media = undefined;
            if (attachments.length > 0) {
                const att = attachments[0];
                const attUrl = att.payload?.url;
                if (attUrl) {
                    attachmentMediaUrl = attUrl;
                    if (att.type === 'image') {
                        attachmentFileName = 'imagem.jpg';
                        attachmentMimeType = 'image/jpeg';
                        if (!messageText)
                            messageText = '(Imagem enviada)';
                    }
                    else if (att.type === 'video') {
                        attachmentFileName = 'video.mp4';
                        attachmentMimeType = 'video/mp4';
                        if (!messageText)
                            messageText = '(Vídeo enviado)';
                    }
                    else if (att.type === 'audio') {
                        attachmentFileName = 'audio.m4a';
                        attachmentMimeType = 'audio/mp4';
                        if (!messageText)
                            messageText = '(Áudio enviado)';
                    }
                    else if (att.type === 'story_mention') {
                        if (!messageText)
                            messageText = '(Mencionou o seu story)';
                    }
                    else if (att.type === 'share') {
                        if (!messageText)
                            messageText = `(Conteúdo partilhado: ${att.payload?.url || ''})`;
                    }
                    else {
                        if (!messageText)
                            messageText = '(Anexo recebido)';
                    }
                    if (att.type === 'audio' || att.type === 'image' || att.type === 'video') {
                        try {
                            console.log(`[INSTAGRAM WEBHOOK] Descarregando anexo ${att.type}: ${attUrl.substring(0, 60)}...`);
                            const response = await axios_1.default.get(attUrl, { responseType: 'arraybuffer' });
                            const mimeType = response.headers['content-type'] || attachmentMimeType || 'application/octet-stream';
                            const base64 = Buffer.from(response.data).toString('base64');
                            media = { base64, mimeType };
                            if (att.type === 'audio') {
                                console.log(`[INSTAGRAM WEBHOOK] Transcrevendo áudio recebido do Instagram...`);
                                const sttResult = await audio_service_1.AudioService.speechToTextFromBase64(base64, mimeType);
                                if (sttResult) {
                                    messageText = `[Mensagem de Áudio]: ${sttResult.text}`;
                                    console.log(`[INSTAGRAM WEBHOOK] Áudio transcrito: "${sttResult.text.substring(0, 80)}"`);
                                    media = undefined; // Já transcrito; evitar duplo processamento no AIService
                                }
                                else {
                                    messageText = ''; // Passar media raw ao AIService para nova tentativa via Gemini
                                    console.warn(`[INSTAGRAM WEBHOOK] STT falhou. A passar media raw ao AIService.`);
                                }
                            }
                            else if (att.type === 'image') {
                                console.log(`[INSTAGRAM WEBHOOK] Analisando imagem recebida do Instagram via Gemini...`);
                                const imgDesc = await ai_service_1.AIService.describeImageWithGemini(base64, mimeType);
                                if (imgDesc) {
                                    messageText = `[Imagem enviada pelo cliente — descrição visual e texto lido]:\n${imgDesc}`;
                                    media = undefined;
                                }
                            }
                        }
                        catch (err) {
                            console.error(`[INSTAGRAM WEBHOOK] Erro ao descarregar/processar anexo:`, err.message);
                        }
                    }
                }
            }
            const referral = messaging.referral || messaging.message?.referral || messaging.postback?.referral || undefined;
            if (referral) {
                console.log(`[INSTAGRAM WEBHOOK] 📣 Mensagem de anúncio detectada. Referral:`, JSON.stringify(referral).substring(0, 200));
            }
            // 3. Buscar histórico recente completo (últimas 60 mensagens)
            const { data: dbHistory } = await supabase_1.supabaseAdmin
                .from('conversation_history')
                .select('sender, text')
                .eq('org_id', orgId)
                .eq('customer_phone', senderId)
                .order('created_at', { ascending: false })
                .limit(60);
            const history = (dbHistory || []).reverse().map(h => ({
                sender: h.sender,
                text: h.text,
            }));
            // 4. Persistir mensagem do utilizador
            const igMediaMetadata = { platform: 'instagram', message_id: messageId };
            if (attachmentMediaUrl) {
                igMediaMetadata.mediaUrl = attachmentMediaUrl;
                igMediaMetadata.fileName = attachmentFileName || 'ficheiro';
                igMediaMetadata.mimeType = attachmentMimeType || 'application/octet-stream';
            }
            if (referral) {
                igMediaMetadata.referral = referral;
            }
            await supabase_1.supabaseAdmin.from('conversation_history').insert({
                org_id: orgId,
                customer_phone: senderId,
                sender: 'user',
                text: messageText,
                metadata: igMediaMetadata,
            });
            // Sincronizar interação com a folha Google Sheets
            google_sheets_service_1.GoogleSheetsService.syncInteraction({
                orgId,
                channel: 'instagram',
                phoneOrId: senderId,
                name: `Cliente Instagram (${senderId})`,
                text: messageText || '[media]',
                status: 'Ativo',
            }).catch(() => { });
            // Cancelar follow-ups pendentes (cliente voltou a responder)
            followup_service_1.FollowupService.cancelPendingForPhone(orgId, senderId).catch(() => { });
            // 4b. Emitir evento para o Live Chat
            try {
                (0, socket_1.getIo)().to(`org:${orgId}`).emit('new_message', {
                    phone: senderId,
                    sender: 'user',
                    text: messageText,
                    time: new Date().toLocaleTimeString('pt-PT', { timeZone: 'Africa/Luanda', hour: '2-digit', minute: '2-digit' }),
                    timestamp: new Date().toISOString(),
                    platform: 'instagram',
                    metadata: igMediaMetadata,
                });
            }
            catch (_) { /* sem clientes conectados */ }
            // 5. Mark seen + typing indicator
            await instagram_service_1.InstagramService.markSeen(igUserId, senderId, accessToken);
            await instagram_service_1.InstagramService.sendTypingIndicator(igUserId, senderId, accessToken, 'typing_on');
            // 6. PROTOCOLO DE SEGURANÇA E AUTO-CURA DA IA (Até 3 tentativas de recuperação)
            let aiResult = null;
            let sendSuccess = false;
            let lastErrorMsg = '';
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    console.log(`[INSTAGRAM WEBHOOK] 🛡️ Tentativa ${attempt}/3 de auto-cura para sender=${senderId}...`);
                    if (attempt > 1) {
                        await new Promise(r => setTimeout(r, attempt * 1000));
                    }
                    aiResult = await ai_service_1.AIService.generateResponse({
                        message: messageText,
                        orgId,
                        history,
                        botName: botName || 'Assistente',
                        mode: 'simulation',
                        media: attempt === 1 ? media : undefined,
                        referral: referral || undefined,
                    });
                    if (!aiResult?.reply) {
                        throw new Error('Resposta vazia da IA no Instagram.');
                    }
                    // Enviar resposta via Instagram DM
                    await instagram_service_1.InstagramService.sendMessage(igUserId, senderId, aiResult.reply, accessToken);
                    sendSuccess = true;
                    console.log(`[INSTAGRAM WEBHOOK] ✅ Mensagem enviada com sucesso para sender=${senderId} na tentativa ${attempt}!`);
                    // Emitir resolução de erro
                    try {
                        (0, socket_1.getIo)().to(`org:${orgId}`).emit('chat_resolved', {
                            phone: senderId,
                            platform: 'instagram',
                        });
                    }
                    catch (_) { }
                    break;
                }
                catch (attemptErr) {
                    lastErrorMsg = attemptErr.message || String(attemptErr);
                    console.warn(`[INSTAGRAM WEBHOOK] ⚠️ Tentativa ${attempt}/3 falhou para sender=${senderId}: ${lastErrorMsg}`);
                }
            }
            if (!sendSuccess) {
                console.error(`[INSTAGRAM WEBHOOK] ❌ AIService falhou após 3 tentativas para sender=${senderId}: ${lastErrorMsg}`);
                // NÃO enviar mensagem de erro ao cliente — apenas registar e sinalizar o painel com alerta vermelho.
                try {
                    await supabase_1.supabaseAdmin.from('conversation_history').insert({
                        org_id: orgId,
                        customer_phone: senderId,
                        sender: 'bot',
                        text: `[ERRO INTERNO — NÃO ENVIADO AO CLIENTE]: ${lastErrorMsg}`,
                        metadata: { platform: 'instagram', internal_error: true, needs_urgent_intervention: true },
                    });
                }
                catch (_) { /* silencioso */ }
                try {
                    (0, socket_1.getIo)().to(`org:${orgId}`).emit('chat_error', {
                        phone: senderId,
                        error: lastErrorMsg,
                        urgent: true,
                        platform: 'instagram',
                    });
                }
                catch (_) { /* silencioso */ }
                email_service_1.EmailService.sendUrgentInterventionAlert({
                    orgId,
                    customerPhone: senderId,
                    customerName: 'Cliente Instagram',
                    errorMessage: lastErrorMsg,
                    customerMessage: messageText,
                    platform: 'Instagram',
                }).catch(e => console.error('[ALERTA IG] Erro ao enviar email de intervenção:', e.message));
                continue;
            }
            const aiReply = aiResult.reply;
            const transfer = aiResult.transfer;
            // ── Processamento Centralizado de Agendamento (Agenda Google/Microsoft + Deduplicação + Email/SMS) ──
            if (aiResult.bookingData) {
                const bData = aiResult.bookingData;
                const isReschedule = Boolean(aiResult.noShowReschedule);
                console.log(`[INSTAGRAM-BOOKING] 📅 ${isReschedule ? 'Remarcação' : 'Agendamento'} detectado via Instagram para ${bData.name} (${bData.date} às ${bData.time})`);
                const customerPhone = (bData.phone && bData.phone.replace(/[^\d+]/g, '').length >= 8)
                    ? bData.phone.replace(/[^\d+]/g, '')
                    : undefined;
                const bookingPromise = isReschedule
                    ? booking_service_1.BookingService.rescheduleBooking(orgId, {
                        name: bData.name,
                        subject: bData.subject,
                        phone: customerPhone,
                        email: bData.email,
                        date: bData.date,
                        time: bData.time,
                    }, { channelOrigin: 'Instagram DM' })
                    : booking_service_1.BookingService.processBooking(orgId, {
                        name: bData.name,
                        subject: bData.subject,
                        phone: customerPhone,
                        email: bData.email,
                        date: bData.date,
                        time: bData.time,
                    }, { channelOrigin: 'Instagram DM' });
                bookingPromise
                    .then(res => {
                    if (res.success) {
                        console.log(`[INSTAGRAM-BOOKING] ✅ ${isReschedule ? 'Remarcação' : 'Agendamento'} processado! Lembretes programados: ${res.alertsScheduled}`);
                    }
                    else {
                        console.warn(`[INSTAGRAM-BOOKING] ⚠️ ${isReschedule ? 'Remarcação' : 'Agendamento'} não concluído: ${res.error}`);
                    }
                })
                    .catch(err => console.error('[INSTAGRAM-BOOKING] ❌ Erro ao processar agendamento:', err.message));
            }
            // 7. Persistir resposta do bot
            const igBotMetadata = { platform: 'instagram' };
            if (aiResult.confirm)
                igBotMetadata.confirm = true;
            if (aiResult.booking || aiResult.bookingData)
                igBotMetadata.booking = true;
            if (aiResult.attended)
                igBotMetadata.attended = true;
            if (aiResult.noShowReschedule) {
                igBotMetadata.no_show_reschedule = true;
                igBotMetadata.booking = true;
            }
            await supabase_1.supabaseAdmin.from('conversation_history').insert({
                org_id: orgId,
                customer_phone: senderId,
                sender: 'bot',
                text: aiReply,
                metadata: igBotMetadata,
            });
            // Emitir resposta do bot para o Live Chat (tempo real)
            try {
                (0, socket_1.getIo)().to(`org:${orgId}`).emit('new_message', {
                    phone: senderId,
                    sender: 'bot',
                    text: aiReply,
                    botName: botName,
                    time: new Date().toLocaleTimeString('pt-PT', { timeZone: 'Africa/Luanda', hour: '2-digit', minute: '2-digit' }),
                    timestamp: new Date().toISOString(),
                    platform: 'instagram',
                    metadata: igBotMetadata,
                });
            }
            catch (_) { /* silencioso */ }
            // Ativar protocolo de follow-up ou cancelar se agendou
            if (aiResult.booking || aiResult.bookingData) {
                followup_service_1.FollowupService.cancelPendingForPhone(orgId, senderId).catch(() => { });
            }
            else if (!transfer) {
                followup_service_1.FollowupService.scheduleSmartFollowup({
                    orgId,
                    phone: senderId,
                    platform: 'instagram',
                    botReply: aiReply,
                }).catch(() => { });
            }
            console.log(`[INSTAGRAM] Resposta enviada para ${senderId}. Transfer: ${transfer}`);
        }
    }
    catch (err) {
        console.error('[INSTAGRAM WEBHOOK] Erro fatal:', err.message);
    }
}
// ─── POST /api/instagram/webhook — Recepção de DMs ────────────────────────────
router.post('/webhook', async (req, res) => {
    res.sendStatus(200); // Responder imediatamente à Meta
    await processInstagramWebhook(req.body);
});
// ─── POST /api/instagram/comment-automation ───────────────────────────────────
router.post('/comment-automation', auth_1.requireAuth, async (req, res) => {
    try {
        const orgId = req.user?.orgId;
        const { enabled, prompt } = req.body;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('instagram_config')
            .update({
            comment_automation_enabled: enabled,
            comment_prompt: prompt || null,
            updated_at: new Date().toISOString(),
        })
            .eq('org_id', orgId)
            .select()
            .maybeSingle();
        if (error)
            throw error;
        res.json({ success: true, data });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
