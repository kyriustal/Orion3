import { Router } from 'express';
import axios from 'axios';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';

const router = Router();

// Helper para descodificar o parâmetro state com suporte a JSON/base64 e fallback
function parseOAuthState(stateRaw: any): { targetOrgId: string; clientRedirectUri: string } {
  let targetOrgId = '';
  let clientRedirectUri = '';
  if (stateRaw && typeof stateRaw === 'string') {
    try {
      const decoded = JSON.parse(Buffer.from(decodeURIComponent(stateRaw), 'base64').toString('utf8'));
      if (decoded.id) targetOrgId = decoded.id;
      if (decoded.redirectUri) clientRedirectUri = decoded.redirectUri;
    } catch (_) {
      try {
        const decodedPlain = JSON.parse(decodeURIComponent(stateRaw));
        if (decodedPlain.id) targetOrgId = decodedPlain.id;
        if (decodedPlain.redirectUri) clientRedirectUri = decodedPlain.redirectUri;
      } catch (__) {
        targetOrgId = stateRaw;
      }
    }
  }
  return { targetOrgId, clientRedirectUri };
}

// ─── GET /api/settings/calendar/google/callback ──────────────────────────────
// Recebe o authorization code da Google após o utilizador autorizar
router.get('/google/callback', async (req, res) => {
  const { code, error, state, ping } = req.query;

  if (ping === 'true' || req.headers['accept']?.includes('application/json')) {
    return res.json({ status: 'ok', service: 'Google Calendar OAuth Callback', ready: true });
  }

  if (error) {
    console.error('[GOOGLE CALENDAR] Erro OAuth:', error);
    return res.redirect('/dashboard/settings?tab=calendar&error=google_denied');
  }

  if (!code) {
    return res.redirect('/dashboard/settings?tab=calendar&error=no_code');
  }

  let { targetOrgId, clientRedirectUri } = parseOAuthState(state);

  try {
    // 1. Obter credenciais do cliente especificamente para esta organização
    let org: any = null;

    if (targetOrgId) {
      const { data } = await supabaseAdmin
        .from('organizations')
        .select('id, google_client_id, google_client_secret')
        .eq('id', targetOrgId)
        .maybeSingle();
      org = data;
    }

    let clientId = (org?.google_client_id || '').trim();
    let clientSecret = (org?.google_client_secret || '').trim();

    // Se a organização não possuir o par completo de credenciais personalizadas na BD, usa as credenciais globais do .env (se existirem)
    if (!clientId || !clientSecret) {
      clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
      clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
    }

    if (!clientId || !clientSecret) {
      console.error('[GOOGLE CALENDAR] Credenciais Google não encontradas para a organização:', targetOrgId);
      return res.redirect('/dashboard/settings?tab=calendar&error=credentials_missing');
    }

    const rawProto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0].trim();
    const protocol = rawProto || req.protocol || 'https';
    const host = (req.headers['x-forwarded-host'] as string)?.split(',')[0].trim() || req.get('host');
    const computedRedirectUri = `${protocol}://${host}/api/settings/calendar/google/callback`;
    const redirectUri = clientRedirectUri || computedRedirectUri;

    // 2. Trocar code por tokens
    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
      code: code as string,
      client_id: clientId,
      client_secret: clientSecret,
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
      .eq('id', targetOrgId || org?.id);

    if (updateErr) throw updateErr;

    return res.redirect('/dashboard/settings?tab=calendar&success=google_connected');
  } catch (err: any) {
    const googleErr = err.response?.data?.error || '';
    const googleErrDesc = err.response?.data?.error_description || err.message || '';
    console.error('[GOOGLE CALENDAR] Erro ao trocar token:', err.response?.data || err.message);

    let errorParam = 'token_exchange_failed';
    if (googleErr === 'invalid_client') {
      errorParam = 'invalid_client_secret';
    } else if (googleErr === 'redirect_uri_mismatch') {
      errorParam = 'redirect_uri_mismatch';
    } else if (googleErr === 'invalid_grant') {
      errorParam = 'invalid_grant';
    }

    const encodedDetails = encodeURIComponent(googleErrDesc);
    return res.redirect(`/dashboard/settings?tab=calendar&error=${errorParam}&details=${encodedDetails}`);
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

  let { targetOrgId, clientRedirectUri } = parseOAuthState(state);

  try {
    // 1. Obter credenciais do cliente especificamente para esta organização
    let org: any = null;

    if (targetOrgId) {
      const { data } = await supabaseAdmin
        .from('organizations')
        .select('id, microsoft_client_id, microsoft_client_secret')
        .eq('id', targetOrgId)
        .maybeSingle();
      org = data;
    }

    let clientId = (org?.microsoft_client_id || '').trim();
    let clientSecret = (org?.microsoft_client_secret || '').trim();

    if (!clientId || !clientSecret) {
      clientId = (process.env.MICROSOFT_CLIENT_ID || '').trim();
      clientSecret = (process.env.MICROSOFT_CLIENT_SECRET || '').trim();
    }

    if (!clientId || !clientSecret) {
      console.error('[MICROSOFT CALENDAR] Credenciais Microsoft não encontradas para a organização:', targetOrgId);
      return res.redirect('/dashboard/settings?tab=calendar&error=credentials_missing');
    }

    const rawProto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0].trim();
    const protocol = rawProto || req.protocol || 'https';
    const host = (req.headers['x-forwarded-host'] as string)?.split(',')[0].trim() || req.get('host');
    const computedRedirectUri = `${protocol}://${host}/api/settings/calendar/microsoft/callback`;
    const redirectUri = clientRedirectUri || computedRedirectUri;

    // 2. Trocar code por tokens
    const tokenRes = await axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token', new URLSearchParams({
      code: code as string,
      client_id: clientId,
      client_secret: clientSecret,
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
      .eq('id', targetOrgId || org?.id);

    if (updateErr) throw updateErr;

    return res.redirect('/dashboard/settings?tab=calendar&success=microsoft_connected');
  } catch (err: any) {
    const msErr = err.response?.data?.error || '';
    const msErrDesc = err.response?.data?.error_description || err.message || '';
    console.error('[MICROSOFT CALENDAR] Erro ao trocar token:', err.response?.data || err.message);

    let errorParam = 'token_exchange_failed';
    if (msErr === 'invalid_client') {
      errorParam = 'invalid_client_secret';
    } else if (msErr === 'redirect_uri_mismatch') {
      errorParam = 'redirect_uri_mismatch';
    } else if (msErr === 'invalid_grant') {
      errorParam = 'invalid_grant';
    }

    const encodedDetails = encodeURIComponent(msErrDesc);
    return res.redirect(`/dashboard/settings?tab=calendar&error=${errorParam}&details=${encodedDetails}`);
  }
});

