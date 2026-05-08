import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';
import { AIService } from '../services/ai.service';
import { WhatsAppService } from '../services/whatsapp.service';

const router = Router();

// Configuração do Webhook da Meta (GET para verificação)
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'orion_webhook_token';

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ WEBHOOK DA META VERIFICADO');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Recebimento de Mensagens da Meta (POST)
router.post('/webhook', async (req, res) => {
  const body = req.body;

  try {
    if (body.object === 'whatsapp_business_account') {
        const entry = body.entry?.[0];
        const change = entry?.changes?.[0];
        const value = change?.value;
        const message = value?.messages?.[0];

        if (message) {
            const phoneNumberId = value.metadata.phone_number_id;
            const from = message.from; // Número do cliente
            const msgBody = message.text?.body;

            if (msgBody) {
                console.log(`📩 Mensagem de ${from}: ${msgBody}`);

                // 1. Gera a resposta com a IA (usando o Gemini 2.5 Flash)
                // Usamos o número do telefone como orgId temporário ou buscamos a conta real
                const aiResponse = await AIService.generateResponse({
                    message: msgBody,
                    orgId: 'default', // Aqui você pode buscar o orgId vinculado ao phoneNumberId no futuro
                    botName: 'Orion'
                });

                // 2. Envia de volta para o cliente via Meta
                await WhatsAppService.sendTextMessage(phoneNumberId, from, aiResponse.reply);
            }
        }
        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
  } catch (err) {
    console.error('Erro no processamento do Webhook:', err);
    res.sendStatus(200); // Respondemos 200 para a Meta não ficar reenviando
  }
});

// Outras rotas de configuração permanecem...
router.get('/config', requireAuth, async (req: AuthRequest, res) => {
    try {
      const orgId = req.query.orgId || req.user?.id;
      const { data, error } = await supabase.from('whatsapp_config').select('*').eq('org_id', orgId).single();
      res.json({ config: data || null });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
});

router.post('/config', requireAuth, async (req: AuthRequest, res) => {
    try {
      const orgId = req.body.orgId || req.user?.id;
      const { data, error } = await supabase.from('whatsapp_config').upsert({ org_id: orgId, ...req.body }).select().single();
      res.json({ message: 'Configurado!', data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
});

export default router;
