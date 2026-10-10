import { supabaseAdmin } from '../config/supabase';
import { getIo } from '../socket';
import { AIService } from './ai.service';
import { WhatsAppService } from './whatsapp.service';

type WebhookEventRecorder = (event: Record<string, any>) => void;

type WhatsAppConfig = {
  org_id: string;
  access_token: string;
  display_name?: string | null;
  phone_number_id: string;
  waba_id?: string | null;
};

const processedMessageIds = new Set<string>();
setInterval(() => processedMessageIds.clear(), 30 * 60 * 1000);

function normalizePhone(value?: string) {
  return (value || '').toString().replace(/\D/g, '');
}

function dbError(error: any) {
  if (!error) return '';
  return [error.message, error.details, error.hint, error.code].filter(Boolean).join(' | ');
}

function getMessageText(message: any) {
  if (!message) return '';

  if (message.type === 'text') {
    return message.text?.body || '';
  }

  if (message.type === 'interactive') {
    return message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '';
  }

  if (message.type === 'button') {
    return message.button?.text || message.button?.payload || '';
  }

  if (message.type === 'image') {
    return message.image?.caption || '[Imagem recebida]';
  }

  if (message.type === 'audio') {
    return '[Audio recebido]';
  }

  if (message.type === 'video') {
    return message.video?.caption || '[Video recebido]';
  }

  if (message.type === 'document') {
    return message.document?.caption || `[Documento recebido${message.document?.filename ? `: ${message.document.filename}` : ''}]`;
  }

  if (message.type === 'location') {
    const latitude = message.location?.latitude;
    const longitude = message.location?.longitude;
    return latitude && longitude ? `[Localizacao recebida: ${latitude}, ${longitude}]` : '[Localizacao recebida]';
  }

  return `[Mensagem recebida: ${message.type || 'tipo desconhecido'}]`;
}

