import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AIService } from '../services/ai.service';
import { FacebookService } from '../services/facebook.service';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { EmailService } from '../services/email.service';
import { PushService } from '../services/push.service';
import { getIo } from '../socket';
import { AudioService } from '../services/audio.service';
import axios from 'axios';

const router = Router();
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'orion_secure_token_123';

// Dedup de mensagens Facebook processadas
const processedFbMessages = new Set<string>();
setInterval(() => processedFbMessages.clear(), 10 * 60 * 1000);

// ─── GET /api/facebook/config ─────────────────────────────────────────────────
router.get('/config', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const { data, error } = await supabaseAdmin
      .from('facebook_config')
      .select('*')
      .eq('org_id', orgId)
      .maybeSingle();

    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/facebook/config ────────────────────────────────────────────────
router.post('/config', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const { page_id, page_access_token, app_id, app_secret, display_name } = req.body;

    if (!page_id || !page_access_token) {
      return res.status(400).json({ error: 'Page ID e Page Access Token são obrigatórios.' });
    }

    const payload: any = {
      org_id: orgId,
      page_id,
      access_token: page_access_token,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    // Adicionar campos opcionais apenas se existirem
    if (display_name) payload.display_name = display_name;
    if (app_id)      payload.app_id = app_id;
    if (app_secret)  payload.app_secret = app_secret;

    // Tentar guardar com page_access_token separado (caso a coluna exista na tabela)
    try {
      payload.page_access_token = page_access_token;
      const { data, error } = await supabaseAdmin
        .from('facebook_config')
        .upsert(payload, { onConflict: 'org_id' })
        .select()
        .single();

      if (error) throw error;
      console.log(`[FB CONFIG] Configuração salva para org ${orgId}, page_id: ${page_id}`);
      return res.json(data);
    } catch (firstErr: any) {
      // Se falhar por causa da coluna page_access_token não existir, tentar sem ela
      console.warn('[FB CONFIG] Tentativa 1 falhou:', firstErr.message, '- Tentando sem page_access_token...');
      delete payload.page_access_token;

      const { data, error } = await supabaseAdmin
        .from('facebook_config')
        .upsert(payload, { onConflict: 'org_id' })
        .select()
        .single();

      if (error) {
        console.error('[FB CONFIG] Erro final ao salvar:', error);
        throw error;
      }
      console.log(`[FB CONFIG] Configuração salva (sem page_access_token) para org ${orgId}`);
      return res.json(data);
    }
  } catch (err: any) {
    console.error('[FB CONFIG] Erro:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/facebook/webhook — Verificação Meta ────────────────────────────
router.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[FB WEBHOOK] Verificado com sucesso.');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ─── POST /api/facebook/webhook — Recepção de mensagens ──────────────────────
router.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Responder imediatamente à Meta

  try {
    const body = req.body;
    if (body.object !== 'page') return;

    for (const entry of body.entry) {
      const messaging = entry.messaging?.[0];
      if (!messaging || !messaging.message || messaging.message.is_echo) continue;

      const messageId = messaging.message.mid;
      if (!messageId) continue;

      // Dedup
      if (processedFbMessages.has(messageId)) continue;
      processedFbMessages.add(messageId);

      const senderId = messaging.sender.id;
      const pageId   = entry.id;

      let userText = messaging.message.text || '';
      let media: { base64: string; mimeType: string } | undefined = undefined;

      const attachments = messaging.message.attachments || [];
      if (attachments.length > 0) {
        const att = attachments[0];
        const attUrl = att.payload?.url;
        if (attUrl) {
          try {
            console.log(`[FB WEBHOOK] Descarregando anexo do tipo ${att.type}: ${attUrl.substring(0, 60)}...`);
            const response = await axios.get(attUrl, { responseType: 'arraybuffer' });
            const mimeType = (response.headers['content-type'] as string) || (att.type === 'image' ? 'image/jpeg' : att.type === 'audio' ? 'audio/ogg' : 'application/octet-stream');
            const base64 = Buffer.from(response.data).toString('base64');
            media = { base64, mimeType };

            if (att.type === 'audio') {
              console.log(`[FB WEBHOOK] Transcrevendo áudio recebido do Facebook...`);
              const sttResult = await AudioService.speechToTextFromBase64(base64, mimeType as string);
              if (sttResult) {
                userText = `[Mensagem de Áudio]: ${sttResult.text}`;
                console.log(`[FB WEBHOOK] Áudio transcrito: "${sttResult.text.substring(0, 80)}"`);
                media = undefined;
              } else {
                userText = '';
                console.warn(`[FB WEBHOOK] STT falhou. A passar media raw ao AIService para nova tentativa via Gemini.`);
              }
            } else if (!userText) {
              userText = att.type === 'image' ? '(Imagem enviada)' : `(Anexo do tipo ${att.type})`;
            }
          } catch (err: any) {
            console.error(`[FB WEBHOOK] Erro ao descarregar/processar anexo:`, err.message);
          }
        }
      }

      if (!userText?.trim() && !media) continue;

      const referral = messaging.referral || messaging.message?.referral || null;
      if (referral) {
        console.log(`[FB WEBHOOK] 📣 Mensagem de anúncio detectada. Referral:`, JSON.stringify(referral).substring(0, 200));
      }

      console.log(`[FB WEBHOOK] ▶ Nova mensagem | sender=${senderId} | page=${pageId} | text="${(userText || '').substring(0, 80)}" | media=${media ? media.mimeType : 'none'}`);

      // 1. Buscar configuração da página
      const { data: config } = await supabaseAdmin
        .from('facebook_config')
        .select('org_id, access_token, display_name')
        .eq('page_id', pageId)
        .eq('is_active', true)
        .maybeSingle();

      if (!config) {
        console.warn(`[FB WEBHOOK] Nenhuma config activa para page_id: ${pageId}`);
        continue;
      }

      const { org_id: orgId, access_token: accessToken } = config;

      // Buscar nome personalizado (chatbot_name)
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('chatbot_name')
        .eq('id', orgId)
        .maybeSingle();

      const botName = org?.chatbot_name || config.display_name || 'Assistente';

      // 2. Buscar histórico (últimas 50 mensagens)
      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: dbHistory } = await supabaseAdmin
        .from('conversation_history')
        .select('sender, text')
        .eq('org_id', orgId)
        .eq('customer_phone', senderId)
        .gte('created_at', last24h)
        .order('created_at', { ascending: false })
        .limit(50);

      const history = (dbHistory || []).reverse().map(h => ({ sender: h.sender, text: h.text }));

      // 3. Persistir mensagem do utilizador
      await supabaseAdmin.from('conversation_history').insert({
        org_id: orgId,
        customer_phone: senderId,
        sender: 'user',
        text: userText || '[media]',
        metadata: { platform: 'facebook', referral: referral || undefined },
      });

      // 4. Indicador de digitação
      await FacebookService.sendTypingIndicator(pageId, senderId, accessToken, 'typing_on');

      // 5. Gerar resposta com IA
      let aiResult;
      try {
        aiResult = await AIService.generateResponse({
          message: userText || '',
          orgId,
          history,
          botName: botName || 'Assistente',
          mode: 'simulation',
          media,
          referral: referral || undefined,
        });
        console.log(`[FB WEBHOOK] ✅ Resposta gerada para sender=${senderId}: "${aiResult.reply.substring(0, 80)}"`);
      } catch (aiErr: any) {
        console.error(`[FB WEBHOOK] ❌ AIService lançou excepção para sender=${senderId}:`, aiErr.message);
        try {
          await FacebookService.sendMessage(pageId, senderId, 'Desculpe, tive um problema técnico momentâneo. Por favor, tente novamente em instantes. 🙏', accessToken);
        } catch (_) { /* silencioso */ }
        continue;
      }

      // ── Disparar notificações de Booking, Handover ou Proposal ──
      if (aiResult.transfer || aiResult.booking || aiResult.proposal) {
        const alertType  = aiResult.transfer ? 'handover' : aiResult.booking ? 'booking' : 'proposal';
        const alertTitle = aiResult.transfer 
          ? '🚨 Pedido de Atendimento Humano' 
          : aiResult.booking
          ? '📅 Novo Pedido de Agendamento'
          : '📎 Proposta Comercial Recebida';
        const alertBody  = aiResult.transfer
          ? `Mensageiro (${senderId}) quer falar com um assistente.`
          : aiResult.booking
          ? `Mensageiro (${senderId}) solicitou um agendamento.`
          : `Mensageiro (${senderId}) enviou uma proposta comercial.`;
        
        // 1. Enviar email para admins/owners
        EmailService.sendAlertNotification(orgId, alertType, senderId, 'Cliente Facebook', userText).catch(e => console.error('[ALERTA FB] Erro ao enviar email:', e.message));
        
        // 2. Web Push Notification (segundo plano, browser fechado)
        PushService.sendAlertToOrg(orgId, {
          title: alertTitle,
          body:  alertBody,
          type:  alertType,
          url:   '/dashboard/live-chat',
        }).catch(e => console.error('[ALERTA FB] Erro ao enviar push:', e.message));

        // 3. Emitir evento Socket para notificação no painel (browser aberto)
        try {
          const socketEvent = alertType === 'handover' ? 'handover_alert' : alertType === 'booking' ? 'booking_alert' : 'proposal_alert';
          getIo().to(`org:${orgId}`).emit(socketEvent, {
            phone: senderId,
            message: userText,
            type: alertType,
            platform: 'facebook'
          });
        } catch (_) { /* silencioso */ }
      }

      // 6. Enviar resposta
      await FacebookService.sendMessage(pageId, senderId, aiResult.reply, accessToken);

      // 7. Persistir resposta do bot
      await supabaseAdmin.from('conversation_history').insert({
        org_id: orgId,
        customer_phone: senderId,
        sender: 'bot',
        text: aiResult.reply,
        metadata: { platform: 'facebook' },
      });

      console.log(`[FB WEBHOOK] Resposta enviada para ${senderId}.`);
    }
  } catch (err: any) {
    console.error('[FB WEBHOOK] Erro:', err.message);
  }
});

export default router;
