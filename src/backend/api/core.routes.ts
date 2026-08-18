import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import { AIService } from '../services/ai.service';
import { BookingService } from '../services/booking.service';

const router = Router();

// ─── POST /api/agent/simulate — Simulação do agente no dashboard ─────────────
router.post('/agent/simulate', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { message, history } = req.body;
    const orgId = req.user?.orgId || req.user?.id || 'default';

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Mensagem não pode estar vazia.' });
    }

    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('name, phone, whatsapp, address, maps_link, telcosms_api_key, telcosms_sender_id, chatbot_name')
      .eq('id', orgId)
      .maybeSingle();

    const result = await AIService.generateResponse({
      message: message.trim(),
      orgId,
      history: (history || []).slice(-50),
      mode: 'simulation',
      botName: org?.chatbot_name || 'Assistente',
    });

    // Se o agendamento foi confirmado na simulação, processar via BookingService
    if (result.bookingData) {
      const bData = result.bookingData;
      console.log(`[SIMULATE-BOOKING] 📅 Agendamento detectado via Simulador para ${bData.name} (${bData.date} às ${bData.time})`);

      BookingService.processBooking(orgId, {
        name: bData.name,
        subject: bData.subject,
        phone: bData.phone,
        email: bData.email,
        date: bData.date,
        time: bData.time,
      }, { channelOrigin: 'Painel de Simulação' })
      .then(bRes => {
        if (bRes.success) {
          console.log(`[SIMULATE-BOOKING] ✅ Agendamento processado pelo BookingService! Lembretes: ${bRes.alertsScheduled}`);
        } else {
          console.warn(`[SIMULATE-BOOKING] ⚠️ Agendamento rejeitado: ${bRes.error}`);
        }
      })
      .catch(err => console.error('[SIMULATE-BOOKING] ❌ Erro BookingService:', err.message));
    }

    res.json(result);
  } catch (err: any) {
    console.error('[SIMULATE] Erro:', err.message);
    res.status(500).json({ error: 'Erro na simulação', details: err.message });
  }
});

// ─── GET /api/dashboard/metrics — Estatísticas em Tempo Real ────────────────
router.get('/dashboard/metrics', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user?.orgId;
    const { period } = req.query;
    
    let startDate = new Date();
    startDate.setHours(0, 0, 0, 0); // Default: hoje (24h)

    if (period === '7d') startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    else if (period === '30d') startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    else if (period === '3m') startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    else if (period === '6m') startDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    else if (period === '1y') startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

    const startIso = startDate.toISOString();

    // 1. Número total de mensagens no período
    const { count: msgs, error: msgError } = await supabaseAdmin
      .from('conversation_history')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', startIso);

    // 2. Número de chats únicos no período
    const { data: uniqueChats, error: chatError } = await supabaseAdmin
      .from('conversation_history')
      .select('customer_phone')
      .eq('org_id', orgId)
      .gte('created_at', startIso);

    const uniqueCustomers = new Set(uniqueChats?.map(c => c.customer_phone)).size;

    res.json({
      messagesToday: msgs || 0,
      newChats: uniqueCustomers || 0,
      resolutionRate: '98%', // Pode ser dinâmico no futuro
      apiStatus: 'Online'
    });
  } catch (err: any) {
    console.error('[METRICS] Erro:', err.message);
    res.status(500).json({ error: 'Erro ao obter métricas', details: err.message });
  }
});

