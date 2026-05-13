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

// /api/whatsapp/ping (GET) - Testar se o serviço está ok
router.get('/ping', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.id;
    const { data: config } = await supabaseAdmin
      .from('whatsapp_config')
      .select('is_active, display_name, phone_number_id')
      .eq('org_id', orgId)
      .maybeSingle();

    res.json({ 
      status: 'ok', 
      config_active: !!config?.is_active,
      bot_name: config?.display_name || 'Não configurado',
      phone_id: config?.phone_number_id || 'Não configurado'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

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

// /api/whatsapp/chats (GET) - Listar conversas ativas
router.get('/chats', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.id;
    console.log(`[CHATS] Buscando conversas para OrgID: ${orgId}`);
    
    // Buscar os últimos números únicos que falaram com a organização
    const { data: history, error } = await supabaseAdmin
      .from('conversation_history')
      .select('customer_phone, text, created_at, sender')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(`[CHATS] Erro ao buscar no banco:`, error.message);
      throw error;
    }

    console.log(`[CHATS] Encontrados ${history?.length || 0} registros no histórico.`);

    // Agrupar por número de telefone (pegar a última mensagem de cada)
    const chatsMap = new Map();
    history?.forEach(item => {
      if (!chatsMap.has(item.customer_phone)) {
        chatsMap.set(item.customer_phone, {
          id: item.customer_phone,
          phone: item.customer_phone,
          name: `Cliente (${item.customer_phone})`,
          lastMessage: item.text,
          time: new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          timestamp: item.created_at
        });
      }
    });

    res.json(Array.from(chatsMap.values()));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// /api/whatsapp/history/:phone (GET) - Ver histórico de um chat específico
router.get('/history/:phone', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.id;
    const { phone } = req.params;

    const { data, error } = await supabaseAdmin
      .from('conversation_history')
      .select('*')
      .eq('org_id', orgId)
      .eq('customer_phone', phone)
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) throw error;

    // Formatar para o frontend
    const formattedMessages = data.map(m => ({
      id: m.id,
      sender: m.sender,
      text: m.text,
      time: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }));

    res.json(formattedMessages);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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

// Cache de mensagens enviadas pela IA para evitar auto-pausa no echo
const botSentMessages: Set<string> = new Set();
setInterval(() => botSentMessages.clear(), 30 * 60 * 1000); // Limpa a cada 30 min

// Controle de timeouts agendados
const scheduledChecks: Map<string, NodeJS.Timeout> = new Map();

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
}) {
  const { orgId, fromNumber, phoneNumberId, accessToken, botName, message, incomingMessageId, media, referral, isAudio, isVoiceAllowed } = params;

  try {
    const historyKey = `${orgId}:${fromNumber}`;
    if (aiPauses.has(historyKey) && aiPauses.get(historyKey)! > Date.now()) {
      console.log(`[IA PROATIVA] IA pausada para ${fromNumber}. Ignorando.`);
      return;
    }

    // Tenta marcar como lida (não trava se falhar)
    try {
        await WhatsAppService.sendTypingIndicator(phoneNumberId, incomingMessageId, accessToken);
    } catch (e) {}

    console.log(`[IA PROATIVA] Iniciando resposta para ${fromNumber}...`);

    // 1. Recuperar contexto das últimas 24 horas
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: dbHistory, error: historyError } = await supabaseAdmin
      .from('conversation_history')
      .select('sender, text, created_at')
      .eq('org_id', orgId)
      .eq('customer_phone', fromNumber)
      .gt('created_at', last24h)
      .order('created_at', { ascending: false })
      .limit(20);

    if (historyError) {
        console.error('[IA] Erro ao buscar histórico:', historyError.message);
    }

    const history = (dbHistory || []).reverse().map(h => ({ 
      sender: h.sender, 
      text: h.text 
    }));

    // 2. Gerar Resposta IA
    const aiResult = await AIService.generateResponse({
      message,
      orgId,
      history, 
      botName,
      mode: 'simulation',
      media,
      referral 
    });

    if (!aiResult || !aiResult.reply) {
      console.error(`[IA PROATIVA] AIService retornou resposta vazia para ${fromNumber}`);
      throw new Error("Resposta da IA vazia ou inválida.");
    }

    const replyText = aiResult.reply;
    console.log(`[IA PROATIVA] Resposta gerada para ${fromNumber}: ${replyText.substring(0, 50)}...`);

    // 3. Persistir a resposta
    const { error: insertError } = await supabaseAdmin.from('conversation_history').insert({
      org_id: orgId,
      customer_phone: fromNumber,
      sender: 'bot',
      text: replyText
    });

    if (insertError) {
      console.error(`[IA PROATIVA] Erro ao persistir histórico para ${fromNumber}:`, insertError.message);
    }

    // 4. Enviar para WhatsApp
    let sentMsgId: string | null = null;
    
    if (isAudio && isVoiceAllowed) {
      console.log(`[IA VOZ] Processando voz para ${fromNumber}...`);
      const audioPath = await AudioService.textToSpeech(replyText);
      if (audioPath) {
        const mediaId = await WhatsAppService.uploadMedia(audioPath, phoneNumberId, accessToken);
        if (mediaId) {
          sentMsgId = await WhatsAppService.sendAudio(fromNumber, mediaId, phoneNumberId, accessToken);
        }
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      } else {
        console.warn(`[IA VOZ] Falha ao gerar áudio para ${fromNumber}. Usando texto.`);
      }
    } 
    
    // Fallback ou envio padrão de texto
    if (!sentMsgId) {
      console.log(`[IA PROATIVA] Enviando texto para ${fromNumber}...`);
      sentMsgId = await WhatsAppService.sendTextMessage(phoneNumberId, fromNumber, replyText, accessToken);
    }

    if (sentMsgId) {
        botSentMessages.add(sentMsgId);
        console.log(`[IA PROATIVA] Mensagem entregue com sucesso para ${fromNumber}. ID: ${sentMsgId}`);
    } else {
        console.error(`[IA PROATIVA] Falha ao entregar mensagem para ${fromNumber} via Meta API.`);
        throw new Error("Falha no envio da mensagem via WhatsApp (Meta API).");
    }

    // Se a IA pedir transferência, pausamos
    if (aiResult.transfer) {
      console.log(`[IA PROATIVA] Transferência detectada para ${fromNumber}. Pausando IA.`);
      aiPauses.set(historyKey, Date.now() + (5 * 60 * 1000));
    }

  } catch (err: any) {
    console.error(`[IA PROATIVA] ERRO NO FLUXO DE RESPOSTA para ${fromNumber}:`, err.message);
    // Log de erro no histórico para o usuário ver no dashboard
    try {
      await supabaseAdmin.from('conversation_history').insert({
        org_id: orgId,
        customer_phone: fromNumber,
        sender: 'bot',
        text: `[Erro do Sistema] Desculpe, tive um problema técnico ao processar sua resposta: ${err.message}`
      });
    } catch (dbErr) {
      console.error(`[IA PROATIVA] Erro crítico: Falha ao logar erro no banco para ${fromNumber}`);
    }
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

    // --- LÓGICA DE COEXISTÊNCIA (ECHO DETECTION) ---
    // Se a mensagem for um echo de algo que NÓS (IA) enviamos, ignoramos.
    if (botSentMessages.has(messageId)) {
      console.log(`[ECHO] Ignorando echo da própria IA.`);
      botSentMessages.delete(messageId); // Limpa do cache
      return res.sendStatus(200);
    }

    // Se a mensagem tem o campo 'from' igual ao nosso número ou se for um echo da Meta
    // significa que VOCÊ (humano) enviou a mensagem por fora (ex: Meta Business Suite).
    if (incomingMsg.from === metadata?.display_phone_number || incomingMsg.type === 'echo') {
      const recipientNumber = incomingMsg.to; // Para quem o humano enviou
      if (recipientNumber) {
        // Buscar org_id para este phoneNumberId
        const { data: config } = await supabaseAdmin
          .from('whatsapp_config')
          .select('org_id')
          .eq('phone_number_id', metadata?.phone_number_id)
          .maybeSingle();

        if (config) {
          const historyKey = `${config.org_id}:${recipientNumber}`;
          aiPauses.set(historyKey, Date.now() + (5 * 60 * 1000)); // Pausa de 5 minutos
          console.log(`[COEXISTÊNCIA] Humano respondeu para ${recipientNumber}. IA pausada por 5 min.`);
          
          // Opcional: Persistir no histórico que foi uma resposta humana
          await supabaseAdmin.from('conversation_history').insert({
            org_id: config.org_id,
            customer_phone: recipientNumber,
            sender: 'human',
            text: incomingMsg.text?.body || "(Mídia enviada por humano)"
          });
        }
      }
      return res.sendStatus(200); // Interrompe aqui, não aciona a IA
    }
    // ----------------------------------------------

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
    const { org_id: orgId, access_token: accessTokenRaw, display_name: botName } = configData;
    const accessToken = accessTokenRaw?.trim();

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

    // Fallback para .env (emails VIPs hardcoded)
    if (!isVip && orgData?.owner_email) {
      const vipEmails = (process.env.VIP_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
      if (vipEmails.includes(orgData.owner_email.toLowerCase())) {
        isVip = true;
      }
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
      const caption = incomingMsg[incomingMsg.type].caption || "";
      const filename = incomingMsg[incomingMsg.type].filename || "arquivo";
      
      console.log(`[WEBHOOK] Mídia detectada (${incomingMsg.type}). Baixando...`);
      const mediaData = await WhatsAppService.getMedia(mediaId, accessToken);
      
      if (mediaData) {
        media = mediaData;
        
        // 1. ÁUDIO: Transcrever para texto
        if (incomingMsg.type === 'audio' && isVoiceAllowed) {
          console.log(`[IA VOZ] Transcrevendo áudio...`);
          const transcript = await AudioService.speechToTextFromBase64(mediaData.base64, mediaData.mimeType);
          if (transcript) {
            userText = `[Mensagem de Áudio Transcrita]: ${transcript}`;
            isAudioMessage = true;
            console.log(`[IA VOZ] Transcrição: ${transcript}`);
          }
        } 
        // 2. DOCUMENTO: Extrair texto se for PDF/DOCX
        else if (incomingMsg.type === 'document') {
          console.log(`[IA DOC] Extraindo texto do documento: ${filename}`);
          const { DocumentService } = await import('../services/document.service');
          const extractedText = await DocumentService.extractTextFromBase64(mediaData.base64, mediaData.mimeType);
          
          if (extractedText) {
            userText = `[Conteúdo do Documento "${filename}"]: \n${extractedText.substring(0, 10000)}`; // Limite de 10k chars para o prompt
          } else {
            userText = `(O cliente enviou um documento: ${filename})`;
          }
          if (caption) userText = `${caption}\n\n${userText}`;
        }
        // 3. IMAGEM: Apenas capturar legenda (a IA verá a imagem via multimodalidade)
        else if (incomingMsg.type === 'image') {
          userText = caption || "(Imagem enviada)";
        }
        else {
          userText = caption || `(Mídia: ${incomingMsg.type})`;
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


