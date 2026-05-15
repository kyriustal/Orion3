import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AIService } from '../services/ai.service';
import { FacebookService } from '../services/facebook.service';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'orion_secure_token_123';

// Dedup de mensagens Facebook processadas
const processedFbMessages = new Set<string>();
setInterval(() => processedFbMessages.clear(), 10 * 60 * 1000);

// ─── GET /api/facebook/config ─────────────────────────────────────────────────
router.get('/config', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.id;
    const { data, error } = await supabaseAdmin
      .from('facebook_config')
      .select('*')
      .eq('org_id', orgId)
      .maybeSingle();

    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/facebook/config ────────────────────────────────────────────────
router.post('/config', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.id;
    const { page_id, access_token, display_name } = req.body;

    const { data, error } = await supabaseAdmin
      .from('facebook_config')
      .upsert({
        org_id: orgId,
        page_id,
        access_token,
        display_name,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/facebook/webhook — Verificação Meta ────────────────────────────
router.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[FB WEBHOOK] Verificado com sucesso.');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ─── POST /api/facebook/webhook — Recepção de mensagens ──────────────────────
router.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Responder imediatamente à Meta

  try {
    const body = req.body;
    if (body.object !== 'page') return;

    for (const entry of body.entry) {
      const messaging = entry.messaging?.[0];
      if (!messaging || !messaging.message || messaging.message.is_echo) continue;

      const messageId = messaging.message.mid;
      if (!messageId) continue;

      // Dedup
      if (processedFbMessages.has(messageId)) continue;
      processedFbMessages.add(messageId);

      const senderId = messaging.sender.id;
      const pageId   = entry.id;
      const userText = messaging.message.text;

      if (!userText?.trim()) continue;

      // 1. Buscar configuração da página
      const { data: config } = await supabaseAdmin
        .from('facebook_config')
        .select('org_id, access_token, display_name')
        .eq('page_id', pageId)
        .eq('is_active', true)
        .maybeSingle();

      if (!config) {
        console.warn(`[FB WEBHOOK] Nenhuma config activa para page_id: ${pageId}`);
        continue;
      }

      const { org_id: orgId, access_token: accessToken } = config;

      // Buscar nome personalizado (chatbot_name)
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('chatbot_name')
        .eq('id', orgId)
        .maybeSingle();

      const botName = org?.chatbot_name || config.display_name || 'Assistente';

      // 2. Buscar histórico (últimas 50 mensagens)
      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: dbHistory } = await supabaseAdmin
        .from('conversation_history')
        .select('sender, text')
        .eq('org_id', orgId)
        .eq('customer_phone', senderId)
        .gte('created_at', last24h)
        .order('created_at', { ascending: false })
        .limit(50);

      const history = (dbHistory || []).reverse().map(h => ({ sender: h.sender, text: h.text }));

      // 3. Persistir mensagem do utilizador
      await supabaseAdmin.from('conversation_history').insert({
        org_id: orgId,
        customer_phone: senderId,
        sender: 'user',
        text: userText,
        metadata: { platform: 'facebook' },
      });

      // 4. Indicador de digitação
      await FacebookService.sendTypingIndicator(pageId, senderId, accessToken, 'typing_on');

      // 5. Gerar resposta com IA
      const aiResult = await AIService.generateResponse({
        message: userText,
        orgId,
        history,
        botName: botName || 'Assistente',
        mode: 'simulation',
      });

      // 6. Enviar resposta
      await FacebookService.sendMessage(pageId, senderId, aiResult.reply, accessToken);

      // 7. Persistir resposta do bot
      await supabaseAdmin.from('conversation_history').insert({
        org_id: orgId,
        customer_phone: senderId,
        sender: 'bot',
        text: aiResult.reply,
        metadata: { platform: 'facebook' },
      });

      console.log(`[FB WEBHOOK] Resposta enviada para ${senderId}.`);
    }
  } catch (err: any) {
    console.error('[FB WEBHOOK] Erro:', err.message);
  }
});

export default router;
