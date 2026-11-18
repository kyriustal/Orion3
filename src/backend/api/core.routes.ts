import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import { AIService } from '../services/ai.service';
import { GenAITextService } from '../services/genai_text.service';
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

// ─── POST /api/copilot/suggest — Copilot: sugerir resposta para o humano ─────
router.post('/copilot/suggest', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user?.orgId || req.user?.id;
    const { phone, draft } = req.body || {};

    if (!orgId || !phone) {
      return res.status(400).json({ error: 'Organização e telefone do cliente são obrigatórios.' });
    }

    const phoneVariants = [phone, `+${String(phone).replace(/\D/g, '')}`];

    // Últimas 30 mensagens da conversa
    const { data: historyRows } = await supabaseAdmin
      .from('conversation_history')
      .select('sender, text, created_at')
      .eq('org_id', orgId)
      .in('customer_phone', phoneVariants)
      .order('created_at', { ascending: false })
      .limit(30);

    const history = (historyRows || []).reverse();
    if (history.length === 0) {
      return res.status(400).json({ error: 'Sem histórico de conversa para este cliente.' });
    }

    // Contexto da empresa
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('name, product_description, chatbot_name')
      .eq('id', orgId)
      .maybeSingle();

    const { data: contact } = await supabaseAdmin
      .from('contacts')
      .select('name')
      .eq('org_id', orgId)
      .in('phone', phoneVariants)
      .maybeSingle();

    const transcript = history
      .map(h => `${h.sender === 'user' ? 'CLIENTE' : h.sender === 'human' ? 'ATENDENTE' : 'BOT'}: ${h.text}`)
      .join('\n');

    const suggestion = await GenAITextService.generate(
      `Conversa até agora:\n${transcript}\n\n${draft ? `O atendente começou a escrever: "${draft}"\n\nComplete/melhore este rascunho como resposta ao cliente.` : 'Sugira a próxima resposta que o atendente humano deve enviar ao cliente.'}\n\nResponda APENAS com o texto da mensagem sugerida (sem aspas, sem explicações).`,
      {
        system: `És um copilot de atendimento ao cliente da empresa "${org?.name || 'Empresa'}". ${org?.product_description ? `Sobre a empresa: ${org.product_description}` : ''} O cliente chama-se ${contact?.name || 'Cliente'}. Escreve respostas naturais, profissionais e empáticas, na mesma língua do cliente.`,
        temperature: 0.6,
        maxOutputTokens: 500,
      }
    );

    // Resumo da conversa em paralelo lógico (segunda chamada leve)
    const summary = await GenAITextService.generate(
      `Resume esta conversa de atendimento em 2-3 linhas curtas (assunto, estado emocional do cliente, o que falta resolver):\n\n${transcript}`,
      { temperature: 0.3, maxOutputTokens: 200 }
    ).catch(() => '');

    res.json({ suggestion, summary, customerName: contact?.name || null });
  } catch (err: any) {
    console.error('[COPILOT] Erro:', err.message);
    res.status(500).json({ error: 'Erro ao gerar sugestão', details: err.message });
  }
});

// ─── POST /api/agent/persona-message — Gerar mensagem de cliente sintético ────
// Usado na página Simulação: a IA faz o papel de um cliente difícil para treinar
// e testar o bot antes de mexer nos prompts em produção.
const SIMULATION_PERSONAS: Record<string, string> = {
  agressivo:  'És um cliente IRRITADO e impaciente. Reclamas de um atraso/problema, usas tom exigente e frustrado (mas sem insultos graves). Respostas curtas e ríspidas.',
  confuso:    'És um cliente CONFUSO que não percebe tecnologia. Fazes perguntas desorganizadas, misturas assuntos, escreves com erros e mudas de ideias a meio.',
  apressado:  'És um cliente com MUITA PRESSA. Queres tudo para ontem, escreves mensagens curtas e diretas, e ficas irritado se o bot enrolar.',
  cetico:     'És um cliente CÉTICO e desconfiado. Questionas preços, pedes provas, comparas com a concorrência e duvidas das promessas do bot.',
  indeciso:   'És um cliente INDECISO. Interessa-te pelo serviço mas nunca decides, fazes perguntas em círculos e pedes sempre "mais um desconto".',
};

router.post('/agent/persona-message', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { persona = 'confuso', history = [] } = req.body || {};

    const personaPrompt = SIMULATION_PERSONAS[persona] || SIMULATION_PERSONAS.confuso;

    const transcript = (history as any[])
      .slice(-20)
      .map(h => `${h.sender === 'user' ? 'CLIENTE (tu)' : 'EMPRESA'}: ${h.text}`)
      .join('\n');

    const message = await GenAITextService.generate(
      transcript
        ? `Conversa até agora:\n${transcript}\n\nEscreve a PRÓXIMA mensagem do cliente (tu), dando continuidade natural à conversa.`
        : 'Inicia a conversa como este cliente, com a tua primeira mensagem à empresa.',
      {
        system: `${personaPrompt}\n\nEstás a falar com o assistente virtual de uma empresa no WhatsApp. Escreve APENAS a mensagem do cliente, curta e realista (máx. 2-3 frases), em português.`,
        temperature: 0.9,
        maxOutputTokens: 200,
      }
    );

    res.json({ message, persona });
  } catch (err: any) {
    console.error('[PERSONA] Erro:', err.message);
    res.status(500).json({ error: 'Erro ao gerar mensagem do cliente', details: err.message });
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
      'google_sheets_webhook_url', 'daily_report_email',
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