async function findConfig(phoneNumberId?: string, wabaId?: string): Promise<WhatsAppConfig | null> {
  const selectFields = 'org_id, access_token, display_name, phone_number_id, waba_id';

  if (phoneNumberId) {
    const { data, error } = await supabaseAdmin
      .from('whatsapp_config')
      .select(selectFields)
      .eq('phone_number_id', phoneNumberId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (error) console.error('[WHATSAPP PIPELINE] Erro ao procurar config por phone_number_id:', dbError(error));
    if (data) return data as WhatsAppConfig;
  }

  if (wabaId) {
    const { data, error } = await supabaseAdmin
      .from('whatsapp_config')
      .select(selectFields)
      .eq('waba_id', wabaId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (error) console.error('[WHATSAPP PIPELINE] Erro ao procurar config por waba_id:', dbError(error));
    if (data) return data as WhatsAppConfig;
  }

  const { data, error } = await supabaseAdmin
    .from('whatsapp_config')
    .select(selectFields)
    .eq('is_active', true);

  if (error) {
    console.error('[WHATSAPP PIPELINE] Erro ao procurar configs ativas:', dbError(error));
    return null;
  }

  if (data?.length === 1) {
    console.warn('[WHATSAPP PIPELINE] Usando fallback da unica configuracao ativa.');
    return data[0] as WhatsAppConfig;
  }

  return null;
}

async function emitNewMessage(orgId: string, payload: Record<string, any>) {
  try {
    getIo().to(`org:${orgId}`).emit('new_message', payload);
  } catch (err: any) {
    console.warn('[WHATSAPP PIPELINE] Socket indisponivel:', err.message);
  }
}

async function saveMessage(params: {
  orgId: string;
  phone: string;
  sender: 'user' | 'bot' | 'human';
  text: string;
  metadata?: Record<string, any>;
}) {
  const { error } = await supabaseAdmin.from('conversation_history').insert({
    org_id: params.orgId,
    customer_phone: params.phone,
    sender: params.sender,
    text: params.text,
    metadata: params.metadata,
  });

  if (error) {
    throw new Error(`Falha ao gravar historico: ${dbError(error)}`);
  }
}

async function loadHistory(orgId: string, phone: string) {
  const { data, error } = await supabaseAdmin
    .from('conversation_history')
    .select('sender, text')
    .eq('org_id', orgId)
    .eq('customer_phone', phone)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.warn('[WHATSAPP PIPELINE] Historico indisponivel:', dbError(error));
    return [];
  }

  return (data || [])
    .reverse()
    .filter((item: any) => item.sender === 'user' || item.sender === 'bot' || item.sender === 'human')
    .map((item: any) => ({ sender: item.sender, text: item.text }));
}

async function getBotName(orgId: string, config: WhatsAppConfig) {
  const { data } = await supabaseAdmin
    .from('organizations')
    .select('chatbot_name')
    .eq('id', orgId)
    .maybeSingle();

  return data?.chatbot_name || config.display_name || 'Assistente';
}

async function answerWithAi(params: {
  config: WhatsAppConfig;
  phone: string;
  text: string;
  messageId: string;
  recorder: WebhookEventRecorder;
}) {
  const { config, phone, text, messageId, recorder } = params;
  const orgId = config.org_id;
  const botName = await getBotName(orgId, config);

  try {
    const history = await loadHistory(orgId, phone);
    const aiResult = await AIService.generateResponse({
      orgId,
      message: text,
      history,
      botName,
      mode: 'simulation',
      customerProfile: { phone },
    });

    const reply = aiResult?.reply?.trim();
    if (!reply) {
      throw new Error('A IA devolveu resposta vazia.');
    }

    const sentId = await WhatsAppService.sendTextMessage(
      config.phone_number_id,
      phone,
      reply,
      config.access_token
    );

    if (!sentId) {
      throw new Error('A Meta nao confirmou o envio da resposta.');
    }

    await saveMessage({
      orgId,
      phone,
      sender: 'bot',
      text: reply,
      metadata: {
        platform: 'whatsapp',
        botName,
        meta_message_id: sentId,
        replied_to: messageId,
      },
    });

    await emitNewMessage(orgId, {
      phone,
      sender: 'bot',
      text: reply,
      botName,
      time: new Date().toLocaleTimeString('pt-PT', { timeZone: 'Africa/Luanda', hour: '2-digit', minute: '2-digit' }),
      timestamp: new Date().toISOString(),
      platform: 'whatsapp',
      metadata: { meta_message_id: sentId },
    });

    recorder({ method: 'POST', outcome: 'ai_reply_sent', orgId, from: phone, messageId, sentMsgId: sentId });
  } catch (err: any) {
    const message = err.message || String(err);
    console.error('[WHATSAPP PIPELINE] IA falhou:', message);

    try {
      await saveMessage({
        orgId,
        phone,
        sender: 'bot',
        text: `[ERRO INTERNO - NAO ENVIADO AO CLIENTE]: ${message}`,
        metadata: { platform: 'whatsapp', internal_error: true, needs_urgent_intervention: true },
      });
    } catch (saveErr: any) {
      console.error('[WHATSAPP PIPELINE] Falha ao gravar erro interno:', saveErr.message);
    }

    try {
      getIo().to(`org:${orgId}`).emit('chat_error', {
        phone,
        platform: 'whatsapp',
        error: message,
        urgent: true,
      });
    } catch (_) {}

    recorder({ method: 'POST', outcome: 'ai_reply_failed', orgId, from: phone, messageId, error: message });
  }
}

async function processStatus(change: any, entry: any, recorder: WebhookEventRecorder) {
  const value = change?.value;
  const statuses = value?.statuses || [];
  if (!statuses.length) return;

  const config = await findConfig(value?.metadata?.phone_number_id, entry?.id);
  if (!config) {
    recorder({
      method: 'POST',
      outcome: 'status_no_config',
      phoneNumberId: value?.metadata?.phone_number_id,
      wabaId: entry?.id,
    });
    return;
  }

  for (const statusItem of statuses) {
    const phone = normalizePhone(statusItem.recipient_id);
    try {
      getIo().to(`org:${config.org_id}`).emit('message_status', {
        phone,
        messageId: statusItem.id,
        status: statusItem.status,
      });
    } catch (_) {}
  }

  recorder({
    method: 'POST',
    outcome: 'status_processed',
    orgId: config.org_id,
    count: statuses.length,
  });
}

async function processIncomingMessage(change: any, entry: any, recorder: WebhookEventRecorder) {
  const value = change?.value;
  const messages = value?.messages || [];
  if (!messages.length) return;

  const metadata = value?.metadata || {};
  const config = await findConfig(metadata.phone_number_id, entry?.id);
  if (!config) {
    recorder({
      method: 'POST',
      outcome: 'no_active_config',
      phoneNumberId: metadata.phone_number_id,
      wabaId: entry?.id,
      messageIds: messages.map((item: any) => item.id),
    });
    return;
  }

  for (const message of messages) {
    const messageId = message.id || `unknown_${Date.now()}`;
    const from = normalizePhone(message.from);
    const text = getMessageText(message);
    const profileName = value?.contacts?.find((item: any) => normalizePhone(item?.wa_id) === from)?.profile?.name;

    if (processedMessageIds.has(messageId)) {
      recorder({ method: 'POST', outcome: 'duplicate_message_ignored', orgId: config.org_id, from, messageId });
      continue;
    }
    processedMessageIds.add(messageId);

    if (!from || !text) {
      recorder({ method: 'POST', outcome: 'empty_message_ignored', orgId: config.org_id, messageId });
      continue;
    }

    await saveMessage({
      orgId: config.org_id,
      phone: from,
      sender: 'user',
      text,
      metadata: {
        platform: 'whatsapp',
        message_id: messageId,
        phone_number_id: metadata.phone_number_id,
        waba_id: entry?.id,
        type: message.type,
        profile_name: profileName,
      },
    });

    await supabaseAdmin.from('contacts').upsert({
      org_id: config.org_id,
      phone: from,
      name: profileName || undefined,
      source: 'whatsapp',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'org_id,phone' });

    await emitNewMessage(config.org_id, {
      phone: from,
      sender: 'user',
      text,
      time: new Date().toLocaleTimeString('pt-PT', { timeZone: 'Africa/Luanda', hour: '2-digit', minute: '2-digit' }),
      timestamp: new Date().toISOString(),
      platform: 'whatsapp',
      metadata: { message_id: messageId, type: message.type },
    });

    recorder({
      method: 'POST',
      outcome: 'message_saved',
      orgId: config.org_id,
      from,
      messageId,
      phoneNumberId: metadata.phone_number_id,
      wabaId: entry?.id,
      type: message.type,
    });

    await answerWithAi({ config, phone: from, text, messageId, recorder });
  }
}

export async function processWhatsAppWebhook(body: any, recorder: WebhookEventRecorder) {
  recorder({
    method: 'POST',
    object: body?.object,
    entryCount: Array.isArray(body?.entry) ? body.entry.length : 0,
    phoneNumberId: body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id,
    hasMessages: !!body?.entry?.[0]?.changes?.[0]?.value?.messages?.length,
    hasStatuses: !!body?.entry?.[0]?.changes?.[0]?.value?.statuses?.length,
  });

  if (body?.object !== 'whatsapp_business_account') {
    recorder({ method: 'POST', outcome: 'ignored_object', object: body?.object });
    return;
  }

  const entries = Array.isArray(body.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      await processStatus(change, entry, recorder);
      await processIncomingMessage(change, entry, recorder);
    }
  }
}
