import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { requireAuth } from '../middleware/auth';
import { WhatsAppService } from '../services/whatsapp.service';

const router = Router();

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Executa o disparo em massa da campanha em segundo plano */
async function processCampaign(campaignId: string, orgId: string) {
  try {
    const { data: campaign } = await supabaseAdmin
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (!campaign) return;

    // Buscar template associado para pegar conteúdo e botões
    const { data: tmpl } = await supabaseAdmin
      .from('templates')
      .select('*')
      .eq('org_id', orgId)
      .eq('name', campaign.template)
      .maybeSingle();

    const templateContent = tmpl?.content || '';
    const templateLanguage = tmpl?.language || 'pt_BR';
    const templateButtons = campaign.buttons && campaign.buttons.length > 0
      ? campaign.buttons
      : (tmpl?.buttons || []);

    // Buscar credenciais WhatsApp
    const { data: waConfig } = await supabaseAdmin
      .from('whatsapp_config')
      .select('phone_number_id, access_token')
      .eq('org_id', orgId)
      .maybeSingle();

    // Buscar contatos da audiência
    let query = supabaseAdmin.from('contacts').select('id, phone, name').eq('org_id', orgId);

    if (campaign.audience === 'active_24h') {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: activeHist } = await supabaseAdmin
        .from('conversation_history')
        .select('customer_phone')
        .eq('org_id', orgId)
        .gte('created_at', since);
      const activePhones = Array.from(new Set((activeHist || []).map(h => h.customer_phone).filter(Boolean)));
      if (activePhones.length > 0) {
        query = query.in('phone', activePhones);
      }
    }

    const { data: contacts } = await query;
    const targetContacts = contacts || [];

    if (targetContacts.length === 0) {
      await supabaseAdmin.from('campaigns').update({
        status: 'COMPLETED',
        progress: 100,
        total_contacts: 0
      }).eq('id', campaignId);
      return;
    }

    await supabaseAdmin.from('campaigns').update({
      total_contacts: targetContacts.length
    }).eq('id', campaignId);

    const delaySec = campaign.filters?.delay_seconds || 5;
    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < targetContacts.length; i++) {
      const contact = targetContacts[i];
      if (!contact.phone) continue;

      // Verificar se a campanha foi pausada
      const { data: currentCamp } = await supabaseAdmin
        .from('campaigns')
        .select('status')
        .eq('id', campaignId)
        .single();
      if (currentCamp?.status === 'PAUSED') break;

      const variables = { ...(campaign.template_variables || {}) };
      if (!variables['1'] && contact.name) {
        variables['1'] = contact.name.trim().split(/\s+/)[0];
      }

      let sentId: string | null = null;

      if (waConfig?.phone_number_id && waConfig?.access_token) {
        sentId = await WhatsAppService.sendTemplateMessage(
          waConfig.phone_number_id,
          contact.phone,
          campaign.template,
          templateLanguage,
          variables,
          templateButtons,
          waConfig.access_token,
          templateContent
        );
      } else if (templateButtons && templateButtons.length > 0) {
        let filledText = templateContent;
        Object.keys(variables).forEach(k => {
          filledText = filledText.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), variables[k] || '');
        });
        const formattedBtns = templateButtons.map((b: any, idx: number) => ({
          id: b.id || `btn_${idx + 1}`,
          title: b.text || b.title || `Opção ${idx + 1}`
        }));
        sentId = await WhatsAppService.sendInteractiveButtons(
          process.env.DEFAULT_PHONE_NUMBER_ID || '',
          contact.phone,
          filledText,
          formattedBtns
        );
      }

      if (sentId) sentCount++;
      else failedCount++;

      const progress = Math.round(((i + 1) / targetContacts.length) * 100);
      await supabaseAdmin.from('campaigns').update({
        progress,
        sent_count: sentCount,
        failed_count: failedCount
      }).eq('id', campaignId);

      if (i < targetContacts.length - 1) {
        await sleep(delaySec * 1000);
      }
    }

    await supabaseAdmin.from('campaigns').update({
      status: 'COMPLETED',
      progress: 100
    }).eq('id', campaignId);

  } catch (err: any) {
    console.error(`[CAMPAIGN WORKER] Erro ao processar campanha ${campaignId}:`, err.message);
    await supabaseAdmin.from('campaigns').update({ status: 'FAILED' }).eq('id', campaignId);
  }
}

// Iniciar disparo de campanha
router.post('/send', requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user!.orgId;
    const { name, template, template_variables, buttons, audience, filters, delay_seconds } = req.body;

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
        buttons: buttons || [],
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

    // 2. Inicia o worker em background
    processCampaign(data.id, orgId).catch(err => {
      console.error(`[CAMPAIGN WORKER] Falha em background para ${data.id}:`, err.message);
    });

    res.status(200).json({ 
        message: 'Campanha iniciada com sucesso! O progresso será atualizado em tempo real.',
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

    const campaigns = (data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      template: c.template,
      buttons: c.buttons || [],
      status: c.status,
      progress: c.progress || 0,
      sentCount: c.sent_count || 0,
      totalContacts: c.total_contacts || 0,
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
