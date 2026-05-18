import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { requireAuth } from '../middleware/auth';

const router = Router();

// Listar templates
router.get('/', requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user!.orgId;
    const { data, error } = await supabaseAdmin
      .from('templates')
      .select('*')
      .eq('org_id', orgId);

    if (error && error.code !== 'PGRST116') throw error;
    res.json(data || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Criar template (Envia para "Análise")
router.post('/', requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user!.orgId;
    const { name, category, language, content } = req.body;

    const { data, error } = await supabaseAdmin
      .from('templates')
      .insert({
        org_id: orgId,
        name,
        category,
        language: language || 'pt_BR',
        content,
        status: 'pending' // Começa em análise
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

import { WhatsAppService } from '../services/whatsapp.service';

// Sincronizar templates com a Meta
router.post('/sync', requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user!.orgId;

    // 1. Buscar config do WhatsApp para pegar WABA ID e Token
    const { data: config } = await supabaseAdmin
      .from('whatsapp_config')
      .select('waba_id, access_token')
      .eq('org_id', orgId)
      .maybeSingle();

    if (!config?.waba_id || !config?.access_token) {
      return res.status(400).json({ error: 'WhatsApp não configurado ou token ausente.' });
    }

    // 2. Buscar templates na Meta
    const metaTemplates = await WhatsAppService.getTemplates(config.waba_id, config.access_token);

    if (!metaTemplates || metaTemplates.length === 0) {
      return res.json({ message: 'Nenhum template encontrado na Meta.', count: 0 });
    }

    // 3. Atualizar ou Inserir na nossa DB
    for (const mt of metaTemplates) {
      // Mapear status da Meta para o nosso
      let status = 'pending';
      if (mt.status === 'APPROVED') status = 'approved';
      if (mt.status === 'REJECTED') status = 'rejected';
      if (mt.status === 'PENDING') status = 'pending';

      const templateData = {
        org_id: orgId,
        name: mt.name,
        category: mt.category,
        language: mt.language,
        content: mt.components?.find((c: any) => c.type === 'BODY')?.text || '',
        status: status,
        meta_id: mt.id // Novo campo para rastreio
      };

      // Upsert baseado no nome e org_id
      await supabaseAdmin
        .from('templates')
        .upsert(templateData, { onConflict: 'org_id, name' });
    }

    res.json({ message: 'Templates sincronizados com sucesso!', count: metaTemplates.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
