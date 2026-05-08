import { Router } from 'express';
import { supabase } from '../config/supabase';
import { AIService } from '../services/ai.service';
import { WhatsAppService } from '../services/whatsapp.service';

const router = Router();

// /api/whatsapp/webhook (POST)
router.post('/webhook', async (req, res) => {
  const body = req.body;

  try {
    if (body.object === 'whatsapp_business_account') {
        const entry = body.entry?.[0];
        const value = entry?.changes?.[0]?.value;
        const message = value?.messages?.[0];

        if (message && message.text?.body) {
            const phoneNumberId = value.metadata.phone_number_id;
            const from = message.from;
            const msgBody = message.text.body;

            // 1. Busca as configurações desta conexão no Supabase
            const { data: config } = await supabase
                .from('whatsapp_config')
                .select('org_id, display_name')
                .eq('phone_number_id', phoneNumberId)
                .single();

            // 2. Gera resposta personalizada
            const aiResponse = await AIService.generateResponse({
                message: msgBody,
                orgId: config?.org_id || 'default',
                botName: config?.display_name || 'Orion Bot',
                mode: 'simulation' // Sempre modo empresa no WhatsApp
            });

            // 3. Responde ao cliente
            await WhatsAppService.sendTextMessage(phoneNumberId, from, aiResponse.reply);
        }
        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
  } catch (err) {
    console.error('Webhook Error:', err);
    res.sendStatus(200);
  }
});

// Outras rotas (GET para verificação, config, etc) permanecem as mesmas...
router.get('/webhook', (req, res) => {
    const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'orion_webhook_token';
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
        res.status(200).send(req.query['hub.challenge']);
    } else {
        res.sendStatus(403);
    }
});

export default router;
