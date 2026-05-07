import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';

const router = Router();

// /api/whatsapp/config
router.get('/config', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.query.orgId || req.user.id;
    
    const { data, error } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('org_id', orgId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is not found
       throw error;
    }

    res.json({ config: data || null });
  } catch (error: any) {
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

router.post('/config', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.body.orgId || req.user.id;
    const configData = req.body;
    
    delete configData.orgId;

    const { data, error } = await supabase
      .from('whatsapp_config')
      .upsert({ org_id: orgId, ...configData })
      .select()
      .single();

    if (error) {
       console.warn('Upsert falhou, tabela possivelmente não existe', error);
       return res.json({ message: 'Configuração simulada (Tabela ausente)', data: configData });
    }

    res.json({ message: 'Configuração salva com sucesso', data });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to save config', details: error.message });
  }
});

// Meta Webhook endpoint
// /api/whatsapp/webhook
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'orion_webhook_token';

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

router.post('/webhook', (req, res) => {
  const body = req.body;

  if (body.object === 'whatsapp_business_account') {
    if (
      body.entry &&
      body.entry[0].changes &&
      body.entry[0].changes[0] &&
      body.entry[0].changes[0].value.messages &&
      body.entry[0].changes[0].value.messages[0]
    ) {
      const phone_number_id = body.entry[0].changes[0].value.metadata.phone_number_id;
      const from = body.entry[0].changes[0].value.messages[0].from; 
      const msg_body = body.entry[0].changes[0].value.messages[0].text?.body || '';

      console.log(`Mensagem WhatsApp recebida de ${from}: ${msg_body}`);
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

export default router;
