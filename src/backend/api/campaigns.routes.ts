import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { requireAuth } from '../middleware/auth';

const router = Router();

// Iniciar disparo de campanha
router.post('/send', requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user!.orgId;
    const { name, template, template_variables, audience, filters, delay_seconds } = req.body;

    if (!name || !template) {
      return res.status(400).json({ error: 'Nome e template são obrigatórios.' });
    }

    // 1. Registra a campanha no histórico
    const { data, error } = await supabaseAdmin
      .from('campaigns')
      .insert({
        org_id: orgId,
        name,
        template,
        template_variables: template_variables || {},
        audience: audience || 'all',
        status: 'SENDING',
        progress: 0,
        filters: {
          tags: filters ? filters.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
          delay_seconds: delay_seconds || 5
        }
      })
      .select()
      .single();

    if (error) throw error;

    // 2. TODO: Aqui iniciaria o worker de envio em massa
    console.log(`[CAMPAIGN] Iniciando disparo da campanha: ${name} | Template: ${template}`);

    res.status(200).json({ 
        message: 'Campanha iniciada com sucesso! O progresso será atualizado em breve.',
        campaignId: data.id 
    });
  } catch (error: any) {
    console.error('[CAMPAIGN] Erro ao criar campanha:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Listar histórico de campanhas
router.get('/', requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user!.orgId;
    const { data, error } = await supabaseAdmin
      .from('campaigns')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error && error.code !== 'PGRST116') throw error;

    // Normalizar para o formato esperado pelo frontend
    const campaigns = (data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      template: c.template,
      status: c.status,
      progress: c.progress || 0,
      date: new Date(c.created_at).toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      })
    }));

    res.json({ campaigns });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
