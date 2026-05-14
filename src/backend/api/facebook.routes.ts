import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { FacebookService } from '../services/facebook.service';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'orion_secure_token_123';

// /api/facebook/config (GET)
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

// /api/facebook/config (POST)
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
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Webhook — Verificação (GET)
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[FB WEBHOOK] Verificado com sucesso.');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Webhook — Recepção (POST)
router.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== 'page') return;

    for (const entry of body.entry) {
      const messaging = entry.messaging?.[0];
      if (!messaging || !messaging.message || messaging.message.is_echo) continue;

      const senderId = messaging.sender.id;
      const pageId = entry.id;
      const userText = messaging.message.text;

      if (!userText) continue;

      // 1. Buscar config
      const { data: config } = await supabaseAdmin
        .from('facebook_config')
        .select('org_id, access_token, display_name')
        .eq('page_id', pageId)
        .eq('is_active', true)
        .maybeSingle();

      if (!config) continue;

      const { org_id: orgId, access_token: accessToken, display_name: botName } = config;

      // 2. Histórico
      const { data: dbHistory } = await supabaseAdmin
        .from('conversation_history')
        .select('sender, text')
        .eq('org_id', orgId)
        .eq('customer_phone', senderId)
        .order('created_at', { ascending: false })
        .limit(20);

      const history = (dbHistory || []).reverse().map(h => ({ sender: h.sender, text: h.text }));

      // 3. Persistir msg do usuário
      await supabaseAdmin.from('conversation_history').insert({
        org_id: orgId,
        customer_phone: senderId,
        sender: 'user',
        text: userText,
        metadata: { platform: 'facebook' }
      });

      // 4. Typing
      await FacebookService.sendTypingIndicator(pageId, senderId, accessToken, 'typing_on');

      // AI logic removed
  } catch (error: any) {
    console.error('[FB WEBHOOK] Erro:', error.message);
  }
});

export default router;
