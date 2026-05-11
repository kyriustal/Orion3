import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import { AIService } from '../services/ai.service';
import { WhatsAppService } from '../services/whatsapp.service';
import { AudioService } from '../services/audio.service';
import axios from 'axios';
import fs from 'fs';

const router = Router();

// O histórico agora é persistido no banco de dados (tabela conversation_history)
// para permitir janelas de contexto de 24h e recuperação de longo prazo.

// /api/whatsapp/config (GET)
router.get('/config', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.id;
    const { data, error } = await supabaseAdmin
      .from('whatsapp_config')
      .select('*')
      .eq('org_id', orgId)
      .maybeSingle();

    if (error) throw error;
    res.json(data || null);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// /api/whatsapp/config (POST) — Com validação real nas credenciais da Meta
router.post('/config', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.id;
    const { phone_number_id, waba_id, access_token } = req.body;

    if (!phone_number_id || !access_token) {
      return res.status(400).json({ error: 'Campos obrigatórios em falta: phone_number_id e access_token.' });
    }

    // ===== VALIDAÇÃO REAL NAS CREDENCIAIS DA META =====
    try {
      const metaValidationUrl = `https://graph.facebook.com/v19.0/${phone_number_id}?fields=display_phone_number,verified_name,quality_rating&access_token=${access_token}`;
      const metaResponse = await axios.get(metaValidationUrl);

      // Se chegou aqui, as credenciais são válidas. Extraímos o nome verificado.
      const verifiedName = metaResponse.data?.verified_name || null;
      const displayPhone = metaResponse.data?.display_phone_number || null;

      console.log(`[WHATSAPP] Credenciais válidas para: ${verifiedName} (${displayPhone})`);

      // Salvar no banco com dados verificados
      const configData = {
        org_id: orgId,
        phone_number_id,
        waba_id: waba_id || null,
        access_token,
        display_name: verifiedName,
        is_active: true
      };

      const { data, error } = await supabaseAdmin
        .from('whatsapp_config')
        .upsert(configData, { onConflict: 'org_id' })
        .select()
        .single();

      if (error) {
        console.error('[WHATSAPP] Erro ao salvar:', error.message);
        return res.status(400).json({ error: 'Erro no Banco de Dados', details: error.message });
      }

      return res.json({ message: `WhatsApp Conectado! Número verificado: ${verifiedName}`, data });

    } catch (metaError: any) {
      // A Meta rejeitou as credenciais
      const metaErrorMsg = metaError.response?.data?.error?.message || metaError.message;
      const metaErrorCode = metaError.response?.data?.error?.code;

      console.error(`[WHATSAPP] Credenciais rejeitadas pela Meta. Código: ${metaErrorCode}. Mensagem: ${metaErrorMsg}`);

      return res.status(400).json({
        error: 'Credenciais inválidas rejeitadas pela Meta',
        details: metaErrorMsg,
        code: metaErrorCode
      });
    }

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Webhook — Verificação (GET)
router.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'orion_webhook_token';
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[WEBHOOK] Webhook verificado com sucesso pela Meta.');
    res.status(200).send(challenge);
  } else {
    console.warn('[WEBHOOK] Verificação do webhook falhou. Token inválido.');
    res.sendStatus(403);
  }
});

// Cache para Pausas de IA (Modo Híbrido)
const aiPauses: Map<string, number> = new Map();

// Controle de deduplicação de mensagens (IDs da Meta)
const processedMessages: Set<string> = new Set();
setInterval(() => processedMessages.clear(), 10 * 60 * 1000); // Limpa a cada 10 min

// Controle de timeouts agendados
const scheduledChecks: Map<string, NodeJS.Timeout> = new Map();

