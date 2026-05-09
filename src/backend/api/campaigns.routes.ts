import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { requireAuth } from '../middleware/auth';

const router = Router();

// Iniciar disparo de campanha
router.post('/send', requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user.id;
    const { name, template, audience, filters, delay_seconds } = req.body;

    // 1. Registra a campanha no histórico
    const { data, error } = await supabaseAdmin
      .from('campaigns')
      .insert({
        org_id: orgId,
        name,
        template,
        audience,
        status: 'SENDING',
        progress: 0,
        filters: { ...filters, delay_seconds: delay_seconds || 0 }
      })
      .select()
      .single();

    if (error) throw error;

    // 2. Simula o processo de envio (em um sistema real aqui começaria um worker)
    console.log(`[CAMPAIGN] Iniciando disparo da campanha: ${name}`);

    res.status(200).json({ 
        message: 'Campanha iniciada com sucesso! O progresso será atualizado em breve.',
        campaignId: data.id 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Listar histórico de campanhas
router.get('/', requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user.id;
    const { data, error } = await supabaseAdmin
      .from('campaigns')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error && error.code !== 'PGRST116') throw error;
    res.json(data || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
