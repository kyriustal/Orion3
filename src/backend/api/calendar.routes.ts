import { Router } from 'express';
import axios from 'axios';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';

const router = Router();

// ─── GET /api/settings/calendar/google/callback ──────────────────────────────
// Recebe o authorization code da Google após o utilizador autorizar
router.get('/google/callback', async (req, res) => {
  const { code, error, state } = req.query;

  if (error) {
    console.error('[GOOGLE CALENDAR] Erro OAuth:', error);
    return res.redirect('/dashboard/settings?tab=calendar&error=google_denied');
  }

  if (!code) {
    return res.redirect('/dashboard/settings?tab=calendar&error=no_code');
  }

  const orgId = state as string;
  if (!orgId) {
    console.error('[GOOGLE CALENDAR] State (orgId) ausente.');
    return res.redirect('/dashboard/settings?tab=calendar&error=invalid_state');
  }

  try {
    // 1. Obter credenciais do cliente da base de dados
    const { data: org, error: dbErr } = await supabaseAdmin
      .from('organizations')
      .select('google_client_id, google_client_secret')
      .eq('id', orgId)
      .maybeSingle();

    if (dbErr || !org || !org.google_client_id || !org.google_client_secret) {
      console.error('[GOOGLE CALENDAR] Credenciais Google não encontradas para a organização:', orgId, dbErr);
      return res.redirect('/dashboard/settings?tab=calendar&error=credentials_missing');
    }

    const redirectUri = `${req.protocol}://${req.get('host')}/api/settings/calendar/google/callback`;

    // 2. Trocar code por tokens
    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
      code: code as string,
      client_id: org.google_client_id,
      client_secret: org.google_client_secret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    }).toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const { refresh_token } = tokenRes.data;

    if (!refresh_token) {
      console.warn('[GOOGLE CALENDAR] Nenhum refresh_token retornado. Utilizador pode já ter autorizado antes. A atualizar apenas a ligação.');
    }

    // 3. Gravar na base de dados
    const updateData: any = {};
    if (refresh_token) {
      updateData.google_refresh_token = refresh_token;
    }

    // Sempre definir como provedor Google se conectado com sucesso
    updateData.calendar_provider = 'google';

    const { error: updateErr } = await supabaseAdmin
      .from('organizations')
      .update(updateData)
      .eq('id', orgId);

    if (updateErr) throw updateErr;

    return res.redirect('/dashboard/settings?tab=calendar&success=google_connected');
  } catch (err: any) {
    console.error('[GOOGLE CALENDAR] Erro ao trocar token:', err.response?.data || err.message);
    return res.redirect('/dashboard/settings?tab=calendar&error=token_exchange_failed');
  }
});

// ─── GET /api/settings/calendar/microsoft/callback ───────────────────────────
// Recebe o authorization code da Microsoft após o utilizador autorizar
router.get('/microsoft/callback', async (req, res) => {
  const { code, error, state } = req.query;

  if (error) {
    console.error('[MICROSOFT CALENDAR] Erro OAuth:', error);
    return res.redirect('/dashboard/settings?tab=calendar&error=microsoft_denied');
  }

  if (!code) {
    return res.redirect('/dashboard/settings?tab=calendar&error=no_code');
  }

  const orgId = state as string;
  if (!orgId) {
    console.error('[MICROSOFT CALENDAR] State (orgId) ausente.');
    return res.redirect('/dashboard/settings?tab=calendar&error=invalid_state');
  }

  try {
    // 1. Obter credenciais do cliente da base de dados
    const { data: org, error: dbErr } = await supabaseAdmin
      .from('organizations')
      .select('microsoft_client_id, microsoft_client_secret')
      .eq('id', orgId)
      .maybeSingle();

    if (dbErr || !org || !org.microsoft_client_id || !org.microsoft_client_secret) {
      console.error('[MICROSOFT CALENDAR] Credenciais Microsoft não encontradas para a organização:', orgId, dbErr);
      return res.redirect('/dashboard/settings?tab=calendar&error=credentials_missing');
    }

    const redirectUri = `${req.protocol}://${req.get('host')}/api/settings/calendar/microsoft/callback`;

    // 2. Trocar code por tokens
    const tokenRes = await axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token', new URLSearchParams({
      code: code as string,
      client_id: org.microsoft_client_id,
      client_secret: org.microsoft_client_secret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      scope: 'Calendars.ReadWrite'
    }).toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const { refresh_token } = tokenRes.data;

    // 3. Gravar na base de dados
    const updateData: any = {};
    if (refresh_token) {
      updateData.microsoft_refresh_token = refresh_token;
    }
    updateData.calendar_provider = 'microsoft';

    const { error: updateErr } = await supabaseAdmin
      .from('organizations')
      .update(updateData)
      .eq('id', orgId);

    if (updateErr) throw updateErr;

    return res.redirect('/dashboard/settings?tab=calendar&success=microsoft_connected');
  } catch (err: any) {
    console.error('[MICROSOFT CALENDAR] Erro ao trocar token:', err.response?.data || err.message);
    return res.redirect('/dashboard/settings?tab=calendar&error=token_exchange_failed');
  }
});

// ─── GET /api/settings/calendar/status ───────────────────────────────────────
// Verifica o estado da ligação do calendário para a organização actual
router.get('/status', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;

    const { data, error } = await supabaseAdmin
      .from('organizations')
      .select('calendar_provider, google_refresh_token, microsoft_refresh_token')
      .eq('id', orgId)
      .maybeSingle();

    if (error) throw error;

    res.json({
      provider: data?.calendar_provider || 'none',
      google_connected: !!(data?.google_refresh_token),
      microsoft_connected: !!(data?.microsoft_refresh_token),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
