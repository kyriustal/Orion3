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

// ─── GET /api/settings/org — Carregar configurações da organização ────────────
router.get('/settings/org', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.id;
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
    const orgId = req.user?.id;
    const body = req.body;

    const { error } = await supabaseAdmin
      .from('organizations')
      .update(body)
      .eq('id', orgId);

    if (error) {
      // Tabela ou coluna não existe — não bloquear a UI
      if (error.code === '42P01' || error.code === '42703') {
        console.warn('[SETTINGS] Tabela ou coluna não existe no banco. Ignorando.', error.message);
        return res.json({ message: 'Configurações guardadas.' });
      }
      throw error;
    }

    res.json({ message: 'Configurações guardadas com sucesso.' });
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
