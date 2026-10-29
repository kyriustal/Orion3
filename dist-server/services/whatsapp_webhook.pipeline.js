"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiPauses = exports.botSentMessages = exports.processedMessages = void 0;
exports.normalizeMetaPhone = normalizeMetaPhone;
exports.formatDbError = formatDbError;
exports.extractCustomerNameFromText = extractCustomerNameFromText;
exports.uploadClientMediaToStorage = uploadClientMediaToStorage;
exports.findWhatsappConfigForWebhook = findWhatsappConfigForWebhook;
exports.triggerAIResponse = triggerAIResponse;
exports.processWhatsAppWebhook = processWhatsAppWebhook;
const fs_1 = __importDefault(require("fs"));
const supabase_1 = require("../config/supabase");
const socket_1 = require("../socket");
const ai_service_1 = require("./ai.service");
const whatsapp_service_1 = require("./whatsapp.service");
const audio_service_1 = require("./audio.service");
const document_service_1 = require("./document.service");
const email_service_1 = require("./email.service");
const push_service_1 = require("./push.service");
const booking_service_1 = require("./booking.service");
const followup_service_1 = require("./followup.service");
const google_sheets_service_1 = require("./google_sheets.service");
// ─── Controlo de estado em memória ────────────────────────────────────────────
/** Dedup — IDs de mensagens já processadas (limpa a cada 10 min) */
exports.processedMessages = new Set();
setInterval(() => exports.processedMessages.clear(), 10 * 60 * 1000);
/** Echo detection — IDs de mensagens enviadas pela nossa IA (limpa a cada 30 min) */
exports.botSentMessages = new Set();
setInterval(() => exports.botSentMessages.clear(), 30 * 60 * 1000);
/** Coexistência — timestamp de quando o humano respondeu por último */
exports.aiPauses = new Map();
// ─── Helpers Utilitários ──────────────────────────────────────────────────────
function normalizeMetaPhone(value) {
    return (value || '').toString().replace(/\D/g, '');
}
function formatDbError(error) {
    if (!error)
        return '';
    return [error.message, error.details, error.hint, error.code].filter(Boolean).join(' | ');
}
// Deteção de Nome do Cliente em Mensagens de Texto
function extractCustomerNameFromText(text) {
    if (!text)
        return null;
    const patterns = [
        /(?:o meu nome é|meu nome é|o meu nome e|meu nome e|me chamo|chamo-me|me chamo de|chamo me|eu me chamo|pode me chamar de|pode chamar-me de|chame-me de|trate-me por|sou o|sou a|eu sou o|eu sou a|aqui é o|aqui é a|aqui é|aqui fala o|aqui fala a|aqui quem fala é o|aqui quem fala é a|fala o|fala a|fala com o|fala com a)\s+([A-ZÀ-Úa-zà-ú]{2,}(?:\s+[A-ZÀ-Úa-zà-ú]{2,})?)/i,
        /^(?:olá|ola|bom dia|boa tarde|boa noite|oi|hey|saudações)[,!\s]+(?:sou\s+(?:o|a)\s+|me\s+chamo\s+|eu\s+sou\s+(?:o|a)\s+|aqui\s+é\s+(?:o|a)\s+)?([A-ZÀ-Úa-zà-ú]{2,}(?:\s+[A-ZÀ-Úa-zà-ú]{2,})?)$/i,
        /(?:o meu contacto é|o meu nome:\s*|meu nome:\s*|nome:\s*|cliente:\s*)([A-ZÀ-Úa-zà-ú]{2,}(?:\s+[A-ZÀ-Úa-zà-ú]{2,})?)/i,
        /(?:pode tratar-me por|trata-me por|trate-me por)\s+([A-ZÀ-Úa-zà-ú]{2,})/i
    ];
    for (const pat of patterns) {
        const match = text.match(pat);
        if (match && match[1]) {
            const candidate = match[1].trim();
            const lower = candidate.toLowerCase();
            if (!/^(cliente|amigo|amiga|senhor|senhora|doutor|doutora|você|voce|sim|não|nao|orion|assistente|ajuda|atendente|humano|favor|tarde|noite|dia|hoje|amanhã|ola|olá|bom|boa|obrigado|obrigada|preço|valor|serviço)$/i.test(lower)) {
                return candidate.charAt(0).toUpperCase() + candidate.slice(1);
            }
        }
    }
    return null;
}
// Upload de média do cliente para o Supabase Storage
async function uploadClientMediaToStorage(orgId, base64Data, mimeType, originalFileName) {
    try {
        const { data: buckets } = await supabase_1.supabaseAdmin.storage.listBuckets();
        if (!buckets?.some(b => b.name === 'assets')) {
            await supabase_1.supabaseAdmin.storage.createBucket('assets', { public: true });
        }
        const sanitizedName = originalFileName
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '') || 'ficheiro';
        const ext = sanitizedName.includes('.') ? '' : (mimeType.split('/')[1] || 'bin');
        const fileNameOnStorage = `${orgId}/client_${Date.now()}_${sanitizedName}${ext ? '.' + ext : ''}`;
        const buffer = Buffer.from(base64Data, 'base64');
        const { error: uploadError } = await supabase_1.supabaseAdmin.storage
            .from('assets')
            .upload(fileNameOnStorage, buffer, { contentType: mimeType, upsert: true });
        if (uploadError) {
            console.error('[CLIENT-MEDIA] Erro no upload para Storage:', uploadError.message);
            return null;
        }
        const { data: { publicUrl } } = supabase_1.supabaseAdmin.storage
            .from('assets')
            .getPublicUrl(fileNameOnStorage);
        console.log(`[CLIENT-MEDIA] ✅ Ficheiro do cliente guardado: ${publicUrl}`);
        return publicUrl;
    }
    catch (err) {
        console.error('[CLIENT-MEDIA] Erro inesperado:', err.message);
        return null;
    }
}
// Localizar configuração do WhatsApp activa no Supabase
async function findWhatsappConfigForWebhook(phoneNumberId, wabaId) {
    const selectFields = 'org_id, access_token, display_name, phone_number_id, waba_id';
    if (phoneNumberId) {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('whatsapp_config')
            .select(selectFields)
            .eq('phone_number_id', phoneNumberId)
            .eq('is_active', true)
            .maybeSingle();
        if (error)
            console.error('[WEBHOOK] Erro DB ao procurar por phone_number_id:', error.message);
        if (data)
            return data;
    }
    if (wabaId) {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('whatsapp_config')
            .select(selectFields)
            .eq('waba_id', wabaId)
            .eq('is_active', true)
            .maybeSingle();
        if (error)
            console.error('[WEBHOOK] Erro DB ao procurar por waba_id:', error.message);
        if (data)
            return data;
    }
    const { data: activeConfigs, error } = await supabase_1.supabaseAdmin
        .from('whatsapp_config')
        .select(selectFields)
        .eq('is_active', true);
    if (error) {
        console.error('[WEBHOOK] Erro DB ao procurar configurações ativas:', error.message);
        return null;
    }
    if (activeConfigs?.length === 1) {
        console.warn(`[WEBHOOK] Fallback: usando única config ativa (phone_id=${activeConfigs[0].phone_number_id}, waba_id=${activeConfigs[0].waba_id})`);
        return activeConfigs[0];
    }
    return null;
}
// ─────────────────────────────────────────────────────────────────────────────
//  Execução Principal da IA (Geração, Envio, Memória, Bookings, Follow-ups)
// ─────────────────────────────────────────────────────────────────────────────
async function triggerAIResponse(params) {
    const { orgId, fromNumber, phoneNumberId, accessToken, botName, message, incomingMessageId, senderName, media, referral, isAudio, isVoiceAllowed, detectedLanguage = 'pt', buttonContext, } = params;
    // Verificar se o atendimento por IA está pausado para este cliente (humano no controlo)
    const historyKey = `${orgId}:${fromNumber}`;
    const pausedUntil = exports.aiPauses.get(historyKey);
    if (pausedUntil && Date.now() < pausedUntil) {
        console.log(`[IA] Pausada para ${fromNumber}. Mensagem recebida mas não respondida (humano no controlo).`);
        return { ok: true };
    }
    let customerProfile;
    try {
        // Indicador de "digitando..."
        try {
            await whatsapp_service_1.WhatsAppService.sendTypingIndicator(phoneNumberId, incomingMessageId, accessToken);
        }
        catch (_) { /* silencioso */ }
        // Buscar histórico completo recente (últimas 60 mensagens) com suporte a ambos formatos de telefone (+ e sem +)
        const phoneVariants = [fromNumber, `+${fromNumber}`];
        const { data: dbHistory } = await supabase_1.supabaseAdmin
            .from('conversation_history')
            .select('sender, text, created_at')
            .eq('org_id', orgId)
            .in('customer_phone', phoneVariants)
            .order('created_at', { ascending: false })
            .limit(60);
        let timeSinceLastMessageHours = 0;
        if (dbHistory && dbHistory.length > 1) {
            const currentMsgTime = new Date(dbHistory[0].created_at).getTime();
            const prevMsgTime = new Date(dbHistory[1].created_at).getTime();
            timeSinceLastMessageHours = (currentMsgTime - prevMsgTime) / (1000 * 60 * 60);
        }
        const pastDbHistory = dbHistory ? dbHistory.slice(1) : [];
        const history = pastDbHistory.reverse().map(h => ({ sender: h.sender, text: h.text }));
        // ── Carregar perfil do cliente (memória permanente de nome e contexto) ───────
        try {
            const { data: existingContact } = await supabase_1.supabaseAdmin
                .from('contacts')
                .select('name, email, phone')
                .eq('org_id', orgId)
                .eq('phone', fromNumber)
                .maybeSingle();
            let detectedName = existingContact?.name;
            if (detectedName && (detectedName.startsWith('+') || /^\d+$/.test(detectedName) || /^(cliente|desconhecido|amigo)$/i.test(detectedName))) {
                detectedName = undefined;
            }
            if (!detectedName && senderName && senderName.trim().length > 1) {
                const cleanSender = senderName.trim();
                if (!cleanSender.startsWith('+') && !/^\d+$/.test(cleanSender)) {
                    detectedName = cleanSender;
                    try {
                        await supabase_1.supabaseAdmin.from('contacts').upsert({
                            org_id: orgId,
                            phone: fromNumber,
                            name: cleanSender,
                            updated_at: new Date().toISOString(),
                        }, { onConflict: 'org_id,phone' });
                        console.log(`[MEMÓRIA] ✅ Nome "${cleanSender}" do perfil WhatsApp guardado para ${fromNumber}`);
                    }
                    catch (e) {
                        console.warn('[MEMÓRIA] Aviso ao guardar nome WhatsApp:', e.message);
                    }
                }
            }
            if (!detectedName) {
                for (const h of pastDbHistory) {
                    if (h.sender === 'bot' && h.text) {
                        const contactMatch = h.text.match(/\[CONTATO:(\{[^}]+\})\]/);
                        if (contactMatch) {
                            try {
                                const parsed = JSON.parse(contactMatch[1]);
                                if (parsed.name && parsed.name.trim().length > 1) {
                                    detectedName = parsed.name.trim();
                                    break;
                                }
                            }
                            catch (_) { }
                        }
                    }
                }
            }
            if (!detectedName) {
                const fullConversationText = [message, ...pastDbHistory.map(h => h.text)].join('\n');
                const extracted = extractCustomerNameFromText(fullConversationText);
                if (extracted) {
                    detectedName = extracted;
                    try {
                        await supabase_1.supabaseAdmin.from('contacts').upsert({
                            org_id: orgId,
                            phone: fromNumber,
                            name: extracted,
                            updated_at: new Date().toISOString(),
                        }, { onConflict: 'org_id,phone' });
                        console.log(`[MEMÓRIA] ✅ Nome "${extracted}" guardado permanentemente para ${fromNumber}`);
                    }
                    catch (e) {
                        console.warn('[MEMÓRIA] Aviso ao guardar nome extraído:', e.message);
                    }
                }
            }
            const isReturning = (dbHistory && dbHistory.length > 2) || (timeSinceLastMessageHours > 2);
            customerProfile = {
                name: detectedName || undefined,
                email: existingContact?.email || undefined,
                phone: fromNumber,
                isReturning,
            };
        }
        catch (memErr) {
            console.warn('[MEMÓRIA] Erro ao carregar perfil do cliente (não crítico):', memErr.message);
        }
        let sendSuccess = false;
        let lastErrorMsg = '';
        let aiResult = null;
        let ptReplyText = '';
        let replyText = '';
        let sentMsgId = null;
        // ── PROTOCOLO DE SEGURANÇA E AUTO-CURA DA IA (Até 3 tentativas de recuperação) ──
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                console.log(`[PROTOCOLO SEGURANÇA IA] 🛡️ Tentativa ${attempt}/3 para ${fromNumber}...`);
                if (attempt > 1) {
                    await new Promise(r => setTimeout(r, attempt * 1000));
                }
                aiResult = await ai_service_1.AIService.generateResponse({
                    message,
                    orgId,
                    history,
                    botName,
                    mode: 'simulation',
                    media: attempt === 1 ? media : undefined,
                    referral,
                    timeSinceLastMessageHours,
                    customerProfile,
                    buttonContext,
                });
                if (!aiResult?.reply) {
                    throw new Error('Resposta da IA vazia.');
                }
                replyText = aiResult.reply;
                ptReplyText = replyText;
                if (detectedLanguage !== 'pt' && detectedLanguage !== 'por') {
                    console.log(`[IA] Traduzindo silenciosamente a resposta de ${detectedLanguage} para PT...`);
                    ptReplyText = await ai_service_1.AIService.translateText(replyText, 'português');
                }
                // ── Processar envio de arquivos [SEND_FILE: ID] ───────────────────────
                const fileMatches = [...replyText.matchAll(/\[SEND_FILE:\s*([a-f0-9-]{36})\]/gi)];
                if (fileMatches.length > 0) {
                    replyText = replyText.replace(/\[SEND_FILE:\s*[a-f0-9-]{36}\]/gi, '').trim();
                    ptReplyText = ptReplyText.replace(/\[SEND_FILE:\s*[a-f0-9-]{36}\]/gi, '').trim();
                    for (const match of fileMatches) {
                        const assetId = match[1];
                        const { data: asset } = await supabase_1.supabaseAdmin
                            .from('public_assets')
                            .select('*')
                            .eq('id', assetId)
                            .eq('org_id', orgId)
                            .single();
                        if (asset) {
                            const sentMediaId = await whatsapp_service_1.WhatsAppService.sendMediaByUrl(fromNumber, asset.file_url, asset.mime_type, asset.filename, phoneNumberId, accessToken);
                            if (sentMediaId)
                                exports.botSentMessages.add(sentMediaId);
                            const fileMsgText = `[Ficheiro: ${asset.filename}](${asset.file_url})`;
                            await supabase_1.supabaseAdmin.from('conversation_history').insert({
                                org_id: orgId,
                                customer_phone: fromNumber,
                                sender: 'bot',
                                text: fileMsgText,
                                metadata: {
                                    botName,
                                    mediaUrl: asset.file_url,
                                    fileName: asset.filename,
                                    mimeType: asset.mime_type
                                }
                            });
                            try {
                                (0, socket_1.getIo)().to(`org:${orgId}`).emit('new_message', {
                                    phone: fromNumber,
                                    sender: 'bot',
                                    text: fileMsgText,
                                    botName: botName,
                                    time: new Date().toLocaleTimeString('pt-PT', { timeZone: 'Africa/Luanda', hour: '2-digit', minute: '2-digit' }),
                                    timestamp: new Date().toISOString(),
                                    platform: 'whatsapp',
                                    metadata: {
                                        mediaUrl: asset.file_url,
                                        fileName: asset.filename,
                                        mimeType: asset.mime_type
                                    }
                                });
                            }
                            catch (_) { }
                        }
                    }
                }
                // ── Enviar Mensagem via WhatsApp ────────────────────────────────────
                sentMsgId = null;
                if (isAudio && isVoiceAllowed && attempt === 1) {
                    try {
                        const audioPath = await audio_service_1.AudioService.textToSpeech(replyText);
                        if (audioPath && fs_1.default.existsSync(audioPath)) {
                            const mediaId = await whatsapp_service_1.WhatsAppService.uploadMedia(audioPath, phoneNumberId, accessToken);
                            if (mediaId) {
                                sentMsgId = await whatsapp_service_1.WhatsAppService.sendAudio(fromNumber, mediaId, phoneNumberId, accessToken);
                            }
                            fs_1.default.unlinkSync(audioPath);
                        }
                    }
                    catch (audioErr) {
                        console.warn('[IA] Falha no TTS de áudio, tentando envio em texto:', audioErr.message);
                    }
                }
                if (!sentMsgId && replyText) {
                    sentMsgId = await whatsapp_service_1.WhatsAppService.sendTextMessage(phoneNumberId, fromNumber, replyText, accessToken);
                }
                if (sentMsgId) {
                    exports.botSentMessages.add(sentMsgId);
                    sendSuccess = true;
                    console.log(`[PROTOCOLO SEGURANÇA IA] ✅ Mensagem entregue com sucesso para ${fromNumber} na tentativa ${attempt}! ID: ${sentMsgId}`);
                    break;
                }
                else {
                    throw new Error('Meta API não retornou ID de mensagem entregue.');
                }
            }
            catch (attemptErr) {
                lastErrorMsg = attemptErr.message || String(attemptErr);
                console.warn(`[PROTOCOLO SEGURANÇA IA] ⚠️ Tentativa ${attempt}/3 falhou para ${fromNumber}: ${lastErrorMsg}`);
            }
        }
        if (!sendSuccess) {
            throw new Error(`Falha persistente no envio após 3 tentativas de auto-cura: ${lastErrorMsg}`);
        }
        try {
            (0, socket_1.getIo)().to(`org:${orgId}`).emit('chat_resolved', {
                phone: fromNumber,
                platform: 'whatsapp',
            });
        }
        catch (_) { }
        const newDetectedName = aiResult?.contactData?.name || aiResult?.bookingData?.name;
        if (newDetectedName && newDetectedName.trim().length > 1 && (!customerProfile?.name || customerProfile.name !== newDetectedName)) {
            Promise.resolve(supabase_1.supabaseAdmin.from('contacts').upsert({
                org_id: orgId,
                phone: fromNumber,
                name: newDetectedName.trim(),
                email: aiResult.contactData?.email || aiResult.bookingData?.email || customerProfile?.email,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'org_id,phone' })).catch(() => { });
        }
        // ── Notificações de Booking, Handover, Proposal ou Confirmation ──
        if (aiResult?.transfer || aiResult?.booking || aiResult?.proposal || aiResult?.confirm) {
            const alertType = aiResult.transfer
                ? 'handover'
                : aiResult.booking
                    ? 'booking'
                    : aiResult.proposal
                        ? 'proposal'
                        : 'confirmation';
            const alertTitle = aiResult.transfer
                ? '🚨 Pedido de Atendimento Humano'
                : aiResult.booking
                    ? '📅 Novo Pedido de Agendamento'
                    : aiResult.proposal
                        ? '📎 Proposta Comercial Recebida'
                        : '⚠️ Dúvida Sem Resposta - Confirmar Informações';
            const alertBody = aiResult.transfer
                ? `O cliente ${fromNumber} quer falar com um assistente.`
                : aiResult.booking
                    ? `O cliente ${fromNumber} solicitou um agendamento.`
                    : aiResult.proposal
                        ? `O cliente ${fromNumber} enviou uma proposta comercial.`
                        : `O cliente ${fromNumber} fez uma pergunta fora da base de dados.`;
            email_service_1.EmailService.sendAlertNotification(orgId, alertType, fromNumber, 'Cliente', message).catch(e => console.error('[ALERTA] Erro ao enviar email:', e.message));
            push_service_1.PushService.sendAlertToOrg(orgId, {
                title: alertTitle,
                body: alertBody,
                type: alertType,
                url: '/dashboard/live-chat',
            }).catch(e => console.error('[ALERTA] Erro ao enviar push:', e.message));
            try {
                const socketEvent = alertType === 'handover'
                    ? 'handover_alert'
                    : alertType === 'booking'
                        ? 'booking_alert'
                        : alertType === 'proposal'
                            ? 'proposal_alert'
                            : 'confirmation_alert';
                (0, socket_1.getIo)().to(`org:${orgId}`).emit(socketEvent, {
                    phone: fromNumber,
                    message: message,
                    type: alertType,
                    platform: 'whatsapp'
                });
            }
            catch (_) { }
            if (aiResult.transfer || aiResult.confirm) {
                exports.aiPauses.set(historyKey, Date.now() + 24 * 60 * 60 * 1000);
                console.log(`[IA] Handover/Confirmação detectado. IA pausada automaticamente por 24h para ${fromNumber}`);
            }
        }
        // ── Automação de Agendamento (BookingService) ──
        if (aiResult?.bookingData) {
            const bData = aiResult.bookingData;
            const isReschedule = Boolean(aiResult.noShowReschedule);
            console.log(`[BOOKING-AUTO] 📅 ${isReschedule ? 'Remarcação' : 'Agendamento'} detectado via WhatsApp para ${bData.name}`);
            const customerPhone = (bData.phone && bData.phone.replace(/[^\d+]/g, '').length >= 8)
                ? bData.phone.replace(/[^\d+]/g, '')
                : fromNumber;
            const bookingPromise = isReschedule
                ? booking_service_1.BookingService.rescheduleBooking(orgId, {
                    name: bData.name,
                    subject: bData.subject,
                    phone: customerPhone,
                    email: bData.email,
                    date: bData.date,
                    time: bData.time,
                }, { channelOrigin: 'WhatsApp Chatbot' })
                : booking_service_1.BookingService.processBooking(orgId, {
                    name: bData.name,
                    subject: bData.subject,
                    phone: customerPhone,
                    email: bData.email,
                    date: bData.date,
                    time: bData.time,
                }, { channelOrigin: 'WhatsApp Chatbot' });
            bookingPromise.catch(err => console.error('[BOOKING-AUTO] ❌ Erro ao processar agendamento:', err.message));
            try {
                await supabase_1.supabaseAdmin.from('contacts').upsert({
                    org_id: orgId,
                    name: bData.name,
                    email: bData.email || undefined,
                    phone: customerPhone,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'org_id,phone' });
            }
            catch (_) { }
        }
        // Montar metadados da mensagem persistida
        const botMetadata = {};
        if (aiResult?.confirm)
            botMetadata.confirm = true;
        if (aiResult?.booking || aiResult?.bookingData)
            botMetadata.booking = true;
        if (aiResult?.attended)
            botMetadata.attended = true;
        if (aiResult?.noShowReschedule) {
            botMetadata.no_show_reschedule = true;
            botMetadata.booking = true;
        }
        const { error: botInsertError } = await supabase_1.supabaseAdmin.from('conversation_history').insert({
            org_id: orgId,
            customer_phone: fromNumber,
            sender: 'bot',
            text: ptReplyText,
            metadata: Object.keys(botMetadata).length > 0 ? botMetadata : undefined,
        });
        if (botInsertError) {
            throw new Error(`Resposta enviada, mas falhou ao gravar no histórico: ${formatDbError(botInsertError)}`);
        }
        try {
            (0, socket_1.getIo)().to(`org:${orgId}`).emit('new_message', {
                phone: fromNumber,
                sender: 'bot',
                text: ptReplyText,
                botName: botName,
                time: new Date().toLocaleTimeString('pt-PT', { timeZone: 'Africa/Luanda', hour: '2-digit', minute: '2-digit' }),
                timestamp: new Date().toISOString(),
                platform: 'whatsapp',
                metadata: Object.keys(botMetadata).length > 0 ? botMetadata : undefined,
            });
        }
        catch (_) { }
        if (aiResult?.contactData && (aiResult.contactData.name || aiResult.contactData.email)) {
            try {
                const cd = aiResult.contactData;
                const updateFields = {};
                if (cd.name)
                    updateFields.name = cd.name;
                if (cd.email)
                    updateFields.email = cd.email;
                const { data: existingForUpsert } = await supabase_1.supabaseAdmin
                    .from('contacts')
                    .select('id, name, email')
                    .eq('org_id', orgId)
                    .eq('phone', fromNumber)
                    .maybeSingle();
                if (existingForUpsert) {
                    const patch = {};
                    if (cd.name && !existingForUpsert.name)
                        patch.name = cd.name;
                    if (cd.email && !existingForUpsert.email)
                        patch.email = cd.email;
                    if (Object.keys(patch).length > 0) {
                        await supabase_1.supabaseAdmin.from('contacts').update(patch).eq('id', existingForUpsert.id);
                    }
                }
                else {
                    await supabase_1.supabaseAdmin.from('contacts').insert({
                        org_id: orgId,
                        phone: fromNumber,
                        ...updateFields,
                        source: 'whatsapp',
                    });
                }
            }
            catch (contactErr) {
                console.warn('[MEMÓRIA] Erro ao persistir contacto:', contactErr.message);
            }
        }
        google_sheets_service_1.GoogleSheetsService.syncInteraction({
            orgId,
            channel: 'whatsapp',
            phoneOrId: fromNumber,
            name: aiResult?.contactData?.name || customerProfile?.name || 'Cliente WhatsApp',
            email: aiResult?.contactData?.email || '',
            text: message || '[media]',
            subject: aiResult?.bookingData?.subject || '',
            status: 'Ativo',
        }).catch(e => console.warn('[WHATSAPP-SHEETS] Aviso Google Sheets:', e.message));
        if (aiResult?.transfer) {
            exports.aiPauses.set(historyKey, Date.now() + 30 * 60 * 1000);
            console.log(`[IA] Transferência para humano solicitada para ${fromNumber}. IA pausada por 30 min.`);
        }
        if (!aiResult?.transfer && !aiResult?.booking && !aiResult?.bookingData) {
            const clientName = (customerProfile?.name || '').trim().split(/\s+/)[0] || '';
            followup_service_1.FollowupService.scheduleSmartFollowup({
                orgId,
                phone: fromNumber,
                platform: 'whatsapp',
                customerName: clientName,
                botReply: ptReplyText,
                lastMessageId: sentMsgId || undefined,
            }).catch(err => console.warn('[FOLLOWUP] Aviso follow-up:', err.message));
        }
        else if (aiResult?.booking || aiResult?.bookingData) {
            // Se a conversa concluiu com agendamento, cancelar imediatamente qualquer follow-up de vendas
            followup_service_1.FollowupService.cancelPendingForPhone(orgId, fromNumber).catch(() => { });
        }
        return { ok: true, sentMsgId };
    }
    catch (err) {
        console.error(`[PROTOCOLO SEGURANÇA IA] ❌ ERRO PERSISTENTE no fluxo para ${fromNumber}:`, err.message);
        try {
            await supabase_1.supabaseAdmin.from('conversation_history').insert({
                org_id: orgId,
                customer_phone: fromNumber,
                sender: 'bot',
                text: `[ERRO INTERNO — NÃO ENVIADO AO CLIENTE]: ${err.message}`,
                metadata: { internal_error: true, needs_urgent_intervention: true },
            });
        }
        catch (_) { }
        try {
            (0, socket_1.getIo)().to(`org:${orgId}`).emit('chat_error', {
                phone: fromNumber,
                error: err.message,
                urgent: true,
                platform: 'whatsapp',
            });
        }
        catch (_) { }
        email_service_1.EmailService.sendUrgentInterventionAlert({
            orgId,
            customerPhone: fromNumber,
            customerName: customerProfile?.name || senderName || 'Cliente',
            errorMessage: err.message,
            customerMessage: message,
            platform: 'WhatsApp',
        }).catch(e => console.error('[ALERTA URGENTE] Erro ao enviar email de intervenção:', e.message));
        return { ok: false, error: err.message };
    }
}
// ─────────────────────────────────────────────────────────────────────────────
//  Pipeline Principal de Webhook da Meta
// ─────────────────────────────────────────────────────────────────────────────
async function processWhatsAppWebhook(body, recorder) {
    recorder({
        method: 'POST',
        object: body?.object,
        entryId: body?.entry?.[0]?.id,
        hasMessages: !!body?.entry?.[0]?.changes?.[0]?.value?.messages?.length,
        hasStatuses: !!body?.entry?.[0]?.changes?.[0]?.value?.statuses?.length,
        phoneNumberId: body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id,
    });
    if (body?.object !== 'whatsapp_business_account') {
        recorder({ method: 'POST', outcome: 'ignored_object', object: body?.object });
        return;
    }
    const entries = Array.isArray(body.entry) ? body.entry : [];
    const allChanges = entries.flatMap((entry) => {
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        const standbys = Array.isArray(entry?.standby)
            ? entry.standby.map((s) => ({ field: 'standby', value: s }))
            : [];
        return [...changes, ...standbys].map((change) => ({ entry, change }));
    });
    // 1. Processar atualizações de status de mensagem (sent, delivered, read)
    for (const item of allChanges) {
        const statusValue = item.change?.value;
        const statusMetadata = statusValue?.metadata;
        const statusWabaId = item.entry?.id;
        const statuses = statusValue?.statuses;
        if (!statuses?.length)
            continue;
        for (const statusObj of statuses) {
            const recipientPhone = normalizeMetaPhone(statusObj.recipient_id);
            const status = statusObj.status;
            if (recipientPhone && status) {
                try {
                    const config = await findWhatsappConfigForWebhook(statusMetadata?.phone_number_id, statusWabaId);
                    if (config) {
                        (0, socket_1.getIo)().to(`org:${config.org_id}`).emit('message_status', {
                            phone: recipientPhone,
                            messageId: statusObj.id,
                            status: status,
                        });
                    }
                }
                catch (_) { }
            }
        }
    }
    // 2. Extrair mensagens recebidas
    const messageItems = allChanges.filter((item) => item.change?.value?.messages?.length > 0);
    if (!messageItems.length) {
        recorder({ method: 'POST', outcome: 'status_only_or_empty', changes: allChanges.length });
        return;
    }
    for (const item of messageItems) {
        const entry = item.entry;
        const changes = item.change;
        const value = changes?.value;
        const messages = value?.messages || [];
        const metadata = value?.metadata;
        const entryWabaId = entry?.id;
        const contacts = value?.contacts;
        const profileName = contacts?.[0]?.profile?.name;
        const phoneNumberId = metadata?.phone_number_id;
        for (const incomingMsg of messages) {
            const messageId = incomingMsg.id;
            const fromNumber = normalizeMetaPhone(incomingMsg.from);
            // A) Echo detection — mensagens enviadas pelo próprio robô
            if (exports.botSentMessages.has(messageId)) {
                console.log(`[WEBHOOK] Echo ignorado: ${messageId}`);
                exports.botSentMessages.delete(messageId);
                continue;
            }
            // B) Coexistência — detectar humano a responder por fora (Meta Business Suite ou app móvel)
            if (fromNumber === normalizeMetaPhone(metadata?.display_phone_number) || incomingMsg.type === 'echo') {
                const recipientNumber = normalizeMetaPhone(incomingMsg.to);
                if (recipientNumber) {
                    const config = await findWhatsappConfigForWebhook(phoneNumberId, entryWabaId);
                    if (config) {
                        const key = `${config.org_id}:${recipientNumber}`;
                        exports.aiPauses.set(key, Date.now() + 5 * 60 * 1000);
                        console.log(`[COEXISTÊNCIA] Humano respondeu para ${recipientNumber}. IA pausada por 5 min.`);
                        await supabase_1.supabaseAdmin.from('conversation_history').insert({
                            org_id: config.org_id,
                            customer_phone: recipientNumber,
                            sender: 'human',
                            text: incomingMsg.text?.body || '(Mídia enviada por humano)',
                        });
                    }
                }
                continue;
            }
            // C) Dedup — evitar reprocessamento
            if (exports.processedMessages.has(messageId)) {
                console.log(`[WEBHOOK] Mensagem ${messageId} já processada. Ignorando.`);
                continue;
            }
            exports.processedMessages.add(messageId);
            console.log(`[WEBHOOK] Nova mensagem de ${fromNumber} (${profileName || 'Sem nome'}) → phone_id ${phoneNumberId || 'n/a'} | waba_id ${entryWabaId || 'n/a'}`);
            // D) Buscar configuração da organização
            const configData = await findWhatsappConfigForWebhook(phoneNumberId, entryWabaId);
            if (!configData) {
                console.warn(`[WEBHOOK] Nenhuma config activa para phone_number_id=${phoneNumberId || 'n/a'} / waba_id=${entryWabaId || 'n/a'}`);
                recorder({
                    method: 'POST',
                    outcome: 'no_active_config',
                    phoneNumberId,
                    wabaId: entryWabaId,
                    from: fromNumber,
                    messageId,
                });
                continue;
            }
            const { org_id: orgId, access_token: accessTokenRaw } = configData;
            const accessToken = accessTokenRaw?.trim();
            if (!accessToken) {
                console.error(`[WEBHOOK] Token de acesso ausente para org ${orgId}`);
                continue;
            }
            // E) Verificar plano e permissão de voz
            const { data: subData } = await supabase_1.supabaseAdmin
                .from('subscriptions')
                .select('plan')
                .eq('org_id', orgId)
                .maybeSingle();
            const { data: orgData } = await supabase_1.supabaseAdmin
                .from('organizations')
                .select('owner_email, chatbot_name')
                .eq('id', orgId)
                .maybeSingle();
            const botName = orgData?.chatbot_name || configData.display_name || 'Assistente';
            const isVoiceAllowed = ['pro', 'enterprise', 'vip'].includes((subData?.plan || '').toLowerCase());
            // F) Processamento do conteúdo e Mídias Multimodais
            let userText = '';
            let media = undefined;
            let clientMediaUrl = null;
            let clientFileName = null;
            let clientMimeType = null;
            let isAudioMessage = false;
            let detectedLanguage = 'pt';
            const referral = incomingMsg.referral;
            let buttonContext = undefined;
            // Suporte completo a botões oficiais da Meta (quick_reply / interactive) e respostas em texto a campanhas
            const isExplicitButton = incomingMsg.type === 'interactive' || incomingMsg.type === 'button';
            const contextMsgId = incomingMsg.context?.id;
            if (isExplicitButton) {
                const buttonTitle = incomingMsg.interactive?.button_reply?.title ||
                    incomingMsg.interactive?.list_reply?.title ||
                    incomingMsg.button?.text ||
                    incomingMsg.button?.payload ||
                    '';
                const buttonId = incomingMsg.interactive?.button_reply?.id ||
                    incomingMsg.interactive?.list_reply?.id ||
                    incomingMsg.button?.payload ||
                    '';
                userText = buttonTitle || (incomingMsg.type === 'button' ? 'Botão clicado' : 'Opção selecionada');
                console.log(`[WEBHOOK-BUTTON] 🔘 Clique de botão detectado de ${fromNumber}: "${buttonTitle}" (ID: ${buttonId}) | ContextMsgId: ${contextMsgId || 'nenhum'}`);
            }
            else if (incomingMsg.type === 'text') {
                userText = incomingMsg.text?.body || '';
            }
            // ── BUSCA ROBUSTA DO CONTEXTO DE CAMPANHA (para cliques em botões e respostas textuais) ──
            const phoneVariants = [fromNumber, `+${fromNumber}`];
            let campaignName;
            let campaignMessageText;
            let buttonOptions = [];
            // 1. Procurar em conversation_history via contextMsgId
            if (contextMsgId) {
                try {
                    const { data: origMsg } = await supabase_1.supabaseAdmin
                        .from('conversation_history')
                        .select('text, metadata')
                        .eq('org_id', orgId)
                        .contains('metadata', { message_id: contextMsgId })
                        .maybeSingle();
                    if (origMsg) {
                        campaignMessageText = origMsg.text;
                        campaignName = origMsg.metadata?.campaign_name;
                        if (Array.isArray(origMsg.metadata?.buttons)) {
                            buttonOptions = origMsg.metadata.buttons.map((b) => b.text || b.title).filter(Boolean);
                        }
                    }
                }
                catch (_) { }
                if (!campaignName) {
                    try {
                        const { data: origMsg2 } = await supabase_1.supabaseAdmin
                            .from('conversation_history')
                            .select('text, metadata')
                            .eq('org_id', orgId)
                            .eq('metadata->>message_id', contextMsgId)
                            .maybeSingle();
                        if (origMsg2) {
                            campaignMessageText = origMsg2.text;
                            campaignName = origMsg2.metadata?.campaign_name;
                            if (Array.isArray(origMsg2.metadata?.buttons)) {
                                buttonOptions = origMsg2.metadata.buttons.map((b) => b.text || b.title).filter(Boolean);
                            }
                        }
                    }
                    catch (_) { }
                }
            }
            // 2. Se não encontrou por contextMsgId, consultar em campaign_logs pelo message_id
            if (!campaignName && contextMsgId) {
                try {
                    const { data: campLog } = await supabase_1.supabaseAdmin
                        .from('campaign_logs')
                        .select('campaign_id')
                        .eq('org_id', orgId)
                        .eq('message_id', contextMsgId)
                        .maybeSingle();
                    if (campLog?.campaign_id) {
                        const { data: camp } = await supabase_1.supabaseAdmin
                            .from('campaigns')
                            .select('name, template, buttons')
                            .eq('id', campLog.campaign_id)
                            .maybeSingle();
                        if (camp) {
                            campaignName = camp.name;
                            if (Array.isArray(camp.buttons)) {
                                buttonOptions = camp.buttons.map((b) => b.text || b.title).filter(Boolean);
                            }
                            const { data: tmpl } = await supabase_1.supabaseAdmin
                                .from('templates')
                                .select('content')
                                .eq('org_id', orgId)
                                .eq('name', camp.template)
                                .maybeSingle();
                            if (tmpl?.content)
                                campaignMessageText = tmpl.content;
                        }
                    }
                }
                catch (_) { }
            }
            // 3. Fallback: buscar a última mensagem de CAMPANHA enviada pelo bot para este número
            const cleanDigits = fromNumber.replace(/\D/g, '');
            const phoneVariantsExtended = [
                fromNumber,
                cleanDigits,
                `+${cleanDigits}`,
                cleanDigits.replace(/^244/, ''),
                cleanDigits.replace(/^351/, ''),
                cleanDigits.replace(/^55/, ''),
                `244${cleanDigits.replace(/^244/, '')}`,
                `351${cleanDigits.replace(/^351/, '')}`,
                `55${cleanDigits.replace(/^55/, '')}`,
            ].filter((v, i, arr) => v && v.length >= 8 && arr.indexOf(v) === i);
            const maxHours = isExplicitButton ? 168 : 120; // 7 dias para cliques em botões, 5 dias para respostas de texto
            if (!campaignMessageText) {
                try {
                    const { data: lastCampaignMsg } = await supabase_1.supabaseAdmin
                        .from('conversation_history')
                        .select('text, metadata, created_at')
                        .eq('org_id', orgId)
                        .in('customer_phone', phoneVariantsExtended)
                        .eq('sender', 'bot')
                        .order('created_at', { ascending: false })
                        .limit(5);
                    if (lastCampaignMsg && lastCampaignMsg.length > 0) {
                        // Encontrar a mensagem mais recente que seja de campanha ou que tenha botões
                        const match = lastCampaignMsg.find((m) => m.metadata?.is_campaign === true ||
                            m.metadata?.is_campaign === 'true' ||
                            m.metadata?.campaign_id ||
                            m.metadata?.campaign_name ||
                            (Array.isArray(m.metadata?.buttons) && m.metadata.buttons.length > 0));
                        if (match) {
                            const msgTime = new Date(match.created_at).getTime();
                            const hoursSince = (Date.now() - msgTime) / (1000 * 60 * 60);
                            if (hoursSince < maxHours) {
                                campaignMessageText = match.text;
                                campaignName = match.metadata?.campaign_name;
                                if (Array.isArray(match.metadata?.buttons)) {
                                    buttonOptions = match.metadata.buttons.map((b) => b.text || b.title).filter(Boolean);
                                }
                            }
                        }
                    }
                }
                catch (_) { }
            }
            // 4. Fallback 2: buscar a campanha mais recente enviada para este número em campaign_logs
            if (!campaignName) {
                try {
                    const { data: recentLog } = await supabase_1.supabaseAdmin
                        .from('campaign_logs')
                        .select('campaign_id, created_at')
                        .eq('org_id', orgId)
                        .in('customer_phone', phoneVariantsExtended)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    if (recentLog?.campaign_id) {
                        const logTime = new Date(recentLog.created_at).getTime();
                        const hoursSinceLog = (Date.now() - logTime) / (1000 * 60 * 60);
                        if (hoursSinceLog < maxHours) {
                            const { data: camp } = await supabase_1.supabaseAdmin
                                .from('campaigns')
                                .select('name, template, buttons')
                                .eq('id', recentLog.campaign_id)
                                .maybeSingle();
                            if (camp) {
                                campaignName = camp.name;
                                if (buttonOptions.length === 0 && Array.isArray(camp.buttons)) {
                                    buttonOptions = camp.buttons.map((b) => b.text || b.title).filter(Boolean);
                                }
                                if (!campaignMessageText && camp.template) {
                                    let { data: tmpl } = await supabase_1.supabaseAdmin
                                        .from('templates')
                                        .select('content')
                                        .eq('org_id', orgId)
                                        .eq('name', camp.template)
                                        .maybeSingle();
                                    if (!tmpl?.content) {
                                        const { data: tmplFuzzy } = await supabase_1.supabaseAdmin
                                            .from('templates')
                                            .select('content')
                                            .eq('org_id', orgId)
                                            .ilike('name', camp.template)
                                            .maybeSingle();
                                        tmpl = tmplFuzzy;
                                    }
                                    if (tmpl?.content)
                                        campaignMessageText = tmpl.content;
                                }
                            }
                        }
                    }
                }
                catch (_) { }
            }
            // ── DETECTAR SE É CLIQUE EM BOTÃO OU RESPOSTA DE TEXTO À CAMPANHA ──
            if (isExplicitButton) {
                const buttonTitle = incomingMsg.interactive?.button_reply?.title ||
                    incomingMsg.interactive?.list_reply?.title ||
                    incomingMsg.button?.text ||
                    incomingMsg.button?.payload ||
                    userText;
                const buttonId = incomingMsg.interactive?.button_reply?.id ||
                    incomingMsg.interactive?.list_reply?.id ||
                    incomingMsg.button?.payload ||
                    'btn_click';
                buttonContext = {
                    buttonTitle,
                    buttonId,
                    campaignName,
                    campaignMessageText,
                    buttonOptions,
                };
            }
            else if (incomingMsg.type === 'text' && (campaignName || campaignMessageText)) {
                // Verificar se o texto do cliente é uma resposta direta à campanha ou corresponde aos botões
                const lowerUser = userText.trim().toLowerCase();
                const matchedBtn = buttonOptions.find(opt => {
                    const lOpt = opt.toLowerCase();
                    return lowerUser.includes(lOpt) || lOpt.includes(lowerUser);
                });
                const intentRegex = /\b(interess|interesse|quero|sim|saber mais|informaç|valores|preço|agendar|comprar|como funciona|tenho|gostaria|obrigad)\b/i;
                const isCampaignReply = !!matchedBtn || intentRegex.test(lowerUser) || !!contextMsgId;
                if (isCampaignReply) {
                    console.log(`[WEBHOOK-CAMPAIGN-REPLY] 🎯 Cliente ${fromNumber} respondeu à campanha "${campaignName || 'Campanha'}": "${userText}"`);
                    buttonContext = {
                        buttonTitle: matchedBtn || userText,
                        buttonId: 'text_campaign_reply',
                        campaignName,
                        campaignMessageText,
                        buttonOptions,
                    };
                }
            }
            else if (incomingMsg.type === 'location') {
                const lat = incomingMsg.location?.latitude;
                const lng = incomingMsg.location?.longitude;
                userText = lat && lng ? `[Localização enviada pelo cliente: ${lat}, ${lng}]` : '[Localização enviada]';
            }
            else if (['image', 'audio', 'video', 'document'].includes(incomingMsg.type)) {
                const mediaObj = incomingMsg[incomingMsg.type];
                const mediaId = mediaObj?.id;
                const caption = mediaObj?.caption || '';
                const filename = mediaObj?.filename || `${incomingMsg.type}_${Date.now()}`;
                if (mediaId) {
                    const mediaData = await whatsapp_service_1.WhatsAppService.getMedia(mediaId, accessToken);
                    if (mediaData) {
                        media = mediaData;
                        clientMimeType = mediaData.mimeType;
                        clientFileName = filename;
                        const uploadPromise = uploadClientMediaToStorage(orgId, mediaData.base64, mediaData.mimeType, filename);
                        if (incomingMsg.type === 'audio') {
                            if (isVoiceAllowed) {
                                const sttResult = await audio_service_1.AudioService.speechToTextFromBase64(mediaData.base64, mediaData.mimeType);
                                if (sttResult) {
                                    userText = `[Mensagem de Áudio]: ${sttResult.text}`;
                                    detectedLanguage = sttResult.language || 'pt';
                                    isAudioMessage = true;
                                    if (detectedLanguage !== 'pt' && detectedLanguage !== 'por') {
                                        userText += `\n\n[SISTEMA INTERNO — NÃO MENCIONAR AO CLIENTE]: O cliente falou em "${detectedLanguage}". Responda EXCLUSIVAMENTE nessa língua. Não use português na resposta enviada ao cliente.`;
                                    }
                                }
                                else {
                                    userText = '(Mensagem de áudio recebida)';
                                }
                            }
                            else {
                                userText = '(Áudio recebido)';
                            }
                        }
                        else if (incomingMsg.type === 'document') {
                            let extractedText = await document_service_1.DocumentService.extractTextFromBase64(mediaData.base64, mediaData.mimeType);
                            if (!extractedText || extractedText.trim().length === 0) {
                                extractedText = await ai_service_1.AIService.readDocumentWithGemini(mediaData.base64, mediaData.mimeType);
                            }
                            if (extractedText) {
                                userText = `[Documento "${filename}"]:\n${extractedText.substring(0, 10_000)}`;
                            }
                            else {
                                userText = `(Documento recebido: ${filename})`;
                            }
                            if (caption)
                                userText = `${caption}\n\n${userText}`;
                        }
                        else if (incomingMsg.type === 'image') {
                            const imgDesc = await ai_service_1.AIService.describeImageWithGemini(mediaData.base64, mediaData.mimeType);
                            userText = imgDesc
                                ? `${caption ? caption + '\n\n' : ''}[Imagem enviada pelo cliente — descrição visual e texto lido]:\n${imgDesc}`
                                : (caption || '(Imagem enviada)');
                        }
                        else if (incomingMsg.type === 'video') {
                            const vidDesc = await ai_service_1.AIService.describeVideoWithGemini(mediaData.base64, mediaData.mimeType);
                            userText = vidDesc
                                ? `${caption ? caption + '\n\n' : ''}[Vídeo enviado]:\n${vidDesc}`
                                : (caption || '(Vídeo enviado)');
                        }
                        clientMediaUrl = await Promise.race([
                            uploadPromise,
                            new Promise(resolve => setTimeout(() => resolve(null), 8000))
                        ]);
                    }
                }
            }
            if (!userText && !media && !referral) {
                console.warn(`[WEBHOOK] Mensagem de ${fromNumber} sem conteúdo reconhecido. Ignorando.`);
                continue;
            }
            let dbText = userText;
            if (!dbText) {
                if (incomingMsg.type === 'text' || incomingMsg.type === 'referral') {
                    dbText = referral ? 'Olá, tenho interesse no anúncio.' : '(Mensagem vazia)';
                }
                else {
                    dbText = `(Mídia: ${incomingMsg.type})`;
                }
            }
            const clientMetadata = {
                platform: 'whatsapp',
                message_id: messageId,
            };
            if (clientMediaUrl) {
                clientMetadata.mediaUrl = clientMediaUrl;
                clientMetadata.fileName = clientFileName || 'ficheiro';
                clientMetadata.mimeType = clientMimeType || 'application/octet-stream';
            }
            if (referral) {
                clientMetadata.referral = referral;
            }
            if (buttonContext) {
                clientMetadata.is_button_click = true;
                clientMetadata.button_title = buttonContext.buttonTitle;
                clientMetadata.button_id = buttonContext.buttonId;
                if (buttonContext.campaignName) {
                    clientMetadata.campaign_name = buttonContext.campaignName;
                }
                if (buttonContext.campaignMessageText) {
                    clientMetadata.campaign_message = buttonContext.campaignMessageText;
                }
            }
            // G) Gravar mensagem do cliente no histórico
            const { error: clientInsertError } = await supabase_1.supabaseAdmin.from('conversation_history').insert({
                org_id: orgId,
                customer_phone: fromNumber,
                sender: 'user',
                text: dbText,
                metadata: clientMetadata,
            });
            if (clientInsertError) {
                console.error('[WEBHOOK] Falha ao gravar mensagem do cliente:', formatDbError(clientInsertError));
                continue;
            }
            // Upsert de contacto inicial
            await supabase_1.supabaseAdmin.from('contacts').upsert({
                org_id: orgId,
                phone: fromNumber,
                name: profileName || undefined,
                source: 'whatsapp',
                updated_at: new Date().toISOString(),
            }, { onConflict: 'org_id,phone' });
            // Cancelar follow-ups pendentes (cliente respondeu)
            followup_service_1.FollowupService.cancelPendingForPhone(orgId, fromNumber).catch(() => { });
            // H) Emitir em tempo real para o Live Chat
            try {
                (0, socket_1.getIo)().to(`org:${orgId}`).emit('new_message', {
                    phone: fromNumber,
                    sender: 'user',
                    text: dbText,
                    time: new Date().toLocaleTimeString('pt-PT', { timeZone: 'Africa/Luanda', hour: '2-digit', minute: '2-digit' }),
                    timestamp: new Date().toISOString(),
                    platform: 'whatsapp',
                    metadata: clientMetadata,
                });
            }
            catch (_) { }
            try {
                (0, socket_1.getIo)().to(`org:${orgId}`).emit('bot_typing', { phone: fromNumber, typing: true });
            }
            catch (_) { }
            recorder({
                method: 'POST',
                outcome: 'message_saved',
                orgId,
                from: fromNumber,
                phoneNumberId,
                wabaId: entryWabaId,
                messageId,
                type: incomingMsg.type,
            });
            // I) Disparar IA
            const aiOutcome = await triggerAIResponse({
                orgId,
                fromNumber,
                phoneNumberId: phoneNumberId || configData.phone_number_id,
                accessToken,
                botName: botName || 'Assistente',
                message: dbText,
                incomingMessageId: messageId,
                senderName: profileName,
                media,
                referral,
                isAudio: isAudioMessage,
                isVoiceAllowed,
                detectedLanguage,
                buttonContext,
            });
            try {
                (0, socket_1.getIo)().to(`org:${orgId}`).emit('bot_typing', { phone: fromNumber, typing: false });
            }
            catch (_) { }
            recorder({
                method: 'POST',
                outcome: aiOutcome.ok ? 'ai_flow_completed' : 'ai_flow_failed',
                orgId,
                from: fromNumber,
                phoneNumberId,
                wabaId: entryWabaId,
                messageId,
                error: aiOutcome.error,
                sentMsgId: aiOutcome.sentMsgId,
            });
        }
    }
}