// ─── GET /api/settings/calendar/status ───────────────────────────────────────
// Verifica o estado da ligação do calendário para a organização actual
router.get('/status', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;

    const { data, error } = await supabaseAdmin
      .from('organizations')
      .select('calendar_provider, google_refresh_token, microsoft_refresh_token, google_client_id, google_client_secret, microsoft_client_id, microsoft_client_secret')
      .eq('id', orgId)
      .maybeSingle();

    if (error) throw error;

    const hasGoogleSystem = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    const hasGoogleOrg = !!(data?.google_client_id && data?.google_client_secret);

    const hasMicrosoftSystem = !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
    const hasMicrosoftOrg = !!(data?.microsoft_client_id && data?.microsoft_client_secret);

    res.json({
      provider: data?.calendar_provider || 'none',
      google_connected: !!(data?.google_refresh_token),
      microsoft_connected: !!(data?.microsoft_refresh_token),
      has_google_credentials: hasGoogleOrg || hasGoogleSystem,
      has_microsoft_credentials: hasMicrosoftOrg || hasMicrosoftSystem,
      system_google_client_id: process.env.GOOGLE_CLIENT_ID || '',
      system_microsoft_client_id: process.env.MICROSOFT_CLIENT_ID || '',
      has_saved_google_secret: !!data?.google_client_secret || !!process.env.GOOGLE_CLIENT_SECRET,
      has_saved_microsoft_secret: !!data?.microsoft_client_secret || !!process.env.MICROSOFT_CLIENT_SECRET,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
