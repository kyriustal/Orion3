import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import { AIService, getUniqueApiKeys, CustomerProfile } from '../services/ai.service';
import { WhatsAppService } from '../services/whatsapp.service';
import { AudioService } from '../services/audio.service';
import { DocumentService } from '../services/document.service';
import { EmailService } from '../services/email.service';
import { PushService } from '../services/push.service';
import { createGoogleCalendarEvent } from '../services/calendar.service';
import { TelcoSMSService } from '../services/telcosms.service';
import { BookingService } from '../services/booking.service';
import { FollowupService } from '../services/followup.service';
import { GoogleSheetsService } from '../services/google_sheets.service';
import { getIo } from '../socket';
import axios from 'axios';
import fs from 'fs';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v19.0';

function getPublicBaseUrl(req: AuthRequest) {
  const configured = process.env.PUBLIC_BASE_URL || process.env.APP_URL || process.env.FRONTEND_URL;
  if (configured) return configured.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

async function subscribeWhatsAppWebhooks(params: {
  req: AuthRequest;
  wabaId: string;
  accessToken: string;
  appId?: string;
  appSecret?: string;
}) {
  const { req, wabaId, accessToken } = params;
  const appId = (process.env.META_APP_ID || params.appId || '').toString().trim();
  const appSecret = (process.env.META_APP_SECRET || params.appSecret || '').toString().trim();
  const verifyToken = process.env.META_VERIFY_TOKEN || 'orion_webhook_token';
  const callbackUrl = `${getPublicBaseUrl(req)}/api/whatsapp/webhook`;
  const result: any = {
    callbackUrl,
    appSubscription: null,
    wabaSubscription: null,
  };

  if (appId && appSecret) {
    try {
      const appToken = `${appId}|${appSecret}`;
      const appSubRes = await axios.post(`https://graph.facebook.com/${META_GRAPH_VERSION}/${appId}/subscriptions`, null, {
        params: {
          object: 'whatsapp_business_account',
          callback_url: callbackUrl,
          verify_token: verifyToken,
          fields: 'messages,message_template_status_update,account_update,phone_number_quality_update,phone_number_name_update',
          include_values: true,
          access_token: appToken,
        },
      });
      result.appSubscription = { success: true, data: appSubRes.data };
    } catch (err: any) {
      result.appSubscription = { success: false, error: err.response?.data || err.message };
      console.warn('[WHATSAPP WEBHOOKS] Aviso ao configurar webhook do app:', result.appSubscription.error);
    }
  }

  try {
    const wabaSubRes = await axios.post(`https://graph.facebook.com/${META_GRAPH_VERSION}/${wabaId}/subscribed_apps`, {
      override_callback_uri: callbackUrl,
      verify_token: verifyToken,
    }, {
      headers: { 'Content-Type': 'application/json' },
      params: { access_token: accessToken },
    });
    result.wabaSubscription = { success: true, data: wabaSubRes.data };
  } catch (err: any) {
    result.wabaSubscription = { success: false, error: err.response?.data || err.message };
    console.warn('[WHATSAPP WEBHOOKS] Erro ao subscrever WABA:', result.wabaSubscription.error);
    throw err;
  }

  return result;
}

// ─── Helper: Upload de média do cliente para o Supabase Storage ───────────────
async function uploadClientMediaToStorage(
  orgId: string,
  base64Data: string,
  mimeType: string,
  originalFileName: string
): Promise<string | null> {
  try {
    // Garantir que o bucket 'assets' existe
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    if (!buckets?.some(b => b.name === 'assets')) {
      await supabaseAdmin.storage.createBucket('assets', { public: true });
    }

    // Sanitizar nome do ficheiro
    const sanitizedName = originalFileName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'ficheiro';

    // Extensão baseada no mimeType quando o nome não tem extensão útil
    const ext = sanitizedName.includes('.') ? '' : (mimeType.split('/')[1] || 'bin');
    const fileNameOnStorage = `${orgId}/client_${Date.now()}_${sanitizedName}${ext ? '.' + ext : ''}`;

    const buffer = Buffer.from(base64Data, 'base64');

    const { error: uploadError } = await supabaseAdmin.storage
      .from('assets')
      .upload(fileNameOnStorage, buffer, { contentType: mimeType, upsert: true });

    if (uploadError) {
      console.error('[CLIENT-MEDIA] Erro no upload para Storage:', uploadError.message);
      return null;
    }

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('assets')
      .getPublicUrl(fileNameOnStorage);

    console.log(`[CLIENT-MEDIA] ✅ Ficheiro do cliente guardado: ${publicUrl}`);
    return publicUrl;
  } catch (err: any) {
    console.error('[CLIENT-MEDIA] Erro inesperado:', err.message);
    return null;
  }
}

// ─── Controlo de estado em memória ────────────────────────────────────────────

/** Dedup — IDs de mensagens já processadas (limpa a cada 10 min) */
const processedMessages = new Set<string>();
setInterval(() => processedMessages.clear(), 10 * 60 * 1000);

/** Echo detection — IDs de mensagens enviadas pela nossa IA (limpa a cada 30 min) */
const botSentMessages = new Set<string>();
setInterval(() => botSentMessages.clear(), 30 * 60 * 1000);

/** Coexistência — timestamp de quando o humano respondeu por último (limpa automaticamente) */
const aiPauses = new Map<string, number>();

// ─── GET /api/whatsapp/ping ───────────────────────────────────────────────────
router.get('/ping', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const { data: config } = await supabaseAdmin
      .from('whatsapp_config')
      .select('is_active, display_name, phone_number_id')
      .eq('org_id', orgId)
      .maybeSingle();

    res.json({
      status: 'ok',
      config_active: !!config?.is_active,
      bot_name: config?.display_name || 'Não configurado',
      phone_id: config?.phone_number_id || 'Não configurado',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/whatsapp/config ─────────────────────────────────────────────────
router.get('/config', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const { data, error } = await supabaseAdmin
      .from('whatsapp_config')
      .select('*')
      .eq('org_id', orgId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.json(null);

    let phone = '';
    let extraMeta: any = {};
    if (data.description) {
      try {
        const parsed = JSON.parse(data.description);
        phone = parsed.phone || '';
        extraMeta = parsed;
      } catch (_) {
        phone = data.description;
      }
    }

    res.json({
      ...data,
      phone: phone || (data as any).phone || '',
      business_category: extraMeta.business_category || (data as any).business_category || '',
      website: extraMeta.website || (data as any).website || '',
      support_email: extraMeta.support_email || (data as any).support_email || '',
      app_id: extraMeta.app_id || (data as any).app_id || '',
      client_secret: extraMeta.client_secret || (data as any).client_secret || '',
      description: extraMeta.about || extraMeta.description || data.description || '',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/whatsapp/chats — Listar conversas ───────────────────────────────
router.get('/chats', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;

    // ── 1. Buscar a última mensagem de cada conversa (sem limite) ──────────────
    // Para garantir que TODAS as conversas aparecem, fazemos duas queries:
    //   a) A última mensagem de cada customer_phone (para preview e timestamp)
    //   b) Todos os registos de status (attended, booking, error) para calcular badges

    // a) Última mensagem por conversa — busca apenas a linha mais recente de cada phone
    //    Supabase não suporta DISTINCT ON nativo no SDK, por isso buscamos DESC sem limit
    //    mas apenas os campos mínimos necessários para o preview (sem texto completo).
    const { data: allRows, error: allErr } = await supabaseAdmin
      .from('conversation_history')
      .select('customer_phone, text, created_at, sender, metadata')
      .eq('org_id', orgId)
      .not('customer_phone', 'is', null)
      .neq('customer_phone', 'null')
      .order('created_at', { ascending: false });

    if (allErr) throw allErr;

    // Construir mapa de última mensagem por phone (primeira ocorrência = mais recente)
    const lastMsgMap = new Map<string, typeof allRows[0]>();
    // Construir mapa de status por phone (iterar todos os registos em ordem decrescente)
    const phoneStatusMap = new Map<string, {
      needs_confirm: boolean;
      has_exclamation: boolean;
      has_error: boolean;
      attended: boolean;
      concluded: boolean;
    }>();

    for (const item of (allRows || [])) {
      const phone = item.customer_phone;
      if (!phone || phone === 'null') continue;

      // Registar a última mensagem (primeira vez que vemos este phone, pois está DESC)
      if (!lastMsgMap.has(phone)) {
        lastMsgMap.set(phone, item);
      }

      // Acumular status para este phone
      if (!phoneStatusMap.has(phone)) {
        phoneStatusMap.set(phone, {
          needs_confirm: false,
          has_exclamation: false,
          has_error: false,
          attended: false,
          concluded: false,
        });
      }
      const st = phoneStatusMap.get(phone)!;

      if (item.metadata?.attended === true || item.metadata?.concluded === true) {
        // Se foi atendido ou concluído, limpar flags de pendência
        st.attended = true;
        st.concluded = true;
        st.needs_confirm = false;
        st.has_exclamation = false;
      } else if (!st.attended && !st.concluded) {
        // Apenas avalia bookings anteriores se não encontrou um status de atendido/concluído mais recente
        if (item.metadata?.booking === true || item.metadata?.confirm === true) {
          st.needs_confirm = true;
        }
        if (item.metadata?.no_show_reschedule === true || item.metadata?.noShowReschedule === true) {
          st.has_exclamation = true;
        }
      }
      if (item.metadata?.internal_error === true && !item.metadata?.resolved) {
        st.has_error = true;
      }
    }

    // ── 2. Montar o array de chats a partir do mapa de última mensagem ─────────
    const chats = Array.from(lastMsgMap.entries()).map(([phone, item]) => {
      const platform = item.metadata?.platform || 'whatsapp';
      let nameDisplay = `WhatsApp (${phone})`;
      if (platform === 'instagram') nameDisplay = `Instagram (@${phone})`;
      else if (platform === 'facebook') nameDisplay = `Messenger (${phone.slice(-6)})`;

      const st = phoneStatusMap.get(phone) || {
        needs_confirm: false,
        has_exclamation: false,
        has_error: false,
        attended: false,
        concluded: false,
      };

      return {
        id: phone,
        phone,
        name: nameDisplay,
        lastMessage: item.text,
        time: new Date(item.created_at).toLocaleTimeString('pt-PT', { timeZone: 'Africa/Luanda', hour: '2-digit', minute: '2-digit' }),
        timestamp: item.created_at,
        lastSender: item.sender,
        platform,
        needs_confirm: st.needs_confirm,
        has_exclamation: st.has_exclamation,
        has_error: st.has_error,
        attended: st.attended,
        concluded: st.concluded,
      };
    });

    res.json(chats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/whatsapp/mark-attended — Marcar atendimento como realizado ─────
router.post('/mark-attended', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Telefone obrigatório.' });
    }

    await supabaseAdmin.from('conversation_history').insert({
      org_id: orgId,
      customer_phone: phone,
      sender: 'human',
      text: '[ATENDIMENTO CONFIRMADO PELO AGENTE]',
      metadata: { attended: true, concluded: true, internal_note: true }
    });

    try {
      getIo().to(`org:${orgId}`).emit('chat_status_updated', {
        phone,
        attended: true,
        concluded: true,
        needs_confirm: false,
        has_exclamation: false,
      });
    } catch (_) {}

    res.json({ success: true, message: 'Atendimento marcado como concluído!' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/whatsapp/history/:phone ─────────────────────────────────────────
router.get('/history/:phone', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const { phone } = req.params;

    const { data, error } = await supabaseAdmin
      .from('conversation_history')
      .select('*')
      .eq('org_id', orgId)
      .eq('customer_phone', phone)
      .order('created_at', { ascending: false })
      .limit(5000);

    if (error) throw error;

    const messages = (data || []).reverse().map(m => ({
      id: m.id,
      sender: m.sender,
      text: m.text,
      time: new Date(m.created_at).toLocaleTimeString('pt-PT', { timeZone: 'Africa/Luanda', hour: '2-digit', minute: '2-digit' }),
      timestamp: m.created_at,
      botName: m.metadata?.botName || undefined,
      agentName: m.metadata?.agentName || undefined,
      metadata: m.metadata || undefined,
    }));

    res.json(messages);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/whatsapp/send — Envio manual pelo agente humano ────────────────
router.post('/send', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const { phone, message, clientMsgId } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ error: 'phone e message são obrigatórios.' });
    }

    const { data: config } = await supabaseAdmin
      .from('whatsapp_config')
      .select('phone_number_id, access_token')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .maybeSingle();

    if (!config) return res.status(404).json({ error: 'Nenhuma configuração WhatsApp activa.' });

    // Pausar a IA por 5 minutos quando o agente humano envia
    const historyKey = `${orgId}:${phone}`;
    aiPauses.set(historyKey, Date.now() + 5 * 60 * 1000);

    const sentId = await WhatsAppService.sendTextMessage(
      config.phone_number_id,
      phone,
      message,
      config.access_token
    );

    if (sentId) botSentMessages.add(sentId);

    const agentName = req.user?.name || req.user?.email?.split('@')[0] || 'Agente';
    const metadata = { agentName, clientMsgId };

    // Persistir no histórico
    await supabaseAdmin.from('conversation_history').insert({
      org_id: orgId,
      customer_phone: phone,
      sender: 'human',
      text: message,
      metadata
    });

    // Emitir via socket para sincronizar em tempo real com outros navegadores/membros da equipa
    try {
      getIo().to(`org:${orgId}`).emit('new_message', {
        phone:     phone,
        sender:    'human',
        text:      message,
        time:      new Date().toLocaleTimeString('pt-PT', { timeZone: 'Africa/Luanda', hour: '2-digit', minute: '2-digit' }),
        timestamp: new Date().toISOString(),
        platform:  'whatsapp',
        agentName: agentName,
        metadata
      });
    } catch (_) { /* silencioso */ }

    res.json({ message: 'Mensagem enviada com sucesso.', id: sentId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/whatsapp/send-file — Envio manual de ficheiros pelo agente humano ────────
router.post('/send-file', requireAuth, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const { phone, message, clientMsgId } = req.body;
    const file = req.file;

    if (!phone) {
      return res.status(400).json({ error: 'phone é obrigatório.' });
    }
    if (!file) {
      return res.status(400).json({ error: 'Nenhum ficheiro enviado.' });
    }

    const { data: config } = await supabaseAdmin
      .from('whatsapp_config')
      .select('phone_number_id, access_token')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .maybeSingle();

    if (!config) return res.status(404).json({ error: 'Nenhuma configuração WhatsApp activa.' });

    // Pausar a IA por 5 minutos quando o agente humano envia
    const historyKey = `${orgId}:${phone}`;
    aiPauses.set(historyKey, Date.now() + 5 * 60 * 1000);

    // 1. Sanitizar o nome do ficheiro para o Supabase Storage
    const sanitizedName = file.originalname
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    const fileNameOnStorage = `${orgId}/livechat_${Date.now()}_${sanitizedName}`;

    // 2. Garantir que o bucket 'assets' existe (cria se necessário)
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    const bucketExists = buckets?.some(b => b.name === 'assets');
    if (!bucketExists) {
      await supabaseAdmin.storage.createBucket('assets', { public: true });
    }

    // 3. Upload para o Supabase Storage
    const { error: uploadError } = await supabaseAdmin.storage
      .from('assets')
      .upload(fileNameOnStorage, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) {
      console.error('[LIVECHAT-FILE] Erro no upload para Storage:', uploadError.message);
      return res.status(500).json({ error: `Erro no upload do ficheiro: ${uploadError.message}` });
    }

    // 4. Obter URL pública do ficheiro
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('assets')
      .getPublicUrl(fileNameOnStorage);

    // 5. Enviar via WhatsAppService.sendMediaByUrl
    console.log(`[LIVECHAT-FILE] Enviando ficheiro "${file.originalname}" para ${phone} via Meta API...`);
    const sentId = await WhatsAppService.sendMediaByUrl(
      phone,
      publicUrl,
      file.mimetype,
      file.originalname,
      config.phone_number_id,
      config.access_token
    );

    if (sentId) botSentMessages.add(sentId);

    const agentName = req.user?.name || req.user?.email?.split('@')[0] || 'Agente';

    const fileMsgText = `[Ficheiro: ${file.originalname}](${publicUrl})`;
    const metadata = {
      agentName,
      mediaUrl: publicUrl,
      fileName: file.originalname,
      mimeType: file.mimetype,
      clientMsgId: clientMsgId || undefined
    };

    // 6. Persistir o ficheiro no histórico
    await supabaseAdmin.from('conversation_history').insert({
      org_id: orgId,
      customer_phone: phone,
      sender: 'human',
      text: fileMsgText,
      metadata
    });

    // 7. Emitir evento Socket do Ficheiro
    try {
      getIo().to(`org:${orgId}`).emit('new_message', {
        phone:     phone,
        sender:    'human',
        text:      fileMsgText,
        time:      new Date().toLocaleTimeString('pt-PT', { timeZone: 'Africa/Luanda', hour: '2-digit', minute: '2-digit' }),
        timestamp: new Date().toISOString(),
        platform:  'whatsapp',
        agentName: agentName,
        metadata
      });
    } catch (_) { /* silencioso */ }

    // 8. Se houver legenda, enviar legenda também
    if (message && message.trim()) {
      const captionSentId = await WhatsAppService.sendTextMessage(
        config.phone_number_id,
        phone,
        message.trim(),
        config.access_token
      );
      if (captionSentId) botSentMessages.add(captionSentId);

      await supabaseAdmin.from('conversation_history').insert({
        org_id: orgId,
        customer_phone: phone,
        sender: 'human',
        text: message.trim(),
        metadata: { agentName }
      });

      try {
        getIo().to(`org:${orgId}`).emit('new_message', {
          phone:     phone,
          sender:    'human',
          text:      message.trim(),
          time:      new Date().toLocaleTimeString('pt-PT', { timeZone: 'Africa/Luanda', hour: '2-digit', minute: '2-digit' }),
          timestamp: new Date().toISOString(),
          platform:  'whatsapp',
          agentName: agentName
        });
      } catch (_) { /* silencioso */ }
    }

    res.json({ 
      message: 'Ficheiro enviado com sucesso.', 
      id: sentId,
      fileUrl: publicUrl,
      fileName: file.originalname
    });

  } catch (err: any) {
    console.error('[LIVECHAT-FILE] Erro inesperado:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/config', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const {
      phone_number_id,
      waba_id,
      access_token,
      display_name,
      phone,
    } = req.body;

    if (!phone_number_id || !access_token) {
      return res.status(400).json({ error: 'phone_number_id e access_token são obrigatórios.' });
    }

    try {
      // Validar credenciais na Meta
      const metaUrl = `https://graph.facebook.com/v19.0/${phone_number_id}?fields=display_phone_number,verified_name,quality_rating&access_token=${access_token}`;
      const metaResponse = await axios.get(metaUrl);

      const verifiedName  = display_name || metaResponse.data?.verified_name || null;
      const displayPhone  = metaResponse.data?.display_phone_number || phone || null;

      console.log(`[WHATSAPP] Credenciais válidas para: ${verifiedName} (${displayPhone})`);

      const descriptionPayload = JSON.stringify({
        phone: displayPhone || '',
        verified_name: verifiedName || '',
        business_category: req.body.business_category || '',
        website: req.body.website || '',
        support_email: req.body.support_email || '',
        app_id: req.body.app_id || '',
        client_secret: req.body.client_secret || '',
        about: req.body.description || '',
        updated_at: new Date().toISOString()
      });

      const { data, error } = await supabaseAdmin
        .from('whatsapp_config')
        .upsert({
          org_id: orgId,
          phone_number_id,
          waba_id: waba_id || null,
          access_token,
          display_name: verifiedName,
          description: descriptionPayload,
          is_active: true,
        }, { onConflict: 'org_id' })
        .select()
        .single();

      if (error) throw error;

      return res.json({
        message: `WhatsApp Conectado! Número verificado: ${verifiedName || displayPhone || 'Sucesso'}`,
        data: {
          ...data,
          phone: displayPhone || '',
          business_category: req.body.business_category || '',
          website: req.body.website || '',
          support_email: req.body.support_email || '',
          app_id: req.body.app_id || '',
          client_secret: req.body.client_secret || '',
          description: req.body.description || '',
        }
      });

    } catch (metaError: any) {
      const msg  = metaError.response?.data?.error?.message || metaError.message;
      const code = metaError.response?.data?.error?.code;

      console.error(`[WHATSAPP] Meta rejeitou credenciais. Código: ${code}. Msg: ${msg}`);
      return res.status(400).json({ error: 'Credenciais inválidas rejeitadas pela Meta', details: msg, code });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/whatsapp/embedded-signup/complete ─────────────────────────────
router.post('/embedded-signup/complete', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const {
      code,
      access_token,
      waba_id,
      phone_number_id,
      app_id,
      client_secret,
      display_name,
    } = req.body || {};

    const metaAppId = (process.env.META_APP_ID || app_id || '').toString().trim();
    const metaAppSecret = (process.env.META_APP_SECRET || client_secret || '').toString().trim();

    let accessToken = (access_token || '').toString().trim();
    if (!accessToken && code) {
      if (!metaAppId || !metaAppSecret) {
        return res.status(400).json({
          error: 'META_APP_ID e META_APP_SECRET são obrigatórios para concluir a conexão automática com a Meta.',
        });
      }

      const tokenRes = await axios.get(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`, {
        params: {
          client_id: metaAppId,
          client_secret: metaAppSecret,
          code,
        },
      });
      accessToken = tokenRes.data?.access_token || '';
    }

    if (!accessToken) {
      return res.status(400).json({ error: 'A Meta não retornou token de acesso para concluir a conexão.' });
    }

    let resolvedWabaId = (waba_id || '').toString().trim();
    let resolvedPhoneNumberId = (phone_number_id || '').toString().trim();
    let phoneInfo: any = null;

    if (resolvedPhoneNumberId) {
      const phoneRes = await axios.get(`https://graph.facebook.com/${META_GRAPH_VERSION}/${resolvedPhoneNumberId}`, {
        params: {
          fields: 'display_phone_number,verified_name,quality_rating',
          access_token: accessToken,
        },
      });
      phoneInfo = phoneRes.data;
    }

    if (resolvedWabaId && !resolvedPhoneNumberId) {
      const numbersRes = await axios.get(`https://graph.facebook.com/${META_GRAPH_VERSION}/${resolvedWabaId}/phone_numbers`, {
        params: {
          fields: 'id,display_phone_number,verified_name,quality_rating',
          access_token: accessToken,
        },
      });
      const firstNumber = numbersRes.data?.data?.[0];
      if (firstNumber?.id) {
        resolvedPhoneNumberId = firstNumber.id;
        phoneInfo = firstNumber;
      }
    }

    if (!resolvedPhoneNumberId) {
      return res.status(400).json({
        error: 'A Meta autorizou a aplicação, mas não devolveu Phone Number ID. Confirme se o fluxo Embedded Signup terminou até ao fim.',
      });
    }

    const webhookSubscription = resolvedWabaId
      ? await subscribeWhatsAppWebhooks({
          req,
          wabaId: resolvedWabaId,
          accessToken,
          appId: metaAppId,
          appSecret: metaAppSecret,
        })
      : null;

    const verifiedName = display_name || phoneInfo?.verified_name || 'WhatsApp Business';
    const displayPhone = phoneInfo?.display_phone_number || '';
    const descriptionPayload = JSON.stringify({
      phone: displayPhone,
      verified_name: verifiedName,
      app_id: metaAppId,
      connection_source: 'embedded_signup',
      updated_at: new Date().toISOString(),
    });

    const { data, error } = await supabaseAdmin
      .from('whatsapp_config')
      .upsert({
        org_id: orgId,
        phone_number_id: resolvedPhoneNumberId,
        waba_id: resolvedWabaId || null,
        access_token: accessToken,
        display_name: verifiedName,
        description: descriptionPayload,
        is_active: true,
      }, { onConflict: 'org_id' })
      .select()
      .single();

    if (error) throw error;

    return res.json({
      success: true,
      message: `WhatsApp conectado com a Meta: ${verifiedName || displayPhone || resolvedPhoneNumberId}`,
      data: {
        ...data,
        phone: displayPhone,
        app_id: metaAppId,
        webhook_subscription: webhookSubscription,
      },
    });
  } catch (err: any) {
    const metaError = err.response?.data?.error || err.response?.data;
    console.error('[WHATSAPP EMBEDDED] Erro:', metaError || err.message);
    return res.status(500).json({
      error: metaError?.message || err.message || 'Erro ao concluir conexão automática com a Meta.',
      code: metaError?.code,
      details: metaError,
    });
  }
});

// ─── POST /api/whatsapp/webhook-sync ─────────────────────────────────────────
router.post('/webhook-sync', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const { data: config, error } = await supabaseAdmin
      .from('whatsapp_config')
      .select('waba_id, access_token')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;
    if (!config?.waba_id || !config?.access_token) {
      return res.status(400).json({ error: 'Configuração WhatsApp incompleta: WABA ID ou token ausente.' });
    }

    const subscription = await subscribeWhatsAppWebhooks({
      req,
      wabaId: config.waba_id,
      accessToken: config.access_token,
    });

    const { data: subscriptions } = await axios.get(`https://graph.facebook.com/${META_GRAPH_VERSION}/${config.waba_id}/subscribed_apps`, {
      params: { access_token: config.access_token },
    });

    return res.json({
      success: true,
      message: 'Webhooks sincronizados com a Meta.',
      subscription,
      subscriptions,
    });
  } catch (err: any) {
    const metaError = err.response?.data?.error || err.response?.data;
    console.error('[WHATSAPP WEBHOOKS] Erro ao sincronizar:', metaError || err.message);
    return res.status(500).json({
      error: metaError?.message || err.message || 'Erro ao sincronizar webhooks com a Meta.',
      details: metaError,
    });
  }
});

// ─── DELETE /config — Desconectar número WhatsApp ─────────────────────────────
router.delete('/config', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;

    const { error } = await supabaseAdmin
      .from('whatsapp_config')
      .update({ is_active: false, access_token: null })
      .eq('org_id', orgId);

    if (error) throw error;

    console.log(`[WHATSAPP] Número desconectado para org ${orgId}`);
    res.json({ success: true, message: 'Número desconectado com sucesso.' });
  } catch (err: any) {
    console.error('[WHATSAPP] Erro ao desconectar:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// ─── Helper: Deteção de Nome do Cliente em Mensagens de Texto ─────────────────
function extractCustomerNameFromText(text: string): string | null {
  if (!text) return null;
  const patterns = [
    /(?:o meu nome é|meu nome é|o meu nome e|meu nome e|me chamo|chamo-me|me chamo de|chamo me|eu me chamo|pode me chamar de|pode chamar-me de|chame-me de|trate-me por|sou o|sou a|eu sou o|eu sou a|aqui é o|aqui é a|aqui é|aqui fala o|aqui fala a|aqui quem fala é o|aqui quem fala é a|fala o|fala a|fala com o|fala com a)\s+([A-ZÀ-Úa-zà-ú]{2,}(?:\s+[A-ZÀ-Úa-zà-ú]{2,})?)/i,
    /^(?:olá|ola|bom dia|boa tarde|boa noite|oi|hey|saudações)[,!\s]+(?:sou\s+(?:o|a)\s+|me\s+chamo\s+|eu\s+sou\s+(?:o|a)\s+|aqui\s+é\s+(?:o|a)\s+)?([A-ZÀ-Úa-zà-ú]{2,}(?:\s+[A-ZÀ-Úa-zà-ú]{2,})?)$/i,
    /(?:o meu contacto é|o meu nome:\s*|meu nome:\s*|nome:\s*|cliente:\s*)([A-ZÀ-Úa-zà-ú]{2,}(?:\s+[A-ZÀ-Úa-zà-ú]{2,})?)/i,
    /(?:pode tratar-me por|trata-me por|trate-me por)\s+([A-ZÀ-Úa-zà-ú]{2,})/i
  ];
  for (const pat of patterns) {
    const match = text.match(pat);
    if (match && match[1]) {
      const candidate = match[1].trim();
      const lower = candidate.toLowerCase();
      if (!/^(cliente|amigo|amiga|senhor|senhora|doutor|doutora|você|voce|sim|não|nao|orion|assistente|ajuda|atendente|humano|favor|tarde|noite|dia|hoje|amanhã|ola|olá|bom|boa|obrigado|obrigada|preço|valor|serviço)$/i.test(lower)) {
        return candidate.charAt(0).toUpperCase() + candidate.slice(1);
      }
    }
  }
  return null;
}

async function findWhatsappConfigForWebhook(phoneNumberId?: string, wabaId?: string) {
  const selectFields = 'org_id, access_token, display_name, phone_number_id, waba_id';

  if (phoneNumberId) {
    const { data, error } = await supabaseAdmin
      .from('whatsapp_config')
      .select(selectFields)
      .eq('phone_number_id', phoneNumberId)
      .eq('is_active', true)
      .maybeSingle();
    if (error) {
      console.error('[WEBHOOK] Erro DB ao procurar por phone_number_id:', error.message);
    }
    if (data) return data;
  }

  if (wabaId) {
    const { data, error } = await supabaseAdmin
      .from('whatsapp_config')
      .select(selectFields)
      .eq('waba_id', wabaId)
      .eq('is_active', true)
      .maybeSingle();
    if (error) {
      console.error('[WEBHOOK] Erro DB ao procurar por waba_id:', error.message);
    }
    if (data) return data;
  }

  const { data: activeConfigs, error } = await supabaseAdmin
    .from('whatsapp_config')
    .select(selectFields)
    .eq('is_active', true);
  if (error) {
    console.error('[WEBHOOK] Erro DB ao procurar configurações ativas:', error.message);
    return null;
  }

  if (activeConfigs?.length === 1) {
    console.warn(`[WEBHOOK] Fallback: usando única config ativa (phone_id=${activeConfigs[0].phone_number_id}, waba_id=${activeConfigs[0].waba_id}). Recebido phone_id=${phoneNumberId || 'n/a'}, waba_id=${wabaId || 'n/a'}`);
    return activeConfigs[0];
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Função principal de resposta da IA
// ─────────────────────────────────────────────────────────────────────────────
async function triggerAIResponse(params: {
  orgId: string;
  fromNumber: string;
  phoneNumberId: string;
  accessToken: string;
  botName: string;
  message: string;
  incomingMessageId: string;
  senderName?: string;
  media?: { base64: string; mimeType: string };
  referral?: any;
  isAudio?: boolean;
  isVoiceAllowed?: boolean;
  detectedLanguage?: string;
}) {
  const {
    orgId, fromNumber, phoneNumberId, accessToken, botName,
    message, incomingMessageId, senderName, media, referral, isAudio, isVoiceAllowed,
    detectedLanguage = 'pt',
  } = params;

  // Verificar se o atendimento por IA está pausado para este cliente (humano no controlo)
  const historyKey = `${orgId}:${fromNumber}`;
  const pausedUntil = aiPauses.get(historyKey);
  if (pausedUntil && Date.now() < pausedUntil) {
    console.log(`[IA] Pausada para ${fromNumber}. Mensagem recebida mas não respondida (humano no controlo).`);
    return;
  }

  let customerProfile: CustomerProfile | undefined;

  try {
    // Indicador de "digitando..."
    try {
      await WhatsAppService.sendTypingIndicator(phoneNumberId, incomingMessageId, accessToken);
    } catch (_) { /* silencioso */ }

    // Buscar histórico completo recente (últimas 60 mensagens)
    const { data: dbHistory } = await supabaseAdmin
      .from('conversation_history')
      .select('sender, text, created_at')
      .eq('org_id', orgId)
      .eq('customer_phone', fromNumber)
      .order('created_at', { ascending: false })
      .limit(60);

    let timeSinceLastMessageHours = 0;
    if (dbHistory && dbHistory.length > 1) {
      // dbHistory[0] é a mensagem recém-inserida. dbHistory[1] é a anterior.
      const currentMsgTime = new Date(dbHistory[0].created_at).getTime();
      const prevMsgTime = new Date(dbHistory[1].created_at).getTime();
      timeSinceLastMessageHours = (currentMsgTime - prevMsgTime) / (1000 * 60 * 60);
    }

    // dbHistory[0] é a mensagem atual que acabámos de persistir no banco antes de chamar a IA.
    // Excluímo-la para passar à IA apenas o histórico anterior real.
    const pastDbHistory = dbHistory ? dbHistory.slice(1) : [];
    const history = pastDbHistory.reverse().map(h => ({ sender: h.sender, text: h.text }));

    // ── Carregar perfil do cliente (memória permanente de nome e contexto) ───────
    try {
      // 1. Buscar dados do contacto já capturados (nome, email)
      const { data: existingContact } = await supabaseAdmin
        .from('contacts')
        .select('name, email, phone')
        .eq('org_id', orgId)
        .eq('phone', fromNumber)
        .maybeSingle();

      let detectedName = existingContact?.name;

      // Descartar nomes inválidos que sejam apenas números ou termos genéricos
      if (detectedName && (detectedName.startsWith('+') || /^\d+$/.test(detectedName) || /^(cliente|desconhecido|amigo)$/i.test(detectedName))) {
        detectedName = undefined;
      }

      // 2. Se ainda não há nome no contacto, tentar usar o nome do perfil do WhatsApp
      if (!detectedName && senderName && senderName.trim().length > 1) {
        const cleanSender = senderName.trim();
        if (!cleanSender.startsWith('+') && !/^\d+$/.test(cleanSender)) {
          detectedName = cleanSender;
          // AWAIT para garantir que o nome fica guardado antes de prosseguir
          try {
            await supabaseAdmin.from('contacts').upsert({
              org_id: orgId,
              phone: fromNumber,
              name: cleanSender,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'org_id,phone' });
            console.log(`[MEMÓRIA] ✅ Nome "${cleanSender}" do perfil WhatsApp guardado para ${fromNumber}`);
          } catch (e: any) {
            console.warn('[MEMÓRIA] Aviso ao guardar nome WhatsApp:', e.message);
          }
        }
      }

      // 3. Se ainda não há nome, tentar recuperar de tokens [CONTATO:{...}] gravados pelo bot no histórico
      if (!detectedName) {
        for (const h of pastDbHistory) {
          if (h.sender === 'bot' && h.text) {
            const contactMatch = h.text.match(/\[CONTATO:(\{[^}]+\})\]/);
            if (contactMatch) {
              try {
                const parsed = JSON.parse(contactMatch[1]);
                if (parsed.name && parsed.name.trim().length > 1) {
                  detectedName = parsed.name.trim();
                  console.log(`[MEMÓRIA] 🔍 Nome "${detectedName}" recuperado de token [CONTATO] no histórico`);
                  break;
                }
              } catch (_) {}
            }
          }
        }
      }

      // 4. Se ainda não há nome, tentar extrair da mensagem atual ou do histórico de texto
      if (!detectedName) {
        const fullConversationText = [message, ...pastDbHistory.map(h => h.text)].join('\n');
        const extracted = extractCustomerNameFromText(fullConversationText);
        if (extracted) {
          detectedName = extracted;
          // Guardar na tabela contacts para nunca mais esquecer
          try {
            await supabaseAdmin.from('contacts').upsert({
              org_id: orgId,
              phone: fromNumber,
              name: extracted,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'org_id,phone' });
            console.log(`[MEMÓRIA] ✅ Nome "${extracted}" guardado permanentemente para ${fromNumber}`);
          } catch (e: any) {
            console.warn('[MEMÓRIA] Aviso ao guardar nome extraído:', e.message);
          }
        }
      }

      const isReturning = (dbHistory && dbHistory.length > 2) || (timeSinceLastMessageHours > 2);

      customerProfile = {
        name:        detectedName || undefined,
        email:       existingContact?.email || undefined,
        phone:       fromNumber,
        isReturning,
      };
      console.log(`[MEMÓRIA] Cliente ${fromNumber}: nome="${customerProfile.name || 'desconhecido'}", recorrente=${isReturning}, inativo_horas=${timeSinceLastMessageHours.toFixed(1)}`);
    } catch (memErr: any) {
      console.warn('[MEMÓRIA] Erro ao carregar perfil do cliente (não crítico):', memErr.message);
    }

    let sendSuccess = false;
    let lastErrorMsg = '';
    let aiResult: any = null;
    let ptReplyText = '';
    let replyText = '';
    let sentMsgId: string | null = null;

    // ── PROTOCOLO DE SEGURANÇA E AUTO-CURA DA IA (Até 3 tentativas de recuperação) ──
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[PROTOCOLO SEGURANÇA IA] 🛡️ Tentativa ${attempt}/3 de auto-cura para ${fromNumber}...`);
        if (attempt > 1) {
          // Pausa adaptativa antes de retentar
          await new Promise(r => setTimeout(r, attempt * 1000));
        }

        // Gerar resposta com IA (Gemini para visão/áudio/documentos + DeepSeek para resposta textual)
        aiResult = await AIService.generateResponse({
          message,
          orgId,
          history,
          botName,
          mode: 'simulation',
          media: attempt === 1 ? media : undefined, // se falhou com media na 1ª tentativa, foca no texto
          referral,
          timeSinceLastMessageHours,
          customerProfile,
        });

        if (!aiResult?.reply) {
          throw new Error('Resposta da IA vazia.');
        }

        replyText = aiResult.reply;
        ptReplyText = replyText;

        // Tradução silenciosa para PT para manter o painel/histórico em português
        if (detectedLanguage !== 'pt' && detectedLanguage !== 'por') {
          console.log(`[IA] Traduzindo silenciosamente a resposta de ${detectedLanguage} para PT...`);
          ptReplyText = await AIService.translateText(replyText, 'português');
        }

        // ── Processar envio de arquivos [SEND_FILE: ID] ───────────────────────
        const fileMatches = [...replyText.matchAll(/\[SEND_FILE:\s*([a-f0-9-]{36})\]/gi)];
        if (fileMatches.length > 0) {
          console.log(`[IA] ${fileMatches.length} comando(s) de envio de arquivo detectado(s).`);
          
          replyText = replyText.replace(/\[SEND_FILE:\s*[a-f0-9-]{36}\]/gi, '').trim();
          ptReplyText = ptReplyText.replace(/\[SEND_FILE:\s*[a-f0-9-]{36}\]/gi, '').trim();

          for (const match of fileMatches) {
            const assetId = match[1];
            const { data: asset } = await supabaseAdmin
              .from('public_assets')
              .select('*')
              .eq('id', assetId)
              .eq('org_id', orgId)
              .single();

            if (asset) {
              console.log(`[IA] Enviando arquivo "${asset.filename}" para ${fromNumber}...`);
              const sentMediaId = await WhatsAppService.sendMediaByUrl(
                fromNumber, 
                asset.file_url, 
                asset.mime_type, 
                asset.filename, 
                phoneNumberId, 
                accessToken
              );
              if (sentMediaId) botSentMessages.add(sentMediaId);

              const fileMsgText = `[Ficheiro: ${asset.filename}](${asset.file_url})`;
              await supabaseAdmin.from('conversation_history').insert({
                org_id: orgId,
                customer_phone: fromNumber,
                sender: 'bot',
                text: fileMsgText,
                metadata: {
                  botName,
                  mediaUrl: asset.file_url,
                  fileName: asset.filename,
                  mimeType: asset.mime_type
                }
              });

              try {
                getIo().to(`org:${orgId}`).emit('new_message', {
                  phone:     fromNumber,
                  sender:    'bot',
                  text:      fileMsgText,
                  botName:   botName,
                  time:      new Date().toLocaleTimeString('pt-PT', { timeZone: 'Africa/Luanda', hour: '2-digit', minute: '2-digit' }),
                  timestamp: new Date().toISOString(),
                  platform:  'whatsapp',
                  metadata:  {
                    mediaUrl: asset.file_url,
                    fileName: asset.filename,
                    mimeType: asset.mime_type
                  }
                });
              } catch (_) {}
            }
          }
        }

        // ── Enviar Mensagem via WhatsApp ────────────────────────────────────
        sentMsgId = null;

        // Se for áudio e a voz estiver autorizada, tentar TTS
        if (isAudio && isVoiceAllowed && attempt === 1) {
          try {
            const audioPath = await AudioService.textToSpeech(replyText);
            if (audioPath && fs.existsSync(audioPath)) {
              const mediaId = await WhatsAppService.uploadMedia(audioPath, phoneNumberId, accessToken);
              if (mediaId) {
                sentMsgId = await WhatsAppService.sendAudio(fromNumber, mediaId, phoneNumberId, accessToken);
              }
              fs.unlinkSync(audioPath);
            }
          } catch (audioErr: any) {
            console.warn('[IA] Falha no TTS de áudio, tentando envio em texto:', audioErr.message);
          }
        }

        // Fallback: texto
        if (!sentMsgId && replyText) {
          sentMsgId = await WhatsAppService.sendTextMessage(phoneNumberId, fromNumber, replyText, accessToken);
        }

        if (sentMsgId) {
          botSentMessages.add(sentMsgId);
          sendSuccess = true;
          console.log(`[PROTOCOLO SEGURANÇA IA] ✅ Mensagem entregue com sucesso para ${fromNumber} na tentativa ${attempt}! ID: ${sentMsgId}`);
          break; // Sai do loop de retentativas
        } else {
          throw new Error('Meta API não retornou ID de mensagem entregue.');
        }

      } catch (attemptErr: any) {
        lastErrorMsg = attemptErr.message || String(attemptErr);
        console.warn(`[PROTOCOLO SEGURANÇA IA] ⚠️ Tentativa ${attempt}/3 falhou para ${fromNumber}: ${lastErrorMsg}`);
      }
    }

    if (!sendSuccess) {
      throw new Error(`Falha persistente no envio após 3 tentativas de auto-cura: ${lastErrorMsg}`);
    }

    // ── Sucesso na Auto-Cura: Emitir resolução para limpar estados de erro no painel ──
    try {
      getIo().to(`org:${orgId}`).emit('chat_resolved', {
        phone: fromNumber,
        platform: 'whatsapp',
      });
    } catch (_) {}

    // Se a IA detectou um novo nome nos dados de contacto ou booking, gravar permanentemente
    const newDetectedName = aiResult?.contactData?.name || aiResult?.bookingData?.name;
    if (newDetectedName && newDetectedName.trim().length > 1 && (!customerProfile?.name || customerProfile.name !== newDetectedName)) {
      Promise.resolve(
        supabaseAdmin.from('contacts').upsert({
          org_id: orgId,
          phone: fromNumber,
          name: newDetectedName.trim(),
          email: aiResult.contactData?.email || aiResult.bookingData?.email || customerProfile?.email,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'org_id,phone' })
      ).catch(() => {});
    }

    // ── Disparar notificações de Booking, Handover, Proposal ou Confirmation ──
    if (aiResult?.transfer || aiResult?.booking || aiResult?.proposal || aiResult?.confirm) {
      const alertType = aiResult.transfer 
        ? 'handover' 
        : aiResult.booking 
        ? 'booking' 
        : aiResult.proposal 
        ? 'proposal' 
        : 'confirmation';
        
      const alertTitle = aiResult.transfer 
        ? '🚨 Pedido de Atendimento Humano' 
        : aiResult.booking
        ? '📅 Novo Pedido de Agendamento'
        : aiResult.proposal
        ? '📎 Proposta Comercial Recebida'
        : '⚠️ Dúvida Sem Resposta - Confirmar Informações';

      const alertBody  = aiResult.transfer
        ? `O cliente ${fromNumber} quer falar com um assistente.`
        : aiResult.booking
        ? `O cliente ${fromNumber} solicitou um agendamento.`
        : aiResult.proposal
        ? `O cliente ${fromNumber} enviou uma proposta comercial.`
        : `O cliente ${fromNumber} fez uma pergunta fora da base de dados.`;
      
      EmailService.sendAlertNotification(orgId, alertType, fromNumber, 'Cliente', message).catch(e => console.error('[ALERTA] Erro ao enviar email:', e.message));
      
      PushService.sendAlertToOrg(orgId, {
        title: alertTitle,
        body:  alertBody,
        type:  alertType,
        url:   '/dashboard/live-chat',
      }).catch(e => console.error('[ALERTA] Erro ao enviar push:', e.message));

      try {
        const socketEvent = alertType === 'handover' 
          ? 'handover_alert' 
          : alertType === 'booking' 
          ? 'booking_alert' 
          : alertType === 'proposal' 
          ? 'proposal_alert' 
          : 'confirmation_alert';
        getIo().to(`org:${orgId}`).emit(socketEvent, {
          phone: fromNumber,
          message: message,
          type: alertType,
          platform: 'whatsapp'
        });
      } catch (_) { /* silencioso */ }

      if (aiResult.transfer || aiResult.confirm) {
        aiPauses.set(historyKey, Date.now() + 24 * 60 * 60 * 1000);
        console.log(`[IA] Handover/Confirmação detectado. IA pausada automaticamente por 24h para ${fromNumber}`);
      }
    }

    // ── Automação Pós-Confirmação de Agendamento (BookingService: Google Calendar + Deduplicação + Alertas 4 Etapas) ──
    if (aiResult?.bookingData) {
      const bData = aiResult.bookingData;
      const isReschedule = Boolean(aiResult.noShowReschedule);
      console.log(`[BOOKING-AUTO] 📅 ${isReschedule ? 'Remarcação' : 'Agendamento'} detectado via WhatsApp para ${bData.name} (${bData.date} às ${bData.time})`);

      const customerPhone = (bData.phone && bData.phone.replace(/[^\d+]/g, '').length >= 8) 
        ? bData.phone.replace(/[^\d+]/g, '') 
        : fromNumber;

      const bookingPromise = isReschedule
        ? BookingService.rescheduleBooking(orgId, {
            name: bData.name,
            subject: bData.subject,
            phone: customerPhone,
            email: bData.email,
            date: bData.date,
            time: bData.time,
          }, { channelOrigin: 'WhatsApp Chatbot' })
        : BookingService.processBooking(orgId, {
            name: bData.name,
            subject: bData.subject,
            phone: customerPhone,
            email: bData.email,
            date: bData.date,
            time: bData.time,
          }, { channelOrigin: 'WhatsApp Chatbot' });

      bookingPromise
        .then(res => {
          if (res.success) {
            console.log(`[BOOKING-AUTO] ✅ ${isReschedule ? 'Remarcação' : 'Agendamento'} processado! Lembretes programados: ${res.alertsScheduled}`);
          } else {
            console.warn(`[BOOKING-AUTO] ⚠️ ${isReschedule ? 'Remarcação' : 'Agendamento'} não concluído: ${res.error}`);
          }
        })
        .catch(err => console.error('[BOOKING-AUTO] ❌ Erro ao processar agendamento:', err.message));

      try {
        await supabaseAdmin.from('contacts').upsert({
          org_id: orgId,
          name: bData.name,
          email: bData.email || undefined,
          phone: customerPhone,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'org_id,phone' });
      } catch (cErr: any) {
        console.warn('[BOOKING-AUTO] Aviso ao atualizar contacto:', cErr.message);
      }
    }

    // Montar metadados da mensagem persistida
    const botMetadata: any = {};
    if (aiResult?.confirm) botMetadata.confirm = true;
    if (aiResult?.booking || aiResult?.bookingData) botMetadata.booking = true;
    if (aiResult?.attended) botMetadata.attended = true;
    if (aiResult?.noShowReschedule) {
      botMetadata.no_show_reschedule = true;
      botMetadata.booking = true;
    }

    // Persistir resposta no histórico em PORTUGUÊS
    await supabaseAdmin.from('conversation_history').insert({
      org_id: orgId,
      customer_phone: fromNumber,
      sender: 'bot',
      text: ptReplyText,
      metadata: Object.keys(botMetadata).length > 0 ? botMetadata : undefined,
    });

    // Emitir resposta da IA para o Live Chat em tempo real em PORTUGUÊS
    try {
      getIo().to(`org:${orgId}`).emit('new_message', {
        phone:     fromNumber,
        sender:    'bot',
        text:      ptReplyText,
        botName:   botName,
        time:      new Date().toLocaleTimeString('pt-PT', { timeZone: 'Africa/Luanda', hour: '2-digit', minute: '2-digit' }),
        timestamp: new Date().toISOString(),
        platform:  'whatsapp',
        metadata:  Object.keys(botMetadata).length > 0 ? botMetadata : undefined,
      });
    } catch (_) { /* silencioso */ }

    // ── Persistir dados de contacto capturados pela IA na tabela `contacts` ─────
    if (aiResult?.contactData && (aiResult.contactData.name || aiResult.contactData.email)) {
      try {
        const cd = aiResult.contactData;
        const updateFields: Record<string, string> = {};
        if (cd.name)  updateFields.name  = cd.name;
        if (cd.email) updateFields.email = cd.email;

        const { data: existingForUpsert } = await supabaseAdmin
          .from('contacts')
          .select('id, name, email')
          .eq('org_id', orgId)
          .eq('phone', fromNumber)
          .maybeSingle();

        if (existingForUpsert) {
          const patch: Record<string, string> = {};
          if (cd.name  && !existingForUpsert.name)  patch.name  = cd.name;
          if (cd.email && !existingForUpsert.email) patch.email = cd.email;
          if (Object.keys(patch).length > 0) {
            await supabaseAdmin.from('contacts').update(patch).eq('id', existingForUpsert.id);
            console.log(`[MEMÓRIA] Contacto ${fromNumber} actualizado:`, patch);
          }
        } else {
          await supabaseAdmin.from('contacts').insert({
            org_id: orgId,
            phone:  fromNumber,
            ...updateFields,
            source: 'whatsapp',
          });
          console.log(`[MEMÓRIA] Novo contacto criado para ${fromNumber}:`, updateFields);
        }
      } catch (contactErr: any) {
        console.warn('[MEMÓRIA] Erro ao persistir dados de contacto (não crítico):', contactErr.message);
      }
    }

    // Sincronizar interação em tempo real com a Folha Google Sheets
    GoogleSheetsService.syncInteraction({
      orgId,
      channel: 'whatsapp',
      phoneOrId: fromNumber,
      name: aiResult?.contactData?.name || customerProfile?.name || 'Cliente WhatsApp',
      email: aiResult?.contactData?.email || '',
      text: message || '[media]',
      subject: aiResult?.bookingData?.subject || '',
      status: 'Ativo',
    }).catch(e => console.warn('[WHATSAPP-SHEETS] Aviso ao sincronizar com Google Sheets:', e.message));

    // Se a IA detectou pedido de transferência, pausar por 30 minutos
    if (aiResult?.transfer) {
      aiPauses.set(historyKey, Date.now() + 30 * 60 * 1000);
      console.log(`[IA] Transferência para humano solicitada para ${fromNumber}. IA pausada por 30 min.`);
    }

    // Ativar protocolo de follow-up para todos os clientes sem agendamento e sem transferência para humano
    if (!aiResult?.transfer && !aiResult?.booking && !aiResult?.bookingData) {
      const clientName = (customerProfile?.name || '').trim().split(/\s+/)[0] || '';

      FollowupService.scheduleSmartFollowup({
        orgId,
        phone:        fromNumber,
        platform:     'whatsapp',
        customerName: clientName,
        botReply:     ptReplyText,
        lastMessageId: sentMsgId || undefined,
      }).catch(err => console.warn('[FOLLOWUP] Aviso ao agendar smart follow-up:', err.message));
    }

  } catch (err: any) {
    console.error(`[PROTOCOLO SEGURANÇA IA] ❌ ERRO PERSISTENTE no fluxo para ${fromNumber}:`, err.message);

    // NÃO enviar mensagem de erro ao cliente — apenas sinalizar o painel internamente.
    // O agente humano verá o chat marcado a vermelho e receberá o email de urgência.
    try {
      // 1. Registar o erro internamente no histórico (visível apenas no painel)
      await supabaseAdmin.from('conversation_history').insert({
        org_id: orgId,
        customer_phone: fromNumber,
        sender: 'bot',
        text: `[ERRO INTERNO — NÃO ENVIADO AO CLIENTE]: ${err.message}`,
        metadata: { internal_error: true, needs_urgent_intervention: true },
      });
    } catch (_) { /* silencioso */ }

    // 2. Emitir evento Socket para marcar o chat a VERMELHO no painel
    try {
      getIo().to(`org:${orgId}`).emit('chat_error', {
        phone: fromNumber,
        error: err.message,
        urgent: true,
        platform: 'whatsapp',
      });
    } catch (_) { /* silencioso */ }

    // 3. Enviar EMAIL DE URGÊNCIA MÁXIMA à empresa para intervenção imediata
    EmailService.sendUrgentInterventionAlert({
      orgId,
      customerPhone: fromNumber,
      customerName: customerProfile?.name || senderName || 'Cliente',
      errorMessage: err.message,
      customerMessage: message,
      platform: 'WhatsApp',
    }).catch(e => console.error('[ALERTA URGENTE] Erro ao enviar email de intervenção:', e.message));
  }
}

// ─── GET /api/whatsapp/webhook — Verificação Meta ─────────────────────────────
router.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'orion_webhook_token';
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[WEBHOOK] Verificado com sucesso pela Meta.');
    res.status(200).send(challenge);
  } else {
    console.warn('[WEBHOOK] Falha na verificação. Token inválido.');
    res.sendStatus(403);
  }
});

// ─── POST /api/whatsapp/webhook — Recepção de mensagens ──────────────────────
router.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Responder 200 à Meta imediatamente

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    const entry    = body.entry?.[0];
    const changes  = entry?.changes?.[0];
    const value    = changes?.value;
    const messages = value?.messages;
    const statuses = value?.statuses;
    const metadata = value?.metadata;
    const entryWabaId = entry?.id;

    // Emissão de atualizações de status de mensagem (sent, delivered, read) via Socket
    if (statuses && statuses.length > 0) {
      const statusObj = statuses[0];
      const recipientPhone = statusObj.recipient_id;
      const status = statusObj.status; // 'sent', 'delivered', 'read'
      if (recipientPhone && status) {
        try {
          const config = await findWhatsappConfigForWebhook(metadata?.phone_number_id, entryWabaId);

          if (config) {
            getIo().to(`org:${config.org_id}`).emit('message_status', {
              phone: recipientPhone,
              messageId: statusObj.id,
              status: status
            });
          }
        } catch (_) {}
      }
    }

    const contacts = value?.contacts;
    const profileName = contacts?.[0]?.profile?.name;

    if (!messages || messages.length === 0) return;

    const incomingMsg = messages[0];
    const messageId   = incomingMsg.id;

    // ── 1. Echo detection — ignorar mensagens enviadas pela nossa IA ──────────
    if (botSentMessages.has(messageId)) {
      console.log(`[WEBHOOK] Echo ignorado: ${messageId}`);
      botSentMessages.delete(messageId);
      return;
    }

    // ── 2. Coexistência — detectar humano a responder por fora (Meta Business Suite) ──
    if (incomingMsg.from === metadata?.display_phone_number || incomingMsg.type === 'echo') {
      const recipientNumber = incomingMsg.to;
      if (recipientNumber) {
        const config = await findWhatsappConfigForWebhook(metadata?.phone_number_id, entryWabaId);

        if (config) {
          const key = `${config.org_id}:${recipientNumber}`;
          aiPauses.set(key, Date.now() + 5 * 60 * 1000); // Pausa 5 minutos
          console.log(`[COEXISTÊNCIA] Humano respondeu para ${recipientNumber}. IA pausada por 5 min.`);

          await supabaseAdmin.from('conversation_history').insert({
            org_id: config.org_id,
            customer_phone: recipientNumber,
            sender: 'human',
            text: incomingMsg.text?.body || '(Mídia enviada por humano)',
          });
        }
      }
      return;
    }

    // ── 3. Dedup — evitar processamento duplicado ─────────────────────────────
    if (processedMessages.has(messageId)) {
      console.log(`[WEBHOOK] Mensagem ${messageId} já processada. Ignorando.`);
      return;
    }
    processedMessages.add(messageId);

    const fromNumber   = incomingMsg.from;
    const phoneNumberId = metadata?.phone_number_id;
    const referral     = incomingMsg.referral;

    console.log(`[WEBHOOK] Nova mensagem de ${fromNumber} (${profileName || 'Sem nome'}) → phone_id ${phoneNumberId || 'n/a'} | waba_id ${entryWabaId || 'n/a'}`);

    // ── 4. Buscar configuração da organização ─────────────────────────────────
    const configData = await findWhatsappConfigForWebhook(phoneNumberId, entryWabaId);

    if (!configData) {
      console.warn(`[WEBHOOK] Nenhuma config activa para phone_number_id=${phoneNumberId || 'n/a'} / waba_id=${entryWabaId || 'n/a'}`);
      return;
    }

    const { org_id: orgId, access_token: accessTokenRaw } = configData;

    // ── 5. Verificar plano (voz disponível em Pro/Enterprise/VIP) ─────────────
    const { data: subData } = await supabaseAdmin
      .from('subscriptions')
      .select('plan')
      .eq('org_id', orgId)
      .maybeSingle();

    const { data: orgData } = await supabaseAdmin
      .from('organizations')
      .select('owner_email, chatbot_name')
      .eq('id', orgId)
      .maybeSingle();

    const botName = orgData?.chatbot_name || configData.display_name || 'Assistente';
    const accessToken = accessTokenRaw?.trim();

    let isVip = false;
    if (orgData?.owner_email) {
      const { data: vipEntry } = await supabaseAdmin
        .from('vips')
        .select('id')
        .eq('email', orgData.owner_email.toLowerCase())
        .maybeSingle();
      if (vipEntry) isVip = true;

      if (!isVip) {
        const vipEmails = (process.env.VIP_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
        if (vipEmails.includes(orgData.owner_email.toLowerCase())) isVip = true;
      }
    }

    const currentPlan   = subData?.plan || 'trial';
    const isVoiceAllowed = true; // Habilitado universalmente conforme os requisitos de IA multimodal

    // ── 6. Extrair conteúdo da mensagem e processar mídias com Gemini Multimodal ──
    let userText = '';
    let media: { base64: string; mimeType: string } | undefined;
    let isAudioMessage = false;
    let detectedLanguage = 'pt'; // Língua detectada no áudio do cliente (default: português)
    // URL pública do ficheiro do cliente (após upload para Supabase Storage)
    let clientMediaUrl: string | null = null;
    let clientFileName: string | null = null;
    let clientMimeType: string | null = null;

    if (incomingMsg.type === 'text') {
      userText = incomingMsg.text?.body || '';

    } else if (incomingMsg.type === 'interactive') {
      const btn = incomingMsg.interactive?.button_reply;
      const list = incomingMsg.interactive?.list_reply;
      userText = btn?.title || list?.title || '';
      console.log(`[WHATSAPP] Resposta interativa de ${fromNumber}: "${userText}" (ID: ${btn?.id || list?.id})`);

    } else if (incomingMsg.type === 'button') {
      userText = incomingMsg.button?.text || '';
      console.log(`[WHATSAPP] Botão rápido clicado por ${fromNumber}: "${userText}"`);

    } else if (['image', 'video', 'audio', 'document'].includes(incomingMsg.type)) {
      const mediaObj = incomingMsg[incomingMsg.type];
      const mediaId  = mediaObj?.id;
      const caption  = mediaObj?.caption || '';
      const filename = mediaObj?.filename || (incomingMsg.type === 'image' ? 'imagem.jpg' : incomingMsg.type === 'video' ? 'video.mp4' : incomingMsg.type === 'audio' ? 'audio.ogg' : 'ficheiro');

      if (mediaId) {
        console.log(`[WEBHOOK] Mídia (${incomingMsg.type}) detectada. A descarregar...`);
        const mediaData = await WhatsAppService.getMedia(mediaId, accessToken);

        if (mediaData) {
          media = mediaData;
          clientMimeType = mediaData.mimeType;
          clientFileName = filename;

          // Iniciar upload para o Supabase Storage em paralelo com o processamento de texto
          const uploadPromise = uploadClientMediaToStorage(orgId, mediaData.base64, mediaData.mimeType, filename);

          if (incomingMsg.type === 'audio') {
            // Transcrição de áudio via Whisper/Gemini — detecta língua automaticamente
            if (isVoiceAllowed) {
              const sttResult = await AudioService.speechToTextFromBase64(mediaData.base64, mediaData.mimeType);
              if (sttResult) {
                userText = `[Mensagem de Áudio]: ${sttResult.text}`;
                detectedLanguage = sttResult.language || 'pt';
                isAudioMessage = true;
                console.log(`[WEBHOOK] Áudio transcrito (língua: ${detectedLanguage}): "${sttResult.text.substring(0, 80)}"`);
                // Instruir a IA a responder na língua do cliente
                if (detectedLanguage !== 'pt' && detectedLanguage !== 'por') {
                  userText += `\n\n[SISTEMA INTERNO — NÃO MENCIONAR AO CLIENTE]: O cliente falou em "${detectedLanguage}". Responda EXCLUSIVAMENTE nessa língua. Não use português na resposta enviada ao cliente.`;
                }
              } else {
                userText = '(Mensagem de áudio recebida)';
              }
            } else {
              userText = '(Áudio recebido)';
            }
          } else if (incomingMsg.type === 'document') {
            // Extracção de texto de documentos via DocumentService e Gemini Multimodal
            let extractedText = await DocumentService.extractTextFromBase64(mediaData.base64, mediaData.mimeType);
            if (!extractedText || extractedText.trim().length === 0) {
              extractedText = await AIService.readDocumentWithGemini(mediaData.base64, mediaData.mimeType);
            }
            if (extractedText) {
              userText = `[Documento "${filename}"]:\n${extractedText.substring(0, 10_000)}`;
            } else {
              userText = `(Documento recebido: ${filename})`;
            }
            if (caption) userText = `${caption}\n\n${userText}`;

          } else if (incomingMsg.type === 'image') {
            // Análise visual de imagem via Gemini Multimodal
            const imgDesc = await AIService.describeImageWithGemini(mediaData.base64, mediaData.mimeType);
            userText = imgDesc
              ? `${caption ? caption + '\n\n' : ''}[Imagem enviada pelo cliente — descrição visual e texto lido]:\n${imgDesc}`
              : (caption || '(Imagem enviada)');

          } else if (incomingMsg.type === 'video') {
            // Análise de vídeo via Gemini Multimodal
            const vidDesc = await AIService.describeVideoWithGemini(mediaData.base64, mediaData.mimeType);
            userText = vidDesc
              ? `${caption ? caption + '\n\n' : ''}[Vídeo enviado]:\n${vidDesc}`
              : (caption || '(Vídeo enviado)');

          } else {
            userText = caption || `(Ficheiro de ${incomingMsg.type} enviado)`;
          }

          // Aguardar o upload com timeout máximo de 8 segundos
          clientMediaUrl = await Promise.race<string | null>([
            uploadPromise,
            new Promise<null>(resolve => setTimeout(() => resolve(null), 8000))
          ]);
        }
      }
    }

    if (!userText && !media && !referral) {
      console.warn(`[WEBHOOK] Mensagem de ${fromNumber} sem conteúdo reconhecido. Ignorando.`);
      return;
    }

    // ── 7. Enriquecer texto e estruturar metadados do cliente ────────────────
    let dbText = userText;
    if (!dbText) {
      if (incomingMsg.type === 'text' || incomingMsg.type === 'referral') {
        dbText = referral ? 'Olá, tenho interesse no anúncio.' : '(Mensagem vazia)';
      } else {
        dbText = `(Mídia: ${incomingMsg.type})`;
      }
    }

    if (referral) {
      const adIdentifier = referral.headline || referral.body || 'Anúncio';
      console.log(`[WEBHOOK] 📣 Cliente vindo de anúncio: "${adIdentifier}" (${referral.source_url || 'Sem link'})`);
    }

    // ── 8. Persistir mensagem do cliente ─────────────────────────────────────
    const clientMetadata: Record<string, any> = {
      platform: 'whatsapp',
      message_id: messageId,
    };
    if (clientMediaUrl) {
      clientMetadata.mediaUrl = clientMediaUrl;
      clientMetadata.fileName = clientFileName || 'ficheiro';
      clientMetadata.mimeType = clientMimeType || 'application/octet-stream';
    }
    if (referral) {
      clientMetadata.referral = referral;
    }

    await supabaseAdmin.from('conversation_history').insert({
      org_id: orgId,
      customer_phone: fromNumber,
      sender: 'user',
      text: dbText,
      metadata: clientMetadata,
    });

    // Cancelar follow-ups pendentes (cliente voltou a responder)
    FollowupService.cancelPendingForPhone(orgId, fromNumber).catch(err =>
      console.warn('[FOLLOWUP] Aviso ao cancelar follow-ups:', err.message)
    );

    // ── 8b. Emitir evento em tempo real para o Live Chat ──────────────────────
    try {
      getIo().to(`org:${orgId}`).emit('new_message', {
        phone:     fromNumber,
        sender:    'user',
        text:      dbText,
        time:      new Date().toLocaleTimeString('pt-PT', { timeZone: 'Africa/Luanda', hour: '2-digit', minute: '2-digit' }),
        timestamp: new Date().toISOString(),
        platform:  'whatsapp',
        metadata:  clientMetadata,
      });
    } catch (_) { /* sem clientes conectados */ }


    // ── 9. Gerar e enviar resposta da IA ─────────────────────────────────────
    // Emitir sinal de digitação para o Live Chat
    try {
      getIo().to(`org:${orgId}`).emit('bot_typing', { phone: fromNumber, typing: true });
    } catch (_) {}

    await triggerAIResponse({
      orgId,
      fromNumber,
      phoneNumberId: phoneNumberId || configData.phone_number_id,
      accessToken,
      botName: botName || 'Assistente',
      message: dbText,
      incomingMessageId: messageId,
      senderName: profileName,
      media,
      referral,
      isAudio: isAudioMessage,
      isVoiceAllowed,
      detectedLanguage,
    });

    // Desativar sinal de digitação
    try {
      getIo().to(`org:${orgId}`).emit('bot_typing', { phone: fromNumber, typing: false });
    } catch (_) {}

  } catch (err: any) {
    console.error('[WEBHOOK] Erro fatal:', err.message);
  }
});

// ─── POST /api/whatsapp/ai-pause — Pausar/Retomar IA manualmente ──────────────
router.post('/ai-pause', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const { phone, pause } = req.body; // pause: true = pausar, false = retomar

    const key = `${orgId}:${phone}`;

    if (pause) {
      aiPauses.set(key, Date.now() + 24 * 60 * 60 * 1000); // 24h
      res.json({ message: 'IA pausada para este contacto.' });
    } else {
      aiPauses.delete(key);
      res.json({ message: 'IA retomada para este contacto.' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/whatsapp/recover-missed — Trigger recovery manually ───────────
router.post('/recover-missed', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    if (!orgId) return res.status(401).json({ error: 'Não autorizado.' });
    
    // Executar de forma assíncrona para não bloquear
    recoverMissedMessages();
    
    res.json({ message: 'Processo de recuperação de mensagens não respondidas iniciado em segundo plano.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  Função de Recuperação de Mensagens Não Respondidas (Sistema de Lead Rescue)
// ─────────────────────────────────────────────────────────────────────────────
export async function recoverMissedMessages() {
  console.log('[RECOVERY] Iniciando verificação de mensagens não respondidas...');
  try {
    const last7days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: errorMessages, error } = await supabaseAdmin
      .from('conversation_history')
      .select('id, org_id, customer_phone, created_at')
      .eq('sender', 'bot')
      .ilike('text', '%Erro do sistema%')
      .gte('created_at', last7days)
      .order('created_at', { ascending: false });

    if (error || !errorMessages || errorMessages.length === 0) {
      console.log('[RECOVERY] Nenhuma mensagem de erro encontrada nos últimos 7 dias.');
      return;
    }

    console.log(`[RECOVERY] Encontradas ${errorMessages.length} mensagens de erro para processar.`);

    const processedChats = new Set<string>();

    for (const errMsg of errorMessages) {
      const chatKey = `${errMsg.org_id}:${errMsg.customer_phone}`;
      if (processedChats.has(chatKey)) {
        await supabaseAdmin.from('conversation_history').delete().eq('id', errMsg.id);
        continue;
      }
      processedChats.add(chatKey);

      console.log(`[RECOVERY] Recuperando chat de ${errMsg.customer_phone} para org ${errMsg.org_id}...`);

      await supabaseAdmin.from('conversation_history').delete().eq('id', errMsg.id);

      const { data: userMsgs } = await supabaseAdmin
        .from('conversation_history')
        .select('text, metadata')
        .eq('org_id', errMsg.org_id)
        .eq('customer_phone', errMsg.customer_phone)
        .eq('sender', 'user')
        .order('created_at', { ascending: false })
        .limit(1);

      if (!userMsgs || userMsgs.length === 0) {
        console.warn(`[RECOVERY] Nenhuma mensagem de utilizador encontrada para ${errMsg.customer_phone}.`);
        continue;
      }

      const lastUserMsg = userMsgs[0];
      
      const { data: config } = await supabaseAdmin
        .from('whatsapp_config')
        .select('phone_number_id, access_token, display_name')
        .eq('org_id', errMsg.org_id)
        .eq('is_active', true)
        .maybeSingle();

      if (!config) {
        console.warn(`[RECOVERY] Configuração ativa do WhatsApp não encontrada para a org ${errMsg.org_id}.`);
        continue;
      }

      const { phone_number_id: phoneNumberId, access_token: accessToken, display_name: displayName } = config;

      const { data: orgData } = await supabaseAdmin
        .from('organizations')
        .select('chatbot_name')
        .eq('id', errMsg.org_id)
        .maybeSingle();

      const botName = orgData?.chatbot_name || displayName || 'Assistente';

      console.log(`[RECOVERY] Disparando IA para responder a ${errMsg.customer_phone} com texto: "${lastUserMsg.text.substring(0, 50)}..."`);
      
      await triggerAIResponse({
        orgId: errMsg.org_id,
        fromNumber: errMsg.customer_phone,
        phoneNumberId,
        accessToken,
        botName,
        message: lastUserMsg.text,
        incomingMessageId: lastUserMsg.metadata?.message_id || `recovered_${Date.now()}`,
        media: undefined,
        referral: lastUserMsg.metadata?.referral || undefined,
        isAudio: false,
        isVoiceAllowed: false
      });
    }

    console.log('[RECOVERY] Processo de recuperação concluído com sucesso.');
  } catch (err: any) {
    console.error('[RECOVERY] Erro crítico no processo de recuperação:', err.message);
  }
}

// ─── GET /api/whatsapp/test-keys — Diagnosticar online todas as chaves Gemini ─
router.get('/test-keys', async (req, res) => {
  try {
    const keys = getUniqueApiKeys();
    const results: any[] = [];

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const masked = key.substring(0, 8) + '...' + key.substring(key.length - 4);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
      
      try {
        const response = await axios.post(url, {
          contents: [{ parts: [{ text: 'Ping' }] }]
        }, { timeout: 15000 });

        const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        results.push({
          index: i + 1,
          key: masked,
          status: 'SUCESSO',
          reply: text?.trim()
        });
      } catch (err: any) {
        const errData = err.response?.data;
        results.push({
          index: i + 1,
          key: masked,
          status: 'FALHOU',
          error: errData?.error?.message || err.message,
          fullError: errData
        });
      }
    }

    res.json({
      timestamp: new Date().toISOString(),
      total_keys: keys.length,
      results
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/whatsapp/recover-force — Trigger recovery manually via GET ──────
router.get('/recover-force', async (req, res) => {
  try {
    console.log('[RECOVERY-GET] Disparando recuperação forçada via GET...');
    await recoverMissedMessages();
    res.send('<h1>Processo de recuperação de leads iniciado com sucesso!</h1><p>Os erros foram limpos e as mensagens foram respondidas. Verifique os logs e o Live Chat para confirmar.</p>');
  } catch (err: any) {
    res.status(500).send(`Erro na recuperação: ${err.message}`);
  }
});

export default router;
