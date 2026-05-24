import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import { AIService } from '../services/ai.service';

const router = Router();

// ─── POST /api/agent/simulate — Simulação do agente no dashboard ─────────────
router.post('/agent/simulate', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { message, history } = req.body;
    const orgId = req.user?.id || 'default';

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Mensagem não pode estar vazia.' });
    }

    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('chatbot_name')
      .eq('id', orgId)
      .maybeSingle();

    const result = await AIService.generateResponse({
      message: message.trim(),
      orgId,
      history: (history || []).slice(-50),
      mode: 'simulation',
      botName: org?.chatbot_name || 'Assistente',
    });

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
    const orgId = req.user?.orgId;
    const { data, error } = await supabaseAdmin
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .maybeSingle();

    if (error) throw error;
    res.json(data || {});
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/settings/org — Guardar configurações da organização ────────────
router.post('/settings/org', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const body = req.body;

    // 1. Obter um registo para inspecionar as colunas válidas na base de dados
    const { data: existingOrg, error: fetchError } = await supabaseAdmin
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existingOrg) {
      return res.status(404).json({ error: 'Organização não encontrada.' });
    }

    // 2. Filtrar apenas as chaves do body que existem como colunas na tabela 'organizations'
    const validColumns = Object.keys(existingOrg);
    const filteredUpdate: any = {};
    for (const key of Object.keys(body)) {
      if (validColumns.includes(key)) {
        filteredUpdate[key] = body[key];
      }
    }

    // 3. Executar o update apenas com as colunas válidas
    console.log(`[SETTINGS] A atualizar organização ${orgId} com as colunas filtradas:`, Object.keys(filteredUpdate));

    const { error } = await supabaseAdmin
      .from('organizations')
      .update(filteredUpdate)
      .eq('id', orgId);

    if (error) throw error;

    res.json({ message: 'Configurações guardadas com sucesso.' });
  } catch (err: any) {
    console.error('[SETTINGS] Erro ao guardar configurações:', err.message);
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