async function triggerAIResponse(params: {
  orgId: string;
  fromNumber: string;
  phoneNumberId: string;
  accessToken: string;
  botName: string;
  message: string;
  incomingMessageId: string; // ID da mensagem original para o typing indicator
  media?: { base64: string; mimeType: string };
  referral?: any;
  isAudio?: boolean; // Se a entrada original foi áudio
  isVoiceAllowed?: boolean; // Se o plano permite voz
}) {
  const { orgId, fromNumber, phoneNumberId, accessToken, botName, message, incomingMessageId, media, referral, isAudio, isVoiceAllowed } = params;

  const historyKey = `${orgId}:${fromNumber}`;
  if (aiPauses.has(historyKey) && aiPauses.get(historyKey)! > Date.now()) {
    console.log(`[IA PROATIVA] IA pausada para ${fromNumber} (transferência em andamento). Ignorando.`);
    return;
  }

  // Enviar indicador de "digitando..." (3 pontinhos)
  await WhatsAppService.sendTypingIndicator(phoneNumberId, incomingMessageId, accessToken);

  console.log(`[IA PROATIVA] Gerando resposta para ${fromNumber}...`);

  try {
    // 1. Recuperar contexto das últimas 24 horas (apenas histórico passado)
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: dbHistory } = await supabaseAdmin
      .from('conversation_history')
      .select('sender, text, created_at')
      .eq('org_id', orgId)
      .eq('customer_phone', fromNumber)
      .gt('created_at', last24h)
      .order('created_at', { ascending: true })
      .limit(20);

    const history = (dbHistory || []).map(h => ({ 
      sender: h.sender, 
      text: h.text 
    }));

    // Usar a mensagem passada por parâmetro (garante que não haverá alucinação de mídia)
    const messageToProcess = message;

    const aiResult = await AIService.generateResponse({
      message: messageToProcess,
      orgId,
      history: history, 
      botName,
      mode: 'simulation',
      media,
      referral 
    });

    const replyText = aiResult.reply;

    // 2. Persistir a resposta da IA no histórico
    await supabaseAdmin.from('conversation_history').insert({
      org_id: orgId,
      customer_phone: fromNumber,
      sender: 'bot',
      text: replyText
    });

    // Se a IA pedir transferência, pausamos por 24h
    if (aiResult.transfer) {
      const historyKey = `${orgId}:${fromNumber}`;
      aiPauses.set(historyKey, Date.now() + (24 * 60 * 60 * 1000));
    }

    // Se a entrada foi áudio E o plano permite, enviamos áudio de volta
    if (isAudio && isVoiceAllowed) {
      console.log(`[IA VOZ] Gerando áudio de resposta...`);
      const audioPath = await AudioService.textToSpeech(replyText);
      if (audioPath) {
        const mediaId = await WhatsAppService.uploadMedia(audioPath, phoneNumberId, accessToken);
        if (mediaId) {
          await WhatsAppService.sendAudio(fromNumber, mediaId, phoneNumberId, accessToken);
          console.log(`[IA VOZ] Áudio enviado com sucesso.`);
        }
        // Limpar arquivo temporário
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      } else {
        // Fallback para texto se falhar o áudio
        await WhatsAppService.sendTextMessage(phoneNumberId, fromNumber, replyText, accessToken);
      }
    } else {
      await WhatsAppService.sendTextMessage(phoneNumberId, fromNumber, replyText, accessToken);
    }

    console.log(`[IA PROATIVA] Resposta enviada com sucesso.`);
  } catch (err: any) {
    console.error(`[IA PROATIVA] Erro ao responder:`, err.message);
  }
}

