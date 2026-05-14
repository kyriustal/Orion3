import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import { WhatsAppService } from '../services/whatsapp.service';
import axios from 'axios';

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

// Controle de deduplicação de mensagens (IDs da Meta)
const processedMessages: Set<string> = new Set();
setInterval(() => processedMessages.clear(), 10 * 60 * 1000); // Limpa a cada 10 min

// triggerAIResponse removed

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
    const { org_id: orgId, access_token: accessTokenRaw, display_name: botName } = configData;
    const accessToken = accessTokenRaw?.trim();

    // Captura da mensagem básica
    let userText = "";
    let media = undefined;

    if (incomingMsg.type === 'text') {
      userText = incomingMsg.text?.body;
    } else if (['image', 'video', 'audio', 'document'].includes(incomingMsg.type)) {
      const caption = incomingMsg[incomingMsg.type].caption || "";
      userText = caption || `(Mídia: ${incomingMsg.type})`;
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

    // Resposta Imediata removida - apenas live chat agora

  } catch (error: any) {
    console.error('[WEBHOOK] Erro:', error.message);
  }
});

export default router;


