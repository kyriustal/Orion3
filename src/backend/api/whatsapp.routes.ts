import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import { AIService, getUniqueApiKeys } from '../services/ai.service';
import { WhatsAppService } from '../services/whatsapp.service';
import { AudioService } from '../services/audio.service';
import { DocumentService } from '../services/document.service';
import { EmailService } from '../services/email.service';
import { PushService } from '../services/push.service';
import { getIo } from '../socket';
import axios from 'axios';
import fs from 'fs';

const router = Router();

// ─── Controlo de estado em memória ────────────────────────────────────────────

/** Dedup — IDs de mensagens já processadas (limpa a cada 10 min) */
const processedMessages = new Set<string>();
setInterval(() => processedMessages.clear(), 10 * 60 * 1000);

/** Echo detection — IDs de mensagens enviadas pela nossa IA (limpa a cada 30 min) */
const botSentMessages = new Set<string>();
setInterval(() => botSentMessages.clear(), 30 * 60 * 1000);

/** Coexistência — timestamp de quando o humano respondeu por último (limpa automaticamente) */
const aiPauses = new Map<string, number>();

// ─── GET /api/whatsapp/ping ───────────────────────────────────────────────────
router.get('/ping', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const { data: config } = await supabaseAdmin
      .from('whatsapp_config')
      .select('is_active, display_name, phone_number_id')
      .eq('org_id', orgId)
      .maybeSingle();

    res.json({
      status: 'ok',
      config_active: !!config?.is_active,
      bot_name: config?.display_name || 'Não configurado',
      phone_id: config?.phone_number_id || 'Não configurado',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/whatsapp/config ─────────────────────────────────────────────────
router.get('/config', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const { data, error } = await supabaseAdmin
      .from('whatsapp_config')
      .select('*')
      .eq('org_id', orgId)
      .maybeSingle();

    if (error) throw error;
    res.json(data || null);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/whatsapp/chats — Listar conversas ───────────────────────────────
router.get('/chats', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;

    const { data: history, error } = await supabaseAdmin
      .from('conversation_history')
      .select('customer_phone, text, created_at, sender, metadata')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(5000);

    if (error) throw error;

    const chatsMap = new Map<string, any>();
    (history || []).forEach(item => {
      if (!item.customer_phone || item.customer_phone === 'null') return;
      if (!chatsMap.has(item.customer_phone)) {
        const platform = item.metadata?.platform || 'whatsapp';
        let nameDisplay = `WhatsApp (${item.customer_phone})`;
        if (platform === 'instagram') nameDisplay = `Instagram (@${item.customer_phone})`;
        else if (platform === 'facebook') nameDisplay = `Messenger (${item.customer_phone.slice(-6)})`;

        chatsMap.set(item.customer_phone, {
          id: item.customer_phone,
          phone: item.customer_phone,
          name: nameDisplay,
          lastMessage: item.text,
          time: new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          timestamp: item.created_at,
          lastSender: item.sender,
          platform: platform,
        });
      }
    });

    res.json(Array.from(chatsMap.values()));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/whatsapp/history/:phone ─────────────────────────────────────────
router.get('/history/:phone', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const { phone } = req.params;

    const { data, error } = await supabaseAdmin
      .from('conversation_history')
      .select('*')
      .eq('org_id', orgId)
      .eq('customer_phone', phone)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) throw error;

    const messages = (data || []).reverse().map(m => ({
      id: m.id,
      sender: m.sender,
      text: m.text,
      time: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: m.created_at,
      botName: m.metadata?.botName || undefined,
    }));

    res.json(messages);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/whatsapp/send — Envio manual pelo agente humano ────────────────
router.post('/send', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ error: 'phone e message são obrigatórios.' });
    }

    const { data: config } = await supabaseAdmin
      .from('whatsapp_config')
      .select('phone_number_id, access_token')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .maybeSingle();

    if (!config) return res.status(404).json({ error: 'Nenhuma configuração WhatsApp activa.' });

    // Pausar a IA por 5 minutos quando o agente humano envia
    const historyKey = `${orgId}:${phone}`;
    aiPauses.set(historyKey, Date.now() + 5 * 60 * 1000);

    const sentId = await WhatsAppService.sendTextMessage(
      config.phone_number_id,
      phone,
      message,
      config.access_token
    );

    if (sentId) botSentMessages.add(sentId);

    // Persistir no histórico
    await supabaseAdmin.from('conversation_history').insert({
      org_id: orgId,
      customer_phone: phone,
      sender: 'human',
      text: message,
    });

    res.json({ message: 'Mensagem enviada com sucesso.', id: sentId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/whatsapp/config — Guardar configuração com validação Meta ──────
router.post('/config', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const { phone_number_id, waba_id, access_token } = req.body;

    if (!phone_number_id || !access_token) {
      return res.status(400).json({ error: 'phone_number_id e access_token são obrigatórios.' });
    }

    try {
      // Validar credenciais na Meta
      const metaUrl = `https://graph.facebook.com/v19.0/${phone_number_id}?fields=display_phone_number,verified_name,quality_rating&access_token=${access_token}`;
      const metaResponse = await axios.get(metaUrl);

      const verifiedName  = metaResponse.data?.verified_name || null;
      const displayPhone  = metaResponse.data?.display_phone_number || null;

      console.log(`[WHATSAPP] Credenciais válidas para: ${verifiedName} (${displayPhone})`);

      const { data, error } = await supabaseAdmin
        .from('whatsapp_config')
        .upsert({
          org_id: orgId,
          phone_number_id,
          waba_id: waba_id || null,
          access_token,
          display_name: verifiedName,
          is_active: true,
        }, { onConflict: 'org_id' })
        .select()
        .single();

      if (error) throw error;

      return res.json({ message: `WhatsApp Conectado! Número verificado: ${verifiedName}`, data });

    } catch (metaError: any) {
      const msg  = metaError.response?.data?.error?.message || metaError.message;
      const code = metaError.response?.data?.error?.code;

      console.error(`[WHATSAPP] Meta rejeitou credenciais. Código: ${code}. Msg: ${msg}`);
      return res.status(400).json({ error: 'Credenciais inválidas rejeitadas pela Meta', details: msg, code });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/whatsapp/webhook — Verificação Meta ─────────────────────────────
router.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'orion_webhook_token';
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[WEBHOOK] Verificado com sucesso pela Meta.');
    res.status(200).send(challenge);
  } else {
    console.warn('[WEBHOOK] Falha na verificação. Token inválido.');
    res.sendStatus(403);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  Função principal de resposta da IA
// ─────────────────────────────────────────────────────────────────────────────
async function triggerAIResponse(params: {
  orgId: string;
  fromNumber: string;
  phoneNumberId: string;
  accessToken: string;
  botName: string;
  message: string;
  incomingMessageId: string;
  media?: { base64: string; mimeType: string };
  referral?: any;
  isAudio?: boolean;
  isVoiceAllowed?: boolean;
  detectedLanguage?: string;
}) {
  const {
    orgId, fromNumber, phoneNumberId, accessToken, botName,
    message, incomingMessageId, media, referral, isAudio, isVoiceAllowed,
    detectedLanguage = 'pt',
  } = params;

  // Verificar se a IA está pausada (coexistência com humano)
  const historyKey = `${orgId}:${fromNumber}`;
  if (aiPauses.has(historyKey) && aiPauses.get(historyKey)! > Date.now()) {
    console.log(`[IA] Pausada para ${fromNumber}. Mensagem recebida mas não respondida (humano no controlo).`);
    return;
  }

  try {
    // Indicador de "digitando..."
    try {
      await WhatsAppService.sendTypingIndicator(phoneNumberId, incomingMessageId, accessToken);
    } catch (_) { /* silencioso */ }

    // Buscar histórico das últimas 24h (máx 50 mensagens)
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: dbHistory } = await supabaseAdmin
      .from('conversation_history')
      .select('sender, text, created_at')
      .eq('org_id', orgId)
      .eq('customer_phone', fromNumber)
      .gte('created_at', last24h)
      .order('created_at', { ascending: false })
      .limit(50);

    let timeSinceLastMessageHours = 0;
    if (dbHistory && dbHistory.length > 1) {
      // dbHistory[0] is the message we just inserted. dbHistory[1] is the previous one.
      const currentMsgTime = new Date(dbHistory[0].created_at).getTime();
      const prevMsgTime = new Date(dbHistory[1].created_at).getTime();
      timeSinceLastMessageHours = (currentMsgTime - prevMsgTime) / (1000 * 60 * 60);
    }

    // dbHistory[0] é a mensagem atual que acabámos de persistir no banco antes de chamar a IA.
    // Excluímo-la para passar à IA apenas o histórico anterior real.
    const pastDbHistory = dbHistory ? dbHistory.slice(1) : [];
    const history = pastDbHistory.reverse().map(h => ({ sender: h.sender, text: h.text }));

    // Gerar resposta com IA (Gemini 2.5 Flash + Thinking)
    const aiResult = await AIService.generateResponse({
      message,
      orgId,
      history,
      botName,
      mode: 'simulation',
      media,
      referral,
      timeSinceLastMessageHours,
    });

    if (!aiResult?.reply) {
      throw new Error('Resposta da IA vazia.');
    }

    // ── Disparar notificações de Booking ou Handover ──
    if (aiResult.transfer || aiResult.booking) {
      const alertType = aiResult.transfer ? 'handover' : 'booking';
      const alertTitle = aiResult.transfer ? '🚨 Pedido de Atendimento Humano' : '📅 Novo Pedido de Agendamento';
      const alertBody  = aiResult.transfer
        ? `O cliente ${fromNumber} quer falar com um assistente.`
        : `O cliente ${fromNumber} solicitou um agendamento.`;
      
      // 1. Enviar email para admins/owners
      EmailService.sendAlertNotification(orgId, alertType, fromNumber, 'Cliente', message).catch(e => console.error('[ALERTA] Erro ao enviar email:', e.message));
      
      // 2. Web Push Notification (segundo plano, browser fechado)
      PushService.sendAlertToOrg(orgId, {
        title: alertTitle,
        body:  alertBody,
        type:  alertType,
        url:   '/dashboard/live-chat',
      }).catch(e => console.error('[ALERTA] Erro ao enviar push:', e.message));

      // 3. Emitir evento Socket para notificação sonora no painel (browser aberto)
      try {
        getIo().to(`org:${orgId}`).emit(alertType === 'handover' ? 'handover_alert' : 'booking_alert', {
          phone: fromNumber,
          message: message,
          type: alertType,
          platform: 'whatsapp'
        });
      } catch (_) { /* silencioso */ }

      // Se for transferência para humano, pausar a IA por 24h automaticamente
      if (aiResult.transfer) {
        aiPauses.set(historyKey, Date.now() + 24 * 60 * 60 * 1000);
        console.log(`[IA] Handover detectado. IA pausada automaticamente por 24h para ${fromNumber}`);
      }
    }

    let replyText = aiResult.reply;
    let ptReplyText = replyText;

    // Tradução silenciosa para PT para manter o painel/histórico em português
    if (detectedLanguage !== 'pt' && detectedLanguage !== 'por') {
      console.log(`[IA] Traduzindo silenciosamente a resposta de ${detectedLanguage} para PT...`);
      ptReplyText = await AIService.translateText(replyText, 'português');
    }
    
    // ── 10. Processar envio de arquivos [SEND_FILE: ID] ───────────────────────
    const fileMatch = replyText.match(/\[SEND_FILE:\s*([a-f0-9-]{36})\]/i);
    if (fileMatch) {
      const assetId = fileMatch[1];
      console.log(`[IA] Comando de envio de arquivo detectado: ${assetId}`);
      
      // Remover o código do texto da resposta (ambas as versões)
      replyText = replyText.replace(/\[SEND_FILE:\s*[a-f0-9-]{36}\]/i, '').trim();
      ptReplyText = ptReplyText.replace(/\[SEND_FILE:\s*[a-f0-9-]{36}\]/i, '').trim();

      // Buscar asset no banco
      const { data: asset } = await supabaseAdmin
        .from('public_assets')
        .select('*')
        .eq('id', assetId)
        .eq('org_id', orgId)
        .single();

      if (asset) {
        console.log(`[IA] Enviando arquivo "${asset.filename}" para ${fromNumber}...`);
        await WhatsAppService.sendMediaByUrl(
          fromNumber, 
          asset.file_url, 
          asset.mime_type, 
          asset.filename, 
          phoneNumberId, 
          accessToken
        );
      } else {
        console.warn(`[IA] Asset ${assetId} não encontrado para org ${orgId}`);
      }
    }

    // Persistir resposta no histórico em PORTUGUÊS
    await supabaseAdmin.from('conversation_history').insert({
      org_id: orgId,
      customer_phone: fromNumber,
      sender: 'bot',
      text: ptReplyText,
    });

    // Emitir resposta da IA para o Live Chat em tempo real em PORTUGUÊS
    try {
      getIo().to(`org:${orgId}`).emit('new_message', {
        phone:     fromNumber,
        sender:    'bot',
        text:      ptReplyText,
        botName:   botName,
        time:      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: new Date().toISOString(),
        platform:  'whatsapp',
      });
    } catch (_) { /* silencioso */ }

    // Enviar mensagem
    let sentMsgId: string | null = null;

    // Se for áudio e a voz estiver autorizada, tentar TTS
    if (isAudio && isVoiceAllowed) {
      const audioPath = await AudioService.textToSpeech(replyText);
      if (audioPath && fs.existsSync(audioPath)) {
        const mediaId = await WhatsAppService.uploadMedia(audioPath, phoneNumberId, accessToken);
        if (mediaId) {
          sentMsgId = await WhatsAppService.sendAudio(fromNumber, mediaId, phoneNumberId, accessToken);
        }
        fs.unlinkSync(audioPath);
      }
    }

    // Fallback: texto
    if (!sentMsgId && replyText) {
      sentMsgId = await WhatsAppService.sendTextMessage(phoneNumberId, fromNumber, replyText, accessToken);
    }

    if (sentMsgId) {
      botSentMessages.add(sentMsgId);
      console.log(`[IA] Mensagem entregue para ${fromNumber}. ID: ${sentMsgId}`);
    } else {
      throw new Error('Falha ao enviar mensagem via WhatsApp (Meta API).');
    }

    // Se a IA detectou pedido de transferência, pausar por 30 minutos
    if (aiResult.transfer) {
      aiPauses.set(historyKey, Date.now() + 30 * 60 * 1000);
      console.log(`[IA] Transferência para humano solicitada para ${fromNumber}. IA pausada por 30 min.`);
    }

  } catch (err: any) {
    console.error(`[IA] ERRO no fluxo para ${fromNumber}:`, err.message);

    // Logar erro no histórico para visibilidade no dashboard
    try {
      await supabaseAdmin.from('conversation_history').insert({
        org_id: orgId,
        customer_phone: fromNumber,
        sender: 'bot',
        text: `[Erro do sistema] Desculpe, tive um problema técnico temporário. Por favor tente novamente em breve.`,
      });
    } catch (_) { /* silencioso */ }
  }
}

// ─── POST /api/whatsapp/webhook — Recepção de mensagens ──────────────────────
router.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Responder 200 à Meta imediatamente

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    const entry    = body.entry?.[0];
    const changes  = entry?.changes?.[0];
    const value    = changes?.value;
    const messages = value?.messages;
    const metadata = value?.metadata;

    if (!messages || messages.length === 0) return;

    const incomingMsg = messages[0];
    const messageId   = incomingMsg.id;

    // ── 1. Echo detection — ignorar mensagens enviadas pela nossa IA ──────────
    if (botSentMessages.has(messageId)) {
      console.log(`[WEBHOOK] Echo ignorado: ${messageId}`);
      botSentMessages.delete(messageId);
      return;
    }

    // ── 2. Coexistência — detectar humano a responder por fora (Meta Business Suite) ──
    if (incomingMsg.from === metadata?.display_phone_number || incomingMsg.type === 'echo') {
      const recipientNumber = incomingMsg.to;
      if (recipientNumber) {
        const { data: config } = await supabaseAdmin
          .from('whatsapp_config')
          .select('org_id')
          .eq('phone_number_id', metadata?.phone_number_id)
          .maybeSingle();

        if (config) {
          const key = `${config.org_id}:${recipientNumber}`;
          aiPauses.set(key, Date.now() + 5 * 60 * 1000); // Pausa 5 minutos
          console.log(`[COEXISTÊNCIA] Humano respondeu para ${recipientNumber}. IA pausada por 5 min.`);

          await supabaseAdmin.from('conversation_history').insert({
            org_id: config.org_id,
            customer_phone: recipientNumber,
            sender: 'human',
            text: incomingMsg.text?.body || '(Mídia enviada por humano)',
          });
        }
      }
      return;
    }

    // ── 3. Dedup — evitar processamento duplicado ─────────────────────────────
    if (processedMessages.has(messageId)) {
      console.log(`[WEBHOOK] Mensagem ${messageId} já processada. Ignorando.`);
      return;
    }
    processedMessages.add(messageId);

    const fromNumber   = incomingMsg.from;
    const phoneNumberId = metadata?.phone_number_id;
    const referral     = incomingMsg.referral;

    console.log(`[WEBHOOK] Nova mensagem de ${fromNumber} → phone_id ${phoneNumberId}`);

    // ── 4. Buscar configuração da organização ─────────────────────────────────
    const { data: configData, error: dbError } = await supabaseAdmin
      .from('whatsapp_config')
      .select('org_id, access_token, display_name')
      .eq('phone_number_id', phoneNumberId)
      .eq('is_active', true)
      .maybeSingle();

    if (dbError) console.error('[WEBHOOK] Erro DB:', dbError.message);

    if (!configData) {
      console.warn(`[WEBHOOK] Nenhuma config activa para phone_number_id: ${phoneNumberId}`);
      return;
    }

    const { org_id: orgId, access_token: accessTokenRaw } = configData;

    // ── 5. Verificar plano (voz disponível em Pro/Enterprise/VIP) ─────────────
    const { data: subData } = await supabaseAdmin
      .from('subscriptions')
      .select('plan')
      .eq('org_id', orgId)
      .maybeSingle();

    const { data: orgData } = await supabaseAdmin
      .from('organizations')
      .select('owner_email, chatbot_name')
      .eq('id', orgId)
      .maybeSingle();

    const botName = orgData?.chatbot_name || configData.display_name || 'Assistente';
    const accessToken = accessTokenRaw?.trim();

    let isVip = false;
    if (orgData?.owner_email) {
      const { data: vipEntry } = await supabaseAdmin
        .from('vips')
        .select('id')
        .eq('email', orgData.owner_email.toLowerCase())
        .maybeSingle();
      if (vipEntry) isVip = true;

      if (!isVip) {
        const vipEmails = (process.env.VIP_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
        if (vipEmails.includes(orgData.owner_email.toLowerCase())) isVip = true;
      }
    }

    const currentPlan   = subData?.plan || 'trial';
    const isVoiceAllowed = true; // Habilitado universalmente conforme os requisitos de IA multimodal

    // ── 6. Extrair conteúdo da mensagem ──────────────────────────────────────
    let userText = '';
    let media: { base64: string; mimeType: string } | undefined;
    let isAudioMessage = false;
    let detectedLanguage = 'pt'; // Língua detectada no áudio do cliente (default: português)

    if (incomingMsg.type === 'text') {
      userText = incomingMsg.text?.body || '';

    } else if (['image', 'video', 'audio', 'document'].includes(incomingMsg.type)) {
      const mediaObj = incomingMsg[incomingMsg.type];
      const mediaId  = mediaObj?.id;
      const caption  = mediaObj?.caption || '';
      const filename = mediaObj?.filename || 'ficheiro';

      if (mediaId) {
        console.log(`[WEBHOOK] Mídia (${incomingMsg.type}) detectada. A descarregar...`);
        const mediaData = await WhatsAppService.getMedia(mediaId, accessToken);

        if (mediaData) {
          media = mediaData;

          if (incomingMsg.type === 'audio') {
            // Transcrição de áudio via Whisper/Gemini — detecta língua automaticamente
            if (isVoiceAllowed) {
              const sttResult = await AudioService.speechToTextFromBase64(mediaData.base64, mediaData.mimeType);
              if (sttResult) {
                userText = `[Mensagem de Áudio]: ${sttResult.text}`;
                detectedLanguage = sttResult.language || 'pt';
                isAudioMessage = true;
                console.log(`[WEBHOOK] Áudio transcrito (língua: ${detectedLanguage}): "${sttResult.text.substring(0, 80)}"`);
                // Instruir a IA a responder na língua do cliente
                if (detectedLanguage !== 'pt' && detectedLanguage !== 'por') {
                  userText += `\n\n[SISTEMA INTERNO — NÃO MENCIONAR AO CLIENTE]: O cliente falou em "${detectedLanguage}". Responda EXCLUSIVAMENTE nessa língua. Não use português na resposta enviada ao cliente.`;
                }
              } else {
                userText = '(Mensagem de áudio não transcrita)';
              }
            } else {
              userText = '(Áudio recebido — plano Pro necessário para transcrição)';
            }
          } else if (incomingMsg.type === 'document') {
            // Extracção de texto de documentos
            const extractedText = await DocumentService.extractTextFromBase64(mediaData.base64, mediaData.mimeType);
            if (extractedText) {
              userText = `[Documento "${filename}"]:\n${extractedText.substring(0, 10_000)}`;
            } else {
              userText = `(Documento recebido: ${filename})`;
            }
            if (caption) userText = `${caption}\n\n${userText}`;

          } else if (incomingMsg.type === 'image') {
            userText = caption || '(Imagem enviada)';
            // media é passado para o AIService que usa multimodalidade

          } else {
            userText = caption || `(Ficheiro de ${incomingMsg.type} enviado)`;
          }
        }
      }
    }

    if (!userText && !media) {
      console.warn(`[WEBHOOK] Mensagem de ${fromNumber} sem conteúdo reconhecido. Ignorando.`);
      return;
    }

    // ── 7. Enriquecer texto com contexto de anúncio ───────────────────────────
    let dbText = userText;
    if (!dbText) {
      if (incomingMsg.type === 'text') {
        dbText = referral ? '(Clique no anúncio)' : '(Mensagem vazia)';
      } else {
        dbText = `(Mídia: ${incomingMsg.type})`;
      }
    }

    if (referral) {
      const adIdentifier = referral.headline || referral.body || 'Anúncio';
      let referralContext = `[Vindo do Anúncio: "${adIdentifier}"]`;
      
      if (referral.source_url) {
        referralContext += `\nLink do Anúncio: ${referral.source_url}`;
      }
      
      dbText = `${referralContext}\n\n${dbText}`;
      console.log(`[WEBHOOK] Cliente vindo de anúncio: ${adIdentifier} (${referral.source_url || 'Sem link'})`);
    }

    // ── 8. Persistir mensagem do cliente ─────────────────────────────────────
    await supabaseAdmin.from('conversation_history').insert({
      org_id: orgId,
      customer_phone: fromNumber,
      sender: 'user',
      text: dbText,
    });

    // ── 8b. Emitir evento em tempo real para o Live Chat ──────────────────────
    try {
      getIo().to(`org:${orgId}`).emit('new_message', {
        phone:     fromNumber,
        sender:    'user',
        text:      dbText,
        time:      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: new Date().toISOString(),
        platform:  'whatsapp',
      });
    } catch (_) { /* sem clientes conectados */ }


    // ── 9. Gerar e enviar resposta da IA ─────────────────────────────────────
    // Emitir sinal de digitação para o Live Chat
    try {
      getIo().to(`org:${orgId}`).emit('bot_typing', { phone: fromNumber, typing: true });
    } catch (_) {}

    await triggerAIResponse({
      orgId,
      fromNumber,
      phoneNumberId,
      accessToken,
      botName: botName || 'Assistente',
      message: dbText,
      incomingMessageId: messageId,
      media,
      referral,
      isAudio: isAudioMessage,
      isVoiceAllowed,
      detectedLanguage,
    });

    // Desativar sinal de digitação
    try {
      getIo().to(`org:${orgId}`).emit('bot_typing', { phone: fromNumber, typing: false });
    } catch (_) {}

  } catch (err: any) {
    console.error('[WEBHOOK] Erro fatal:', err.message);
  }
});

// ─── POST /api/whatsapp/ai-pause — Pausar/Retomar IA manualmente ──────────────
router.post('/ai-pause', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const { phone, pause } = req.body; // pause: true = pausar, false = retomar

    const key = `${orgId}:${phone}`;

    if (pause) {
      aiPauses.set(key, Date.now() + 24 * 60 * 60 * 1000); // 24h
      res.json({ message: 'IA pausada para este contacto.' });
    } else {
      aiPauses.delete(key);
      res.json({ message: 'IA retomada para este contacto.' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/whatsapp/recover-missed — Trigger recovery manually ───────────
router.post('/recover-missed', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    if (!orgId) return res.status(401).json({ error: 'Não autorizado.' });
    
    // Executar de forma assíncrona para não bloquear
    recoverMissedMessages();
    
    res.json({ message: 'Processo de recuperação de mensagens não respondidas iniciado em segundo plano.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  Função de Recuperação de Mensagens Não Respondidas (Sistema de Lead Rescue)
// ─────────────────────────────────────────────────────────────────────────────
export async function recoverMissedMessages() {
  console.log('[RECOVERY] Iniciando verificação de mensagens não respondidas...');
  try {
    const last7days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: errorMessages, error } = await supabaseAdmin
      .from('conversation_history')
      .select('id, org_id, customer_phone, created_at')
      .eq('sender', 'bot')
      .ilike('text', '%Erro do sistema%')
      .gte('created_at', last7days)
      .order('created_at', { ascending: false });

    if (error || !errorMessages || errorMessages.length === 0) {
      console.log('[RECOVERY] Nenhuma mensagem de erro encontrada nos últimos 7 dias.');
      return;
    }

    console.log(`[RECOVERY] Encontradas ${errorMessages.length} mensagens de erro para processar.`);

    const processedChats = new Set<string>();

    for (const errMsg of errorMessages) {
      const chatKey = `${errMsg.org_id}:${errMsg.customer_phone}`;
      if (processedChats.has(chatKey)) {
        await supabaseAdmin.from('conversation_history').delete().eq('id', errMsg.id);
        continue;
      }
      processedChats.add(chatKey);

      console.log(`[RECOVERY] Recuperando chat de ${errMsg.customer_phone} para org ${errMsg.org_id}...`);

      await supabaseAdmin.from('conversation_history').delete().eq('id', errMsg.id);

      const { data: userMsgs } = await supabaseAdmin
        .from('conversation_history')
        .select('text, metadata')
        .eq('org_id', errMsg.org_id)
        .eq('customer_phone', errMsg.customer_phone)
        .eq('sender', 'user')
        .order('created_at', { ascending: false })
        .limit(1);

      if (!userMsgs || userMsgs.length === 0) {
        console.warn(`[RECOVERY] Nenhuma mensagem de utilizador encontrada para ${errMsg.customer_phone}.`);
        continue;
      }

      const lastUserMsg = userMsgs[0];
      
      const { data: config } = await supabaseAdmin
        .from('whatsapp_config')
        .select('phone_number_id, access_token, display_name')
        .eq('org_id', errMsg.org_id)
        .eq('is_active', true)
        .maybeSingle();

      if (!config) {
        console.warn(`[RECOVERY] Configuração ativa do WhatsApp não encontrada para a org ${errMsg.org_id}.`);
        continue;
      }

      const { phone_number_id: phoneNumberId, access_token: accessToken, display_name: displayName } = config;

      const { data: orgData } = await supabaseAdmin
        .from('organizations')
        .select('chatbot_name')
        .eq('id', errMsg.org_id)
        .maybeSingle();

      const botName = orgData?.chatbot_name || displayName || 'Assistente';

      console.log(`[RECOVERY] Disparando IA para responder a ${errMsg.customer_phone} com texto: "${lastUserMsg.text.substring(0, 50)}..."`);
      
      await triggerAIResponse({
        orgId: errMsg.org_id,
        fromNumber: errMsg.customer_phone,
        phoneNumberId,
        accessToken,
        botName,
        message: lastUserMsg.text,
        incomingMessageId: lastUserMsg.metadata?.message_id || `recovered_${Date.now()}`,
        media: undefined,
        referral: lastUserMsg.metadata?.referral || undefined,
        isAudio: false,
        isVoiceAllowed: false
      });
    }

    console.log('[RECOVERY] Processo de recuperação concluído com sucesso.');
  } catch (err: any) {
    console.error('[RECOVERY] Erro crítico no processo de recuperação:', err.message);
  }
}

// ─── GET /api/whatsapp/test-keys — Diagnosticar online todas as chaves Gemini ─
router.get('/test-keys', async (req, res) => {
  try {
    const keys = getUniqueApiKeys();
    const results: any[] = [];

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const masked = key.substring(0, 8) + '...' + key.substring(key.length - 4);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
      
      try {
        const response = await axios.post(url, {
          contents: [{ parts: [{ text: 'Ping' }] }]
        }, { timeout: 15000 });

        const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        results.push({
          index: i + 1,
          key: masked,
          status: 'SUCESSO',
          reply: text?.trim()
        });
      } catch (err: any) {
        const errData = err.response?.data;
        results.push({
          index: i + 1,
          key: masked,
          status: 'FALHOU',
          error: errData?.error?.message || err.message,
          fullError: errData
        });
      }
    }

    res.json({
      timestamp: new Date().toISOString(),
      total_keys: keys.length,
      results
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/whatsapp/recover-force — Trigger recovery manually via GET ──────
router.get('/recover-force', async (req, res) => {
  try {
    console.log('[RECOVERY-GET] Disparando recuperação forçada via GET...');
    await recoverMissedMessages();
    res.send('<h1>Processo de recuperação de leads iniciado com sucesso!</h1><p>Os erros foram limpos e as mensagens foram respondidas. Verifique os logs e o Live Chat para confirmar.</p>');
  } catch (err: any) {
    res.status(500).send(`Erro na recuperação: ${err.message}`);
  }
});

export default router;
