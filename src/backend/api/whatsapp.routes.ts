import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';
import { AIService } from '../services/ai.service';
import { WhatsAppService } from '../services/whatsapp.service';

const router = Router();

// /api/whatsapp/config (GET)
router.get('/config', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.id;
    const { data, error } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('org_id', orgId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    res.json(data || null);
  } catch (error: any) {
    console.error('Erro ao buscar config WhatsApp:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// /api/whatsapp/config (POST)
router.post('/config', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.id;
    const configData = { ...req.body, org_id: orgId };

    const { data, error } = await supabase
      .from('whatsapp_config')
      .upsert(configData, { onConflict: 'org_id' })
      .select()
      .single();

    if (error) {
        console.error('Erro ao salvar no banco (whatsapp_config):', error.message);
        throw new Error(`Erro no Banco de Dados: ${error.message}`);
    }

    res.json({ message: 'Configuração salva com sucesso!', data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Configuração do Webhook da Meta (GET para verificação)
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log(`[META] Tentativa de verificação. Mode: ${mode}, Token: ${token}`);

  const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'orion_webhook_token';

  if (mode === 'subscribe' && (token === VERIFY_TOKEN || token === 'orion_webhook_token')) {
    console.log('✅ WEBHOOK DA META VERIFICADO COM SUCESSO');
    return res.status(200).send(challenge);
  } else {
    console.error('❌ FALHA NA VERIFICAÇÃO: Token incorreto ou ausente.');
    return res.sendStatus(403);
  }
});

router.post('/webhook', async (req, res) => {
    // Lógica do webhook de resposta automática...
    res.sendStatus(200);
});

export default router;
