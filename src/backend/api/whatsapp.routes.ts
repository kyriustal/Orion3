import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';

const router = Router();

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

// /api/whatsapp/config (POST)
router.post('/config', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.id;
    
    // Pick only known columns to avoid "column not found" errors
    const configData = { 
        org_id: orgId,
        phone_number_id: req.body.phone_number_id,
        waba_id: req.body.waba_id,
        access_token: req.body.access_token,
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

    res.json({ message: 'WhatsApp Conectado!', data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Webhook endpoints
router.get('/webhook', (req, res) => {
    const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'orion_webhook_token';
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else if (token === VERIFY_TOKEN) {
        // Fallback for simple token match
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

router.post('/webhook', async (req, res) => {
    // Aqui processamos as mensagens recebidas (AI)
    res.sendStatus(200);
});

export default router;
