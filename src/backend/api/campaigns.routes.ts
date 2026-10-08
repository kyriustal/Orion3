import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { requireAuth } from '../middleware/auth';
import { WhatsAppService } from '../services/whatsapp.service';
import multer from 'multer';
import * as XLSX from 'xlsx';

const router = Router();

// Multer: armazenamento em memória para parsing imediato
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
      'application/vnd.ms-excel', // xls
      'text/csv',
      'application/csv',
      'application/pdf',
      'text/plain'
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(xlsx?|csv|pdf|txt)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Formato não suportado. Use Excel (.xlsx/.xls), CSV ou PDF.'));
    }
  }
});

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface TargetContact {
  phone: string;
  name: string;
}

/** Agrupa e resolve todos os contatos únicos da empresa a partir de todas as fontes ativas */
async function resolveCampaignAudience(orgId: string, audience: string, filters: any): Promise<TargetContact[]> {
  const contactMap = new Map<string, TargetContact>();

  const normalizePhone = (p: string) => {
    if (!p) return '';
    return p.replace(/[^\d]/g, '');
  };

  const addContact = (rawPhone: string, rawName?: string) => {
    const phone = normalizePhone(rawPhone);
    if (!phone || phone.length < 8) return;
    const existing = contactMap.get(phone);
    const validName = (rawName && rawName.trim() !== 'Sem nome') ? rawName.trim() : '';
    const name = validName || (existing?.name && existing.name !== 'Cliente' ? existing.name : 'Cliente');
    contactMap.set(phone, { phone, name });
  };

  // 1. Tabela `contacts`
  const { data: dbContacts } = await supabaseAdmin
    .from('contacts')
    .select('phone, name')
    .eq('org_id', orgId);
  (dbContacts || []).forEach(c => addContact(c.phone, c.name));

  // 2. Tabela `conversation_history`
  const { data: histContacts } = await supabaseAdmin
    .from('conversation_history')
    .select('customer_phone')
    .eq('org_id', orgId);
  (histContacts || []).forEach(c => addContact(c.customer_phone));

  // 3. Tabela `followup_schedules`
  const { data: followupContacts } = await supabaseAdmin
    .from('followup_schedules')
    .select('customer_phone, customer_name')
    .eq('org_id', orgId);
  (followupContacts || []).forEach(c => addContact(c.customer_phone, c.customer_name));

  // 4. Tabela `bookings`
  const { data: bookingContacts } = await supabaseAdmin
    .from('bookings')
    .select('phone, first_name, last_name')
    .eq('org_id', orgId);
  (bookingContacts || []).forEach(c => {
    const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ');
    addContact(c.phone, fullName);
  });

  let allContacts = Array.from(contactMap.values());

  // Sincronizar automaticamente para a tabela `contacts` para salvar os contatos recuperados
  if (allContacts.length > 0) {
    try {
      const inserts = allContacts.map(c => ({
        org_id: orgId,
        phone: c.phone,
        name: c.name,
        source: 'whatsapp'
      }));
      await supabaseAdmin.from('contacts').upsert(inserts, { onConflict: 'org_id, phone' });
    } catch (upsertErr: any) {
      console.warn('[CAMPAIGNS] Aviso ao sincronizar contatos:', upsertErr.message);
    }
  }

  // Filtragem por Público Alvo:
  if (audience === 'active_24h') {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: activeHist } = await supabaseAdmin
      .from('conversation_history')
      .select('customer_phone')
      .eq('org_id', orgId)
      .gte('created_at', since);
    const activeSet = new Set((activeHist || []).map(h => normalizePhone(h.customer_phone)).filter(Boolean));
    allContacts = allContacts.filter(c => activeSet.has(c.phone));
  } else if (audience === 'customers') {
    const { data: bList } = await supabaseAdmin
      .from('bookings')
      .select('phone')
      .eq('org_id', orgId);
    const customerSet = new Set((bList || []).map(b => normalizePhone(b.phone)).filter(Boolean));
    allContacts = allContacts.filter(c => customerSet.has(c.phone));
  } else if (audience === 'leads') {
    const { data: bList } = await supabaseAdmin
      .from('bookings')
      .select('phone')
      .eq('org_id', orgId);
    const customerSet = new Set((bList || []).map(b => normalizePhone(b.phone)).filter(Boolean));
    allContacts = allContacts.filter(c => !customerSet.has(c.phone));
  }

  return allContacts;
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

    // Resolver contatos da audiência selecionada
    const targetContacts = await resolveCampaignAudience(orgId, campaign.audience || 'all', campaign.filters);

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

      // Gravar log individual por número de telefone para o relatório
      try {
        await supabaseAdmin.from('campaign_logs').insert({
          campaign_id: campaignId,
          org_id: orgId,
          customer_phone: contact.phone,
          customer_name: contact.name || null,
          status: sentId ? 'sent' : 'failed',
          message_id: sentId || null
        });
      } catch (logErr: any) {
        console.warn('[CAMPAIGN LOGS] Erro ao gravar log individual:', logErr.message);
      }

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