// ─── GET /api/settings/org — Carregar configurações da organização ────────────
router.get('/settings/org', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId || req.user?.id;
    if (!orgId) return res.json({});

    const { data, error } = await supabaseAdmin
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .maybeSingle();

    if (error) throw error;

    // Auto-healing: Se a organização não existir na BD, criar registo base
    if (!data) {
      const ownerName = req.user?.name || req.user?.email?.split('@')[0] || 'Utilizador';
      const newOrg = {
        id: orgId,
        owner_email: req.user?.email || '',
        first_name: ownerName,
        name: 'Minha Empresa',
      };
      await supabaseAdmin.from('organizations').upsert(newOrg, { onConflict: 'id' });
      return res.json(newOrg);
    }

    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/settings/org — Guardar configurações da organização ────────────
router.post('/settings/org', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId || req.user?.id;
    if (!orgId) {
      return res.status(400).json({ error: 'ID da organização não identificado no token de sessão.' });
    }

    const body = req.body || {};

    // 1. Obter registo existente para identificar colunas existentes na tabela
    const { data: existingOrg } = await supabaseAdmin
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .maybeSingle();

    const knownColumns = [
      'name', 'first_name', 'last_name', 'owner_email', 'phone', 'whatsapp', 'address', 'maps_link',
      'contact_person', 'social_object', 'employees_count', 'product_description',
      'chatbot_name', 'use_emojis', 'emoji_mode', 'calendar_provider', 'calendar_link',
      'google_client_id', 'google_client_secret', 'google_refresh_token', 'google_direct_url', 'google_user_refresh_token',
      'microsoft_client_id', 'microsoft_client_secret', 'microsoft_refresh_token',
      'telcosms_api_key', 'telcosms_sender_id',
      'handover_mode', 'ai_tone', 'ai_prompt'
    ];

    const validColumns = existingOrg
      ? Array.from(new Set([...Object.keys(existingOrg), ...knownColumns]))
      : knownColumns;

    const filteredUpdate: any = {};
    for (const key of Object.keys(body)) {
      if (validColumns.includes(key) && key !== 'id') {
        filteredUpdate[key] = body[key];
      }
    }

    console.log(`[SETTINGS] A guardar dados da organização ${orgId}:`, Object.keys(filteredUpdate));

    let error: any = null;

    if (existingOrg) {
      const updateRes = await supabaseAdmin
        .from('organizations')
        .update(filteredUpdate)
        .eq('id', orgId);
      error = updateRes.error;
    } else {
      const defaultName = req.user?.name || req.user?.email?.split('@')[0] || 'Minha Empresa';
      const newOrgData = {
        id: orgId,
        name: filteredUpdate.name || defaultName,
        first_name: filteredUpdate.first_name || defaultName,
        owner_email: filteredUpdate.owner_email || req.user?.email || '',
        ...filteredUpdate,
      };
      const insertRes = await supabaseAdmin
        .from('organizations')
        .insert(newOrgData);
      error = insertRes.error;
    }

    // Se o Supabase falhar por causa de colunas que não existem no Schema atual da BD do utilizador
    if (error && (error.message?.includes('column') || error.code === 'PGRST204')) {
      console.warn('[SETTINGS] Colunas opcionais não encontradas na BD. A tentar guardar apenas campos padrão:', error.message);
      const safeUpdate = { ...filteredUpdate };
      delete safeUpdate.google_client_id;
      delete safeUpdate.google_client_secret;
      delete safeUpdate.google_refresh_token;
      delete safeUpdate.google_direct_url;
      delete safeUpdate.google_user_refresh_token;
      delete safeUpdate.microsoft_client_id;
      delete safeUpdate.microsoft_client_secret;
      delete safeUpdate.microsoft_refresh_token;
      delete safeUpdate.calendar_provider;
      delete safeUpdate.calendar_link;
      delete safeUpdate.telcosms_api_key;
      delete safeUpdate.telcosms_sender_id;
      delete safeUpdate.maps_link;

      if (existingOrg) {
        const { error: fallbackErr } = await supabaseAdmin
          .from('organizations')
          .update(safeUpdate)
          .eq('id', orgId);
        if (fallbackErr) throw fallbackErr;
      } else {
        const defaultName = req.user?.name || req.user?.email?.split('@')[0] || 'Minha Empresa';
        const safeInsert = {
          id: orgId,
          name: safeUpdate.name || defaultName,
          first_name: safeUpdate.first_name || defaultName,
          owner_email: safeUpdate.owner_email || req.user?.email || '',
          ...safeUpdate,
        };
        const { error: fallbackErr } = await supabaseAdmin
          .from('organizations')
          .insert(safeInsert);
        if (fallbackErr) throw fallbackErr;
      }
    } else if (error) {
      throw error;
    }

    res.json({ message: 'Configurações guardadas com sucesso.' });
  } catch (err: any) {
    console.error('[SETTINGS] Erro ao guardar configurações:', err.message);
    res.status(500).json({ error: err.message || 'Erro ao salvar configurações' });
  }
});

// ─── POST /api/settings/telcosms/test — Testar envio de SMS ─────────────────
router.post('/settings/telcosms/test', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId || req.user?.id;
    const { apiKey, senderId, phone } = req.body;

    const { TelcoSMSService } = await import('../services/telcosms.service');

    let targetPhone = phone;
    if (!targetPhone) {
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('phone, whatsapp')
        .eq('id', orgId)
        .maybeSingle();
      targetPhone = org?.whatsapp || org?.phone;
    }

    if (!targetPhone) {
      return res.status(400).json({ error: 'Nenhum número de telefone fornecido para o teste.' });
    }

    const result = await TelcoSMSService.sendSMS({
      to: targetPhone,
      message: 'Olá! Este é um SMS de teste da sua integração TelcoSMS com a plataforma Orion.',
      apiKey,
      senderId,
      orgId
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Falha ao enviar SMS de teste.' });
    }

    res.json({ message: 'SMS de teste enviado com sucesso!', details: result.details });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/settings/password — Alterar senha ────────────────────────────
router.post('/settings/password', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { newPassword } = req.body;
    const email = req.user?.email;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.user!.id, {
      password: newPassword,
    });

    if (error) throw error;

    res.json({ message: 'Senha alterada com sucesso.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