// Webhook — Recepção de Mensagens (POST)
router.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;
    const metadata = value?.metadata;

    if (!messages || messages.length === 0) return;

    const incomingMsg = messages[0];
    const messageId = incomingMsg.id;

    // Evitar processamento duplicado
    if (processedMessages.has(messageId)) {
      console.log(`[WEBHOOK] Mensagem ${messageId} já processada. Ignorando.`);
      return;
    }
    processedMessages.add(messageId);

    const fromNumber = incomingMsg.from;
    const phoneNumberId = metadata?.phone_number_id;
    const referral = incomingMsg.referral; // Captura o anúncio

    console.log(`[WEBHOOK] Mensagem recebida de ${fromNumber} para o ID ${phoneNumberId}`);

    // 1. Buscar organização e configuração
    const { data: configData, error: dbError } = await supabaseAdmin
      .from('whatsapp_config')
      .select('org_id, access_token, display_name')
      .eq('phone_number_id', phoneNumberId)
      .eq('is_active', true)
      .maybeSingle();

    if (dbError) console.error('[WEBHOOK] Erro ao buscar config no banco:', dbError.message);
    
    if (!configData) {
      console.warn(`[WEBHOOK] Nenhuma configuração ativa encontrada para o Phone Number ID: ${phoneNumberId}. Verifique o Dashboard.`);
      return;
    }
    const { org_id: orgId, access_token: accessToken, display_name: botName } = configData;

    // 2. Verificar Plano e Status VIP (Voz disponível no Plano Pro ou para VIPs na tabela dedicada)
    const { data: subData } = await supabaseAdmin
      .from('subscriptions')
      .select('plan')
      .eq('org_id', orgId)
      .maybeSingle();
    
    const { data: orgData } = await supabaseAdmin
      .from('organizations')
      .select('owner_email')
      .eq('id', orgId)
      .maybeSingle();

    // Verificação na nova tabela de VIPs
    let isVip = false;
    if (orgData?.owner_email) {
      const { data: vipEntry } = await supabaseAdmin
        .from('vips')
        .select('id')
        .eq('email', orgData.owner_email.toLowerCase())
        .maybeSingle();
      
      if (vipEntry) isVip = true;
    }

    const currentPlan = subData?.plan || 'none';
    const isVoiceAllowed = currentPlan === 'pro' || currentPlan === 'enterprise' || isVip;

    const historyKey = `${orgId}:${fromNumber}`;

    // 2. Detectar Mensagem (Simplificado para garantir resposta)
    let userText = "";
    let media = undefined;

    let isAudioMessage = false;
    if (incomingMsg.type === 'text') {
      userText = incomingMsg.text?.body;
    } else if (['image', 'video', 'audio', 'document'].includes(incomingMsg.type)) {
      const mediaId = incomingMsg[incomingMsg.type].id;
      userText = incomingMsg[incomingMsg.type].caption || incomingMsg[incomingMsg.type].filename || "";
      
      console.log(`[WEBHOOK] Mídia detectada (${incomingMsg.type}). Baixando...`);
      const mediaData = await WhatsAppService.getMedia(mediaId, accessToken);
      if (mediaData) {
        media = mediaData;
        
        // Se for áudio, transcrever para texto para a IA entender
        if (incomingMsg.type === 'audio' && isVoiceAllowed) {
          console.log(`[IA VOZ] Transcrevendo áudio...`);
          const transcript = await AudioService.speechToTextFromBase64(mediaData.base64, mediaData.mimeType);
          if (transcript) {
            userText = transcript;
            isAudioMessage = true;
            console.log(`[IA VOZ] Transcrição: ${transcript}`);
          }
        } else if (incomingMsg.type === 'audio' && !isVoiceAllowed) {
          console.log(`[IA VOZ] Cliente tentou usar áudio, mas o plano não permite.`);
          userText = "(Mensagem de Áudio Ignorada - Upgrade de Plano Necessário)";
        }
      }
    }

    if (!userText && !media) return;

    // 3. Persistir Mensagem do Cliente no Histórico (Banco de Dados)
    let dbText = userText || `(Mídia: ${incomingMsg.type})`;
    if (referral) {
      dbText = `[Vindo do Anúncio: ${referral.headline || 'Sem título'}] ${dbText}`;
      console.log(`[WEBHOOK] Cliente vindo de anúncio: ${referral.headline}`);
    }

    await supabaseAdmin.from('conversation_history').insert({
      org_id: orgId,
      customer_phone: fromNumber,
      sender: 'user',
      text: dbText
    });

    // 4. Resposta Imediata
    await triggerAIResponse({ 
      orgId, 
      fromNumber, 
      phoneNumberId, 
      accessToken, 
      botName: botName || 'Assistente', 
      message: dbText, 
      incomingMessageId: messageId, // Passando o ID para os 3 pontinhos
      media, 
      referral,
      isAudio: isAudioMessage,
      isVoiceAllowed
    });

  } catch (error: any) {
    console.error('[WEBHOOK] Erro:', error.message);
  }
});

export default router;


