import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import { AIService } from '../services/ai.service';
import { WhatsAppService } from '../services/whatsapp.service';
import axios from 'axios';

const router = Router();

// Cache em memória para histórico de conversas WhatsApp (por número de telefone)
// Estrutura: { "orgId:fromNumber": Message[] }
const conversationHistory: Record<string, Array<{ sender: 'user' | 'bot'; text: string }>> = {};

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
// Estrutura: { "orgId:fromNumber": timestamp_expiracao }
const aiPauses: Map<string, number> = new Map();

// Webhook — Recepção de Mensagens (POST)
router.post('/webhook', async (req, res) => {
  // Responder imediatamente à Meta para evitar timeout
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    
    // Detectar se a mensagem é do próprio negócio (atendente humano via Meta Business Suite)
    // No webhook da Meta, mensagens enviadas pelo negócio aparecem em 'messages' mas com 'from' sendo o ID do negócio
    // ou podem vir em outros campos. Uma forma comum é verificar se há um campo 'messages' e o sender é diferente do metadata.
    const messages = value?.messages;
    const metadata = value?.metadata;

    if (!messages || messages.length === 0) return;

    const incomingMsg = messages[0];
    const fromNumber = incomingMsg.from;
    const phoneNumberId = metadata?.phone_number_id;

    // 1. Buscar organização e configuração pelo phone_number_id
    const { data: configData, error: configError } = await supabaseAdmin
      .from('whatsapp_config')
      .select('org_id, access_token, display_name')
      .eq('phone_number_id', phoneNumberId)
      .eq('is_active', true)
      .maybeSingle();

    if (configError || !configData) return;
    const { org_id: orgId, access_token: accessToken, display_name: botName } = configData;

    // 2. Verificar se a mensagem é do Negócio (Humano respondendo)
    // Se o 'from' da mensagem for igual ao número configurado ou se vier de um 'atendente', pausamos a IA.
    // Dica: A Meta envia o campo 'contacts' apenas para mensagens de clientes.
    const isFromCustomer = value.contacts && value.contacts.length > 0;

    const historyKey = `${orgId}:${fromNumber}`;

    if (!isFromCustomer) {
      console.log(`[WEBHOOK] Atendente humano detectado para ${fromNumber}. Pausando IA por 30 min.`);
      // Pausar IA por 30 minutos (Modo Híbrido)
      aiPauses.set(historyKey, Date.now() + (30 * 60 * 1000));
      return;
    }

    // 3. É uma mensagem do cliente. Verificar Modo de Coexistência.
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('handover_mode')
      .eq('id', orgId)
      .maybeSingle();
    
    const handoverMode = org?.handover_mode || 'hybrid';

    if (handoverMode === 'hybrid') {
      const pauseUntil = aiPauses.get(historyKey);
      if (pauseUntil && pauseUntil > Date.now()) {
        const remaining = Math.round((pauseUntil - Date.now()) / 1000 / 60);
        console.log(`[WEBHOOK] IA em pausa para ${fromNumber} (${remaining} min restantes). Ignorando.`);
        return;
      }
    }

    if (incomingMsg.type !== 'text') return;
    const userText = incomingMsg.text?.body;
    if (!userText) return;

    console.log(`[WEBHOOK] Processando mensagem de ${fromNumber}: "${userText}"`);

    // 4. Recuperar histórico de conversa em cache
    if (!conversationHistory[historyKey]) {
      conversationHistory[historyKey] = [];
    }
    const history = conversationHistory[historyKey];

    // 5. Adicionar mensagem do utilizador ao histórico
    history.push({ sender: 'user', text: userText });

    // 6. Gerar resposta com a IA
    const aiResult = await AIService.generateResponse({
      message: userText,
      orgId,
      history: history.slice(-10),
      botName: botName || 'Assistente',
      mode: 'simulation'
    });

    let replyText = aiResult.reply;

    // 7. Se a IA solicitar transferência, pausamos ela imediatamente (Modo Coexistência)
    if (aiResult.transfer) {
      console.log(`[WEBHOOK] Transferência solicitada para ${fromNumber}. Pausando IA.`);
      aiPauses.set(historyKey, Date.now() + (24 * 60 * 60 * 1000)); // Pausa longa (24h) ou até reset manual
    }

    // 8. Adicionar resposta da IA ao histórico
    history.push({ sender: 'bot', text: replyText });

    if (history.length > 20) {
      conversationHistory[historyKey] = history.slice(-20);
    }

    // 9. Enviar resposta ao utilizador via Meta API
    await WhatsAppService.sendTextMessage(phoneNumberId, fromNumber, replyText, accessToken);

  } catch (error: any) {
    console.error('[WEBHOOK] Erro:', error.message);
  }
});

export default router;

