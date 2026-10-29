import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import { AIService, getUniqueApiKeys, getUniqueDeepseekApiKeys, aiHttpsAgent, CustomerProfile } from '../services/ai.service';
import { WhatsAppService } from '../services/whatsapp.service';
import { AudioService } from '../services/audio.service';
import { DocumentService } from '../services/document.service';
import { EmailService } from '../services/email.service';
import { PushService } from '../services/push.service';
import { createGoogleCalendarEvent } from '../services/calendar.service';
import { TelcoSMSService } from '../services/telcosms.service';
import { BookingService } from '../services/booking.service';
import { FollowupService } from '../services/followup.service';
import {
  processWhatsAppWebhook,
  triggerAIResponse,
  aiPauses,
  processedMessages,
  botSentMessages,
  findWhatsappConfigForWebhook,
  uploadClientMediaToStorage,
  extractCustomerNameFromText,
} from '../services/whatsapp_webhook.pipeline';
import { getIo } from '../socket';
import axios from 'axios';
import fs from 'fs';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v19.0';
const recentWebhookEvents: Array<Record<string, any>> = [];

function rememberWebhookEvent(event: Record<string, any>) {
  recentWebhookEvents.unshift({
    at: new Date().toISOString(),
    ...event,
  });
  if (recentWebhookEvents.length > 30) recentWebhookEvents.pop();
}

function formatDbError(error: any) {
  if (!error) return '';
  return [error.message, error.details, error.hint, error.code].filter(Boolean).join(' | ');
}

function normalizeMetaPhone(value?: string) {
  return (value || '').toString().replace(/\D/g, '');
}

