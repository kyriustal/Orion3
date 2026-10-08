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
    res.json(data || null);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/facebook/config ──────────────────────────────────────────────
router.delete('/config', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const { error } = await supabaseAdmin
      .from('facebook_config')
      .delete()
      .eq('org_id', orgId);

    if (error) throw error;
    res.json({ success: true, message: 'Configuração do Facebook removida com sucesso.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/facebook/test — Teste e diagnóstico de conexão Meta ─────────────
router.get('/test', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const { data: config, error } = await supabaseAdmin
      .from('facebook_config')
      .select('*')
      .eq('org_id', orgId)
      .maybeSingle();

    if (error) throw error;
    if (!config) {
      return res.status(404).json({ error: 'Nenhuma configuração do Facebook encontrada para esta organização.' });
    }

    const token = config.page_access_token || config.access_token;
    if (!token) {
      return res.status(400).json({ error: 'Nenhum token de acesso configurado.' });
    }

    const validation = await FacebookService.validatePageToken(config.page_id, token);

    // Tentar subscrever automaticamente se ainda não estiver subscrito
    let subscribeResult = { success: false, error: undefined as string | undefined };
    if (validation.valid && validation.hasMessaging) {
      subscribeResult = await FacebookService.subscribePageToApp(config.page_id, token);
    }

    res.json({
      success: validation.valid,
      validation,
      subscribed: subscribeResult.success || validation.subscribed,
      subscribeError: subscribeResult.error,
      config: {
        page_id: config.page_id,
        display_name: config.display_name,
        is_active: config.is_active,
        comment_automation_enabled: config.comment_automation_enabled
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/facebook/config ────────────────────────────────────────────────
router.post('/config', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    let { page_id, page_access_token, app_id, app_secret, display_name } = req.body;

    page_id = (page_id || '').toString().trim();
    page_access_token = (page_access_token || '').toString().trim();
    app_id = (app_id || '').toString().trim();
    app_secret = (app_secret || '').toString().trim();

    if (!page_id || !page_access_token) {
      return res.status(400).json({ error: 'Page ID e Page Access Token são obrigatórios.' });
    }

    // Validar token junto da Meta API
    const validation = await FacebookService.validatePageToken(page_id, page_access_token);
    let resolvedPageName = display_name || validation.pageName || null;

    // Subscrever automaticamente o webhook na Meta
    let subscribed = false;
    if (validation.valid) {
      const sub = await FacebookService.subscribePageToApp(page_id, page_access_token);
      subscribed = sub.success;
    }

    // Verificar se já existe uma configuração para esta org
    const { data: existing } = await supabaseAdmin
      .from('facebook_config')
      .select('id')
      .eq('org_id', orgId)
      .maybeSingle();

    const payload: any = {
      org_id: orgId,
      page_id,
      access_token: page_access_token,
      page_access_token,
      is_active: true,
      display_name: resolvedPageName,
      updated_at: new Date().toISOString(),
    };
    if (app_id) payload.app_id = app_id;
    if (app_secret) payload.app_secret = app_secret;

    let result;
    if (existing?.id) {
      const { data, error } = await supabaseAdmin
        .from('facebook_config')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      payload.created_at = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from('facebook_config')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    console.log(`[FB CONFIG] Configuração salva para org ${orgId}, page_id: ${page_id}, valid: ${validation.valid}`);

    return res.json({
      ...result,
      validation: {
        valid: validation.valid,
        hasMessaging: validation.hasMessaging,
        permissions: validation.permissions,
        pageName: validation.pageName,
        subscribed
      }
    });
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
    console.warn(`[FB WEBHOOK] Verificação falhou. Token recebido: "${token}", esperado: "${VERIFY_TOKEN}"`);
    res.sendStatus(403);
  }
});

// ─── POST /api/facebook/webhook — Recepção de mensagens ──────────────────────
router.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Responder imediatamente à Meta (200 OK)

  try {
    const body = req.body;
    if (body.object !== 'page') return;

    for (const entry of (body.entry || [])) {
      const messagingList = entry.messaging || [];

      for (const messaging of messagingList) {
        if (!messaging) continue;
        if (messaging.message?.is_echo) continue; // Ignorar ecos de mensagens enviadas por nós

        // Identificar sender e recipient
        const senderId = messaging.sender?.id;
        const recipientId = messaging.recipient?.id;
        const pageId = recipientId || entry.id;

        if (!senderId) continue;

        // Identificar ID da mensagem ou postback
        const messageId = messaging.message?.mid || messaging.postback?.mid || `${senderId}_${messaging.timestamp || Date.now()}`;

        // Dedup
        if (processedFbMessages.has(messageId)) continue;
        processedFbMessages.add(messageId);

        // Obter texto do utilizador (suportando texto direto e botões Começar / Postback)
        let userText = messaging.message?.text || '';
        if (!userText && messaging.postback) {
          userText = messaging.postback.title || messaging.postback.payload || 'Olá';
          console.log(`[FB WEBHOOK] Postback recebido (botão Começar/Menu): "${userText}"`);
        }

        let media: { base64: string; mimeType: string } | undefined = undefined;
        const attachments = messaging.message?.attachments || [];

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

        const referral = messaging.referral || messaging.message?.referral || messaging.postback?.referral || null;
        if (referral) {
          console.log(`[FB WEBHOOK] 📣 Mensagem de anúncio detectada. Referral:`, JSON.stringify(referral).substring(0, 200));
        }

        console.log(`[FB WEBHOOK] ▶ Nova mensagem | sender=${senderId} | page=${pageId} | text="${(userText || '').substring(0, 80)}" | media=${media ? media.mimeType : 'none'}`);

        // 1. Buscar configuração da página no Supabase
        let { data: config, error: configErr } = await supabaseAdmin
          .from('facebook_config')
          .select('org_id, access_token, page_access_token, display_name, page_id')
          .or(`page_id.eq.${pageId},page_id.eq.${entry.id}${recipientId ? `,page_id.eq.${recipientId}` : ''}`)
          .eq('is_active', true)
          .maybeSingle();

        if (configErr) {
          console.error(`[FB WEBHOOK] ❌ Erro ao buscar config para page_id=${pageId}:`, configErr.message);
        }

        // Fallback: se não encontrar pelo ID exato mas existir apenas 1 configuração activa
        if (!config) {
          const { data: allConfigs } = await supabaseAdmin
            .from('facebook_config')
            .select('org_id, access_token, page_access_token, display_name, page_id')
            .eq('is_active', true);

          if (allConfigs && allConfigs.length === 1) {
            config = allConfigs[0];
            console.log(`[FB WEBHOOK] ℹ️ Config única associada encontrada (page_id=${config.page_id}, recebido=${pageId})`);
          } else {
            console.warn(`[FB WEBHOOK] ⚠️ Nenhuma config activa para page_id: ${pageId}. Configs activas na BD:`, JSON.stringify(allConfigs || []));
            continue;
          }
        }

        const { org_id: orgId, access_token: rawToken, page_access_token: rawPageToken } = config;
        const accessToken = rawPageToken || rawToken;
        if (!accessToken) {
          console.error(`[FB WEBHOOK] ❌ Nenhum access token encontrado para org ${orgId} / page ${pageId}`);
          continue;
        }

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

        // Sincronizar com Google Sheets
        GoogleSheetsService.syncInteraction({
          orgId,
          channel: 'facebook',
          phoneOrId: senderId,
          name: `Cliente Facebook (${senderId})`,
          text: userText || '[media]',
          status: 'Ativo',
        }).catch(() => {});

        // Cancelar follow-ups pendentes
        FollowupService.cancelPendingForPhone(orgId, senderId).catch(() => {});

        // 4. Marcar visto e indicador de digitação
        FacebookService.markSeen(pageId, senderId, accessToken).catch(() => {});
        FacebookService.sendTypingIndicator(pageId, senderId, accessToken, 'typing_on').catch(() => {});

        // 5. PROTOCOLO DE SEGURANÇA E AUTO-CURA DA IA (Até 3 tentativas de recuperação)
        let aiResult: any = null;
        let sendSuccess = false;
        let lastErrorMsg = '';

        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            console.log(`[FB WEBHOOK] 🛡️ Tentativa ${attempt}/3 para sender=${senderId}...`);
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

            console.log(`[FB WEBHOOK] 🤖 IA respondeu (tentativa ${attempt}): "${(aiResult?.reply || '').substring(0, 100)}"`);

            if (!aiResult?.reply) {
              throw new Error('Resposta vazia gerada pela IA para o Facebook.');
            }

            // Enviar resposta via Facebook Graph API (lança erro se a Meta rejeitar)
            await FacebookService.sendMessage(pageId, senderId, aiResult.reply, accessToken);
            sendSuccess = true;
            console.log(`[FB WEBHOOK] ✅ Mensagem enviada com sucesso para sender=${senderId} na tentativa ${attempt}!`);

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
          console.error(`[FB WEBHOOK] ❌ Fluxo falhou após 3 tentativas para sender=${senderId}: ${lastErrorMsg}`);

          try {
            await supabaseAdmin.from('conversation_history').insert({
              org_id: orgId,
              customer_phone: senderId,
              sender: 'bot',
              text: `[ERRO INTERNO — NÃO ENVIADO AO CLIENTE]: ${lastErrorMsg}`,
              metadata: { platform: 'facebook', internal_error: true, needs_urgent_intervention: true },
            });
          } catch (_) {}

          try {
            getIo().to(`org:${orgId}`).emit('chat_error', {
              phone: senderId,
              error: lastErrorMsg,
              urgent: true,
              platform: 'facebook',
            });
          } catch (_) {}

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
        if (aiResult?.transfer || aiResult?.booking || aiResult?.proposal) {
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
          
          EmailService.sendAlertNotification(orgId, alertType, senderId, 'Cliente Facebook', userText).catch(e => console.error('[ALERTA FB] Erro ao enviar email:', e.message));
          
          PushService.sendAlertToOrg(orgId, {
            title: alertTitle,
            body:  alertBody,
            type:  alertType,
            url:   '/dashboard/live-chat',
          }).catch(e => console.error('[ALERTA FB] Erro ao enviar push:', e.message));

          try {
            const socketEvent = alertType === 'handover' ? 'handover_alert' : alertType === 'booking' ? 'booking_alert' : 'proposal_alert';
            getIo().to(`org:${orgId}`).emit(socketEvent, {
              phone: senderId,
              message: userText,
              type: alertType,
              platform: 'facebook'
            });
          } catch (_) {}
        }

        // ── Processamento de Agendamento ──
        if (aiResult?.bookingData) {
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

        if (sendSuccess && aiResult?.reply) {
          // 7. Persistir resposta do bot no histórico
          await supabaseAdmin.from('conversation_history').insert({
            org_id: orgId,
            customer_phone: senderId,
            sender: 'bot',
            text: aiResult.reply,
            metadata: { platform: 'facebook' },
          });

          // Ativar protocolo de follow-up
          if (!aiResult.transfer && !aiResult.booking) {
            FollowupService.scheduleSmartFollowup({
              orgId,
              phone:    senderId,
              platform: 'facebook',
              botReply: aiResult.reply,
            }).catch(() => {});
          }

          console.log(`[FB WEBHOOK] ✅ Fluxo completo para ${senderId}.`);
        }
      } // end for messaging loop
    } // end for entry loop
  } catch (err: any) {
    console.error('[FB WEBHOOK] Erro:', err.message);
  }
});

// ─── POST /api/facebook/comment-automation ────────────────────────────────────
router.post('/comment-automation', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const { enabled, private_reply, prompt } = req.body;

    const { data, error } = await supabaseAdmin
      .from('facebook_config')
      .update({
        comment_automation_enabled: enabled,
        comment_private_reply: private_reply !== false,
        comment_prompt: prompt || null,
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId)
      .select()
      .maybeSingle();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