// Obter relatório detalhado da campanha (inclui números que receberam o disparo)
router.get('/:id/report', requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user!.orgId;
    const { id } = req.params;

    const { data: campaign, error: campErr } = await supabaseAdmin
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (campErr || !campaign) {
      return res.status(404).json({ error: 'Campanha não encontrada.' });
    }

    const { data: logs } = await supabaseAdmin
      .from('campaign_logs')
      .select('*')
      .eq('campaign_id', id)
      .order('created_at', { ascending: false });

    res.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        template: campaign.template,
        buttons: campaign.buttons || [],
        status: campaign.status,
        progress: campaign.progress || 0,
        sentCount: campaign.sent_count || 0,
        failedCount: campaign.failed_count || 0,
        totalContacts: campaign.total_contacts || 0,
        audience: campaign.audience || 'all',
        date: new Date(campaign.created_at).toLocaleDateString('pt-BR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit'
        })
      },
      logs: (logs || []).map((l: any) => ({
        id: l.id,
        phone: l.customer_phone,
        name: l.customer_name || 'Sem nome',
        status: l.status,
        messageId: l.message_id,
        sentAt: new Date(l.created_at).toLocaleDateString('pt-BR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit'
        })
      }))
    });
  } catch (error: any) {
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
      failedCount: c.failed_count || 0,
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

// ─── Pausar / Cancelar campanha ───────────────────────────────────────────────
router.patch('/:id/status', requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user!.orgId;
    const { id } = req.params;
    const { status } = req.body; // 'PAUSED' | 'CANCELLED'

    const allowed = ['PAUSED', 'CANCELLED', 'SENDING'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }

    const { error } = await supabaseAdmin
      .from('campaigns')
      .update({ status })
      .eq('id', id)
      .eq('org_id', orgId);

    if (error) throw error;
    res.json({ success: true, status });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Excluir log individual da campanha ───────────────────────────────────────
router.delete('/:id/logs/:logId', requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user!.orgId;
    const { id, logId } = req.params;

    const { error } = await supabaseAdmin
      .from('campaign_logs')
      .delete()
      .eq('id', logId)
      .eq('campaign_id', id)
      .eq('org_id', orgId);

    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Listar contatos da organização ──────────────────────────────────────────
router.get('/contacts', requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user!.orgId;
    const { data, error } = await supabaseAdmin
      .from('contacts')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ contacts: data || [] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Excluir contato ──────────────────────────────────────────────────────────
router.delete('/contacts/:contactId', requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user!.orgId;
    const { contactId } = req.params;

    const { error } = await supabaseAdmin
      .from('contacts')
      .delete()
      .eq('id', contactId)
      .eq('org_id', orgId);

    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Upload de lista de contatos (Excel / CSV / TXT) ─────────────────────────
router.post('/contacts/upload', requireAuth, upload.single('file'), async (req: any, res) => {
  try {
    const orgId = req.user!.orgId;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Nenhum ficheiro enviado.' });

    const ext = (file.originalname || '').toLowerCase();
    const contacts: { phone: string; name: string; email?: string }[] = [];

    const normalizePhone = (raw: string) => raw?.toString().replace(/[^\d+]/g, '').trim();

    if (ext.endsWith('.pdf')) {
      // PDF: tentativa de extração de texto via pdf-parse
      let pdfParse: any;
      try { pdfParse = require('pdf-parse'); } catch { /* not installed */ }
      if (!pdfParse) {
        return res.status(422).json({ error: 'Suporte a PDF não disponível no servidor. Use Excel ou CSV.' });
      }
      const pdfData = await pdfParse(file.buffer);
      const lines = pdfData.text.split(/[\r\n]+/).map((l: string) => l.trim()).filter(Boolean);
      // Tenta extrair números de telefone de cada linha
      const phoneRegex = /(?:\+?\d[\d\s\-().]{6,}\d)/g;
      for (const line of lines) {
        const matches = line.match(phoneRegex);
        if (matches) {
          for (const m of matches) {
            const phone = normalizePhone(m);
            if (phone.length >= 8) {
              contacts.push({ phone, name: 'Contato' });
            }
          }
        }
      }
    } else {
      // Excel / CSV / TXT → parsear com XLSX
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      for (const row of rows) {
        // Detecta coluna de telefone (procura variações comuns de header)
        const phoneKeys = ['phone', 'telefone', 'tel', 'celular', 'numero', 'número', 'mobile', 'whatsapp', 'fone', 'Phone', 'Telefone'];
        const nameKeys  = ['name', 'nome', 'Name', 'Nome', 'contato', 'Contato', 'cliente', 'Cliente'];
        const emailKeys = ['email', 'e-mail', 'Email', 'E-mail'];

        let rawPhone = '';
        for (const k of phoneKeys) {
          if (row[k] !== undefined && row[k] !== '') { rawPhone = String(row[k]); break; }
        }
        // Fallback: primeira coluna numérica
        if (!rawPhone) {
          for (const val of Object.values(row)) {
            const s = String(val).replace(/[^\d]/g, '');
            if (s.length >= 8) { rawPhone = String(val); break; }
          }
        }

        let rawName = '';
        for (const k of nameKeys) {
          if (row[k] !== undefined && row[k] !== '') { rawName = String(row[k]); break; }
        }

        let rawEmail = '';
        for (const k of emailKeys) {
          if (row[k] !== undefined && row[k] !== '') { rawEmail = String(row[k]); break; }
        }

        const phone = normalizePhone(rawPhone);
        if (phone.length >= 8) {
          contacts.push({ phone, name: rawName || 'Contato', email: rawEmail || undefined });
        }
      }
    }

    if (contacts.length === 0) {
      return res.status(422).json({ error: 'Nenhum número de telefone válido encontrado no ficheiro. Verifique se o ficheiro contém uma coluna "Telefone" ou "Phone".' });
    }

    // Upsert na tabela contacts
    const inserts = contacts.map(c => ({
      org_id: orgId,
      phone: c.phone,
      name: c.name,
      email: c.email || null,
      source: 'upload'
    }));

    const { error: upsertErr } = await supabaseAdmin
      .from('contacts')
      .upsert(inserts, { onConflict: 'org_id, phone' });

    if (upsertErr) throw upsertErr;

    res.json({
      success: true,
      imported: contacts.length,
      message: `${contacts.length} contato(s) importado(s) com sucesso.`
    });
  } catch (error: any) {
    console.error('[CONTACTS UPLOAD] Erro:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
