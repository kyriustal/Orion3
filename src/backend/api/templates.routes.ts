import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { requireAuth } from '../middleware/auth';
import { WhatsAppService } from '../services/whatsapp.service';

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

// Criar template (Envia para a Meta se configurado)
router.post('/', requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user!.orgId;
    const { name, category, language, content, buttons } = req.body;

    const formattedButtons = Array.isArray(buttons) ? buttons : [];

    // 1. Tentar submeter para a Meta se houver integração WABA
    let metaId: string | null = null;
    let status = 'approved'; // Por padrão aprovado localmente para testes/campanhas sem WABA

    try {
      const { data: config } = await supabaseAdmin
        .from('whatsapp_config')
        .select('waba_id, access_token')
        .eq('org_id', orgId)
        .maybeSingle();

      if (config?.waba_id && config?.access_token) {
        const metaRes = await WhatsAppService.createMetaTemplate(config.waba_id, config.access_token, {
          name,
          category,
          language: language || 'pt_BR',
          content,
          buttons: formattedButtons
        });
        if (metaRes?.id) {
          metaId = metaRes.id;
          status = 'pending'; // Fica pendente de análise na Meta
        }
      }
    } catch (metaErr: any) {
      console.warn('[TEMPLATES] Aviso ao enviar template para a Meta:', metaErr.message);
    }

    // 2. Persistir na base de dados local
    const { data, error } = await supabaseAdmin
      .from('templates')
      .insert({
        org_id: orgId,
        name,
        category,
        language: language || 'pt_BR',
        content,
        buttons: formattedButtons,
        status,
        meta_id: metaId
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

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
      let status = 'pending';
      if (mt.status === 'APPROVED') status = 'approved';
      if (mt.status === 'REJECTED') status = 'rejected';
      if (mt.status === 'PENDING') status = 'pending';

      const buttonsComp = mt.components?.find((c: any) => c.type === 'BUTTONS');
      const parsedButtons = (buttonsComp?.buttons || []).map((b: any, idx: number) => ({
        id: `btn_${idx + 1}`,
        type: b.type || 'QUICK_REPLY',
        text: b.text || b.text_override || `Botão ${idx + 1}`,
        url: b.url || '',
        phone_number: b.phone_number || ''
      }));

      const templateData = {
        org_id: orgId,
        name: mt.name,
        category: mt.category,
        language: mt.language,
        content: mt.components?.find((c: any) => c.type === 'BODY')?.text || '',
        buttons: parsedButtons,
        status: status,
        meta_id: mt.id
      };

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
