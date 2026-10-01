import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AIService } from '../services/ai.service';
import { FacebookService } from '../services/facebook.service';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { EmailService } from '../services/email.service';
import { PushService } from '../services/push.service';
import { FollowupService } from '../services/followup.service';
import { BookingService } from '../services/booking.service';
import { GoogleSheetsService } from '../services/google_sheets.service';
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
            } else if (att.type === 'image') {
              console.log(`[FB WEBHOOK] Analisando imagem recebida do Facebook via Gemini...`);
              const imgDesc = await AIService.describeImageWithGemini(base64, mimeType as string);
              if (imgDesc) {
                userText = `[Imagem enviada pelo cliente — descrição visual e texto lido]:\n${imgDesc}`;
                media = undefined;
              }
            } else if (!userText) {
              userText = `(Anexo do tipo ${att.type})`;
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

      // 2. Buscar histórico recente completo (últimas 60 mensagens)
      const { data: dbHistory } = await supabaseAdmin
        .from('conversation_history')
        .select('sender, text')
        .eq('org_id', orgId)
        .eq('customer_phone', senderId)
        .order('created_at', { ascending: false })
        .limit(60);

      const history = (dbHistory || []).reverse().map(h => ({ sender: h.sender, text: h.text }));

      // 3. Persistir mensagem do utilizador
      await supabaseAdmin.from('conversation_history').insert({
        org_id: orgId,
        customer_phone: senderId,
        sender: 'user',
        text: userText || '[media]',
        metadata: { platform: 'facebook', referral: referral || undefined },
      });

      // Sincronizar interação com a folha Google Sheets
      GoogleSheetsService.syncInteraction({
        orgId,
        channel: 'facebook',
        phoneOrId: senderId,
        name: `Cliente Facebook (${senderId})`,
        text: userText || '[media]',
        status: 'Ativo',
      }).catch(() => {});

      // Cancelar follow-ups pendentes (cliente voltou a responder)
      FollowupService.cancelPendingForPhone(orgId, senderId).catch(() => {});

      // 4. Indicador de digitação
      await FacebookService.sendTypingIndicator(pageId, senderId, accessToken, 'typing_on');

      // 5. PROTOCOLO DE SEGURANÇA E AUTO-CURA DA IA (Até 3 tentativas de recuperação)
      let aiResult: any = null;
      let sendSuccess = false;
      let lastErrorMsg = '';

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`[FB WEBHOOK] 🛡️ Tentativa ${attempt}/3 de auto-cura para sender=${senderId}...`);
          if (attempt > 1) {
            await new Promise(r => setTimeout(r, attempt * 1000));
          }

          aiResult = await AIService.generateResponse({
            message: userText || '',
            orgId,
            history,
            botName: botName || 'Assistente',
            mode: 'simulation',
            media: attempt === 1 ? media : undefined,
            referral: referral || undefined,
          });

          if (!aiResult?.reply) {
            throw new Error('Resposta vazia da IA no Facebook.');
          }

          // Enviar resposta via Facebook API
          await FacebookService.sendMessage(pageId, senderId, aiResult.reply, accessToken);
          sendSuccess = true;
          console.log(`[FB WEBHOOK] ✅ Mensagem enviada com sucesso para sender=${senderId} na tentativa ${attempt}!`);

          // Emitir resolução de erro
          try {
            getIo().to(`org:${orgId}`).emit('chat_resolved', {
              phone: senderId,
              platform: 'facebook',
            });
          } catch (_) {}

          break;
        } catch (attemptErr: any) {
          lastErrorMsg = attemptErr.message || String(attemptErr);
          console.warn(`[FB WEBHOOK] ⚠️ Tentativa ${attempt}/3 falhou para sender=${senderId}: ${lastErrorMsg}`);
        }
      }

      if (!sendSuccess) {
        console.error(`[FB WEBHOOK] ❌ AIService falhou após 3 tentativas para sender=${senderId}: ${lastErrorMsg}`);

        // NÃO enviar mensagem de erro ao cliente — apenas registar e sinalizar o painel com alerta vermelho.
        try {
          await supabaseAdmin.from('conversation_history').insert({
            org_id: orgId,
            customer_phone: senderId,
            sender: 'bot',
            text: `[ERRO INTERNO — NÃO ENVIADO AO CLIENTE]: ${lastErrorMsg}`,
            metadata: { platform: 'facebook', internal_error: true, needs_urgent_intervention: true },
          });
        } catch (_) { /* silencioso */ }

        try {
          getIo().to(`org:${orgId}`).emit('chat_error', {
            phone: senderId,
            error: lastErrorMsg,
            urgent: true,
            platform: 'facebook',
          });
        } catch (_) { /* silencioso */ }

        EmailService.sendUrgentInterventionAlert({
          orgId,
          customerPhone: senderId,
          customerName: 'Cliente Facebook',
          errorMessage: lastErrorMsg,
          customerMessage: userText,
          platform: 'Facebook',
        }).catch(e => console.error('[ALERTA FB] Erro ao enviar email de intervenção:', e.message));

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

      // ── Processamento Centralizado de Agendamento (Agenda Google/Microsoft + Deduplicação + Email/SMS) ──
      if (aiResult.bookingData) {
        const bData = aiResult.bookingData;
        console.log(`[FB-BOOKING] 📅 Agendamento detectado via Facebook para ${bData.name} (${bData.date} às ${bData.time})`);
        
        BookingService.processBooking(orgId, {
          name: bData.name,
          subject: bData.subject,
          phone: bData.phone || senderId,
          email: bData.email,
          date: bData.date,
          time: bData.time,
        }, { channelOrigin: 'Facebook Messenger' })
        .then(res => {
          if (res.success) {
            console.log(`[FB-BOOKING] ✅ Agendamento processado! Lembretes programados: ${res.alertsScheduled}`);
          } else {
            console.warn(`[FB-BOOKING] ⚠️ Agendamento não concluído: ${res.error}`);
          }
        })
        .catch(err => console.error('[FB-BOOKING] ❌ Erro ao processar agendamento:', err.message));
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

      // Ativar protocolo de follow-up para todos os clientes sem agendamento e sem transferência para humano
      if (!aiResult.transfer && !aiResult.booking) {
        FollowupService.scheduleSmartFollowup({
          orgId,
          phone:    senderId,
          platform: 'facebook',
          botReply: aiResult.reply,
        }).catch(() => {});
      }

      console.log(`[FB WEBHOOK] Resposta enviada para ${senderId}.`);
    }
  } catch (err: any) {
    console.error('[FB WEBHOOK] Erro:', err.message);
  }
});

export default router;