function getPublicBaseUrl(req: AuthRequest) {
  const configured = process.env.PUBLIC_BASE_URL || process.env.APP_URL || process.env.FRONTEND_URL;
  if (configured) return configured.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

function validatePublicWebhookUrl(baseUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('PUBLIC_BASE_URL inválido. Configure um domínio público HTTPS, por exemplo: https://seudominio.com');
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLocal =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.local');
  const isPlaceholder =
    hostname.includes('seu-dominio') ||
    hostname.includes('your-domain') ||
    hostname.includes('example.com') ||
    hostname.includes('dominio.com');

  if (parsed.protocol !== 'https:' || isLocal || isPlaceholder) {
    throw new Error('Webhook da Meta precisa de um domínio público HTTPS. Configure PUBLIC_BASE_URL com o domínio real da plataforma.');
  }
}

function isPlaceholderValue(value?: string) {
  if (!value) return true;
  const normalized = value.toLowerCase();
  return (
    normalized.includes('coloque_aqui') ||
    normalized.includes('your_') ||
    normalized.includes('seu-') ||
    normalized.includes('your-domain') ||
    normalized.includes('example')
  );
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
  const verifyToken = process.env.META_VERIFY_TOKEN || 'orion_secure_token_123';
  const publicBaseUrl = getPublicBaseUrl(req);
  validatePublicWebhookUrl(publicBaseUrl);

  if (!appId || !appSecret) {
    throw new Error('META_APP_ID e META_APP_SECRET são obrigatórios para subscrever o webhook da Meta.');
  }

  const callbackUrl = `${publicBaseUrl}/api/whatsapp/webhook`;
  const result: any = {
    callbackUrl,
    appSubscription: null,
    wabaSubscription: null,
  };

  try {
    const appToken = `${appId}|${appSecret}`;
    const appSubRes = await axios.post(`https://graph.facebook.com/${META_GRAPH_VERSION}/${appId}/subscriptions`, null, {
      params: {
        object: 'whatsapp_business_account',
        callback_url: callbackUrl,
        verify_token: verifyToken,
        fields: 'messages,messaging_handovers,standby,message_template_status_update,account_update,phone_number_quality_update,phone_number_name_update',
        include_values: true,
        access_token: appToken,
      },
    });
    result.appSubscription = { success: true, data: appSubRes.data };
  } catch (err: any) {
    result.appSubscription = { success: false, error: err.response?.data || err.message };
    console.warn('[WHATSAPP WEBHOOKS] Erro ao configurar webhook do app:', result.appSubscription.error);
    throw err;
  }

  try {
    const wabaSubRes = await axios.post(`https://graph.facebook.com/${META_GRAPH_VERSION}/${wabaId}/subscribed_apps`, null, {
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

async function exchangeForLongLivedMetaToken(params: {
  accessToken: string;
  appId?: string;
  appSecret?: string;
}) {
  const accessToken = (params.accessToken || '').toString().trim();
  const appId = (process.env.META_APP_ID || params.appId || '').toString().trim();
  const appSecret = (process.env.META_APP_SECRET || params.appSecret || '').toString().trim();

  if (!accessToken || !appId || !appSecret) return accessToken;

  try {
    const { data } = await axios.get(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: accessToken,
      },
    });

    if (data?.access_token) {
      console.log('[META TOKEN] Token temporário convertido para token de vida longa.');
      return data.access_token;
    }
  } catch (err: any) {
    console.warn('[META TOKEN] Não foi possível converter token para vida longa:', err.response?.data || err.message);
  }

  return accessToken;
}



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
      app_id: extraMeta.app_id || (data as any).app_id || process.env.META_APP_ID || '',
      client_secret: extraMeta.client_secret || (data as any).client_secret || process.env.META_APP_SECRET || '',
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
    const { phone: rawPhone, message, clientMsgId } = req.body;
    const phone = normalizeMetaPhone(rawPhone);

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
    if (!config.phone_number_id || !config.access_token?.trim()) {
      return res.status(400).json({ error: 'Configuração WhatsApp incompleta: Phone Number ID ou token ausente.' });
    }

    const sentId = await WhatsAppService.sendTextMessage(
      config.phone_number_id,
      phone,
      message,
      config.access_token
    );

    if (!sentId) {
      return res.status(502).json({ error: 'A Meta não confirmou o envio da mensagem. Verifique o token, o Phone Number ID e a janela de atendimento de 24 horas.' });
    }

    if (sentId) botSentMessages.add(sentId);

    // Pausar a IA por 5 minutos quando o agente humano envia com sucesso
    const historyKey = `${orgId}:${phone}`;
    aiPauses.set(historyKey, Date.now() + 5 * 60 * 1000);

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
    const { phone: rawPhone, message, clientMsgId } = req.body;
    const phone = normalizeMetaPhone(rawPhone);
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
    if (!config.phone_number_id || !config.access_token?.trim()) {
      return res.status(400).json({ error: 'Configuração WhatsApp incompleta: Phone Number ID ou token ausente.' });
    }

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
    if (!sentId) {
      return res.status(502).json({ error: 'A Meta não confirmou o envio do ficheiro. Verifique se a URL pública do ficheiro está acessível e se o token continua válido.' });
    }

    // Pausar a IA por 5 minutos quando o agente humano envia com sucesso
    const historyKey = `${orgId}:${phone}`;
    aiPauses.set(historyKey, Date.now() + 5 * 60 * 1000);

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
      access_token: rawAccessToken,
      display_name,
      phone,
    } = req.body;
    let access_token = rawAccessToken;

    if (!phone_number_id || !access_token) {
      return res.status(400).json({ error: 'phone_number_id e access_token são obrigatórios.' });
    }

    try {
      access_token = await exchangeForLongLivedMetaToken({
        accessToken: access_token,
        appId: req.body.app_id,
        appSecret: req.body.client_secret,
      });

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

    accessToken = await exchangeForLongLivedMetaToken({
      accessToken,
      appId: metaAppId,
      appSecret: metaAppSecret,
    });

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

// ─── GET /api/whatsapp/webhook-diagnostics ───────────────────────────────────
router.get('/webhook-diagnostics', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const publicBaseUrl = getPublicBaseUrl(req);
    const callbackUrl = `${publicBaseUrl}/api/whatsapp/webhook`;

    let callbackOk = true;
    let callbackIssue = '';
    try {
      validatePublicWebhookUrl(publicBaseUrl);
    } catch (err: any) {
      callbackOk = false;
      callbackIssue = err.message;
    }

    const { data: config, error } = await supabaseAdmin
      .from('whatsapp_config')
      .select('phone_number_id, waba_id, access_token, display_name, is_active')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;

    let subscribedApps: any = null;
    let subscribedAppsError = '';
    if (config?.waba_id && config?.access_token) {
      try {
        const { data } = await axios.get(`https://graph.facebook.com/${META_GRAPH_VERSION}/${config.waba_id}/subscribed_apps`, {
          params: { access_token: config.access_token },
        });
        subscribedApps = data;
      } catch (err: any) {
        subscribedAppsError = err.response?.data?.error?.message || err.message;
      }
    }

    let appSubscriptions: any = null;
    let appSubscriptionsError = '';
    const appId = process.env.META_APP_ID || process.env.VITE_META_APP_ID || '';
    const appSecret = process.env.META_APP_SECRET || '';
    if (appId && appSecret) {
      try {
        const { data } = await axios.get(`https://graph.facebook.com/${META_GRAPH_VERSION}/${appId}/subscriptions`, {
          params: { access_token: `${appId}|${appSecret}` },
        });
        appSubscriptions = data;
      } catch (err: any) {
        appSubscriptionsError = err.response?.data?.error?.message || err.message;
      }
    }

    return res.json({
      callbackUrl,
      callbackOk,
      callbackIssue,
      environment: {
        hasPublicBaseUrl: !!(process.env.PUBLIC_BASE_URL || process.env.APP_URL || process.env.FRONTEND_URL),
        hasMetaVerifyToken: !!process.env.META_VERIFY_TOKEN,
        hasMetaAppId: !!process.env.META_APP_ID,
        hasMetaAppSecret: !!process.env.META_APP_SECRET,
        hasMetaWhatsappConfigId: !!(process.env.META_WHATSAPP_CONFIG_ID || process.env.VITE_META_WHATSAPP_CONFIG_ID),
        publicBaseUrlLooksPlaceholder: isPlaceholderValue(process.env.PUBLIC_BASE_URL || process.env.APP_URL || process.env.FRONTEND_URL),
        metaWhatsappConfigIdLooksPlaceholder: isPlaceholderValue(process.env.META_WHATSAPP_CONFIG_ID || process.env.VITE_META_WHATSAPP_CONFIG_ID),
      },
      config: config ? {
        isActive: config.is_active,
        phoneNumberId: config.phone_number_id,
        wabaId: config.waba_id,
        displayName: config.display_name,
        hasAccessToken: !!config.access_token,
      } : null,
      appSubscriptions,
      appSubscriptionsError,
      subscribedApps,
      subscribedAppsError,
      recentWebhookEvents,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/whatsapp/meta-public-config ────────────────────────────────────
router.get('/meta-public-config', requireAuth, async (_req: AuthRequest, res) => {
  return res.json({
    appId: process.env.META_APP_ID || process.env.VITE_META_APP_ID || '',
    whatsappConfigId: process.env.META_WHATSAPP_CONFIG_ID || process.env.VITE_META_WHATSAPP_CONFIG_ID || '',
    whatsappFeatureType: process.env.META_WHATSAPP_FEATURE_TYPE || process.env.VITE_META_WHATSAPP_FEATURE_TYPE || '',
  });
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




// ─── GET /api/whatsapp/webhook-status — Diagnóstico público protegido ─────────
router.get('/webhook-status', (req, res) => {
  const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'orion_webhook_token';
  const token = req.query.token;

  if (token !== VERIFY_TOKEN) {
    return res.sendStatus(403);
  }

  res.json({
    status: 'ok',
    webhookUrl: `${getPublicBaseUrl(req as AuthRequest)}/api/whatsapp/webhook`,
    now: new Date().toISOString(),
    recentWebhookEvents,
  });
});

// ─── GET /api/whatsapp/webhook — Verificação Meta ─────────────────────────────
router.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'orion_webhook_token';
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  rememberWebhookEvent({
    method: 'GET',
    mode,
    tokenMatched: token === VERIFY_TOKEN,
    hasChallenge: !!challenge,
  });

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
    await processWhatsAppWebhook(req.body, rememberWebhookEvent);

  } catch (err: any) {
    console.error('[WEBHOOK] Erro fatal:', err.message);
    rememberWebhookEvent({
      method: 'POST',
      outcome: 'fatal_error',
      error: err.message,
    });
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

// ─── GET /api/whatsapp/test-keys — Diagnosticar online motores de IA (DeepSeek e Gemini) ─
router.get('/test-keys', async (req, res) => {
  try {
    const deepseekKeys = getUniqueDeepseekApiKeys();
    const geminiKeys = getUniqueApiKeys();
    const deepseekResults: any[] = [];
    const geminiResults: any[] = [];

    // 1. Testar chaves DeepSeek
    const dsModel = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    const dsBaseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '');

    for (let i = 0; i < deepseekKeys.length; i++) {
      const key = deepseekKeys[i];
      const masked = key.substring(0, 8) + '...' + key.substring(key.length - 4);
      try {
        const response = await axios.post(`${dsBaseUrl}/chat/completions`, {
          model: dsModel,
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 10,
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`,
          },
          timeout: 15000,
          httpsAgent: aiHttpsAgent,
        });

        const reply = response.data?.choices?.[0]?.message?.content?.trim();
        deepseekResults.push({
          index: i + 1,
          engine: 'DeepSeek (Principal)',
          key: masked,
          status: 'SUCESSO',
          model: dsModel,
          reply,
        });
      } catch (err: any) {
        const status = err.response?.status ?? 'N/A';
        const errMsg = err.response?.data?.error?.message || err.message;
        deepseekResults.push({
          index: i + 1,
          engine: 'DeepSeek (Principal)',
          key: masked,
          status: 'FALHOU',
          httpStatus: status,
          error: errMsg,
          hint: status === 401 ? 'Chave inválida ou expirada. Atualize DEEPSEEK_API_KEY no .env.' : (status === 402 ? 'Saldo esgotado. Recarregue no portal DeepSeek.' : 'Verifique a conexão com a API DeepSeek.')
        });
      }
    }

    // 2. Testar chaves Gemini
    const testModels = ['gemini-2.5-flash', 'gemini-flash-lite-latest'];
    for (let i = 0; i < geminiKeys.length; i++) {
      const key = geminiKeys[i];
      const masked = key.substring(0, 8) + '...' + key.substring(key.length - 4);

      let keySuccess = false;
      let lastErr = '';
      let successfulModel = '';

      for (const m of testModels) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`;
        try {
          const response = await axios.post(url, {
            contents: [{ parts: [{ text: 'Ping' }] }]
          }, { timeout: 15000, httpsAgent: aiHttpsAgent });

          const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
          keySuccess = true;
          successfulModel = m;
          geminiResults.push({
            index: i + 1,
            engine: 'Gemini (Fallback)',
            key: masked,
            status: 'SUCESSO',
            model: successfulModel,
            reply: text?.trim()
          });
          break;
        } catch (err: any) {
          lastErr = err.response?.data?.error?.message || err.message;
        }
      }

      if (!keySuccess) {
        geminiResults.push({
          index: i + 1,
          engine: 'Gemini (Fallback)',
          key: masked,
          status: 'FALHOU',
          error: lastErr,
        });
      }
    }

    res.json({
      timestamp: new Date().toISOString(),
      summary: {
        deepseek_keys_configured: deepseekKeys.length,
        deepseek_operational: deepseekResults.some(r => r.status === 'SUCESSO'),
        gemini_keys_configured: geminiKeys.length,
        gemini_operational: geminiResults.some(r => r.status === 'SUCESSO'),
      },
      deepseek: deepseekResults,
      gemini: geminiResults,
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
