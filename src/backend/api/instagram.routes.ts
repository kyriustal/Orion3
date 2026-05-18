import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AIService } from '../services/ai.service';
import { InstagramService } from '../services/instagram.service';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'orion_secure_token_123';

// Dedup de mensagens Instagram processadas
const processedIgMessages = new Set<string>();
setInterval(() => processedIgMessages.clear(), 10 * 60 * 1000);

// ─── GET /api/instagram/config ────────────────────────────────────────────────
router.get('/config', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const { data, error } = await supabaseAdmin
      .from('instagram_config')
      .select('id, instagram_user_id, page_id, display_name, username, is_active, created_at')
      .eq('org_id', orgId)
      .maybeSingle();

    if (error) throw error;
    res.json(data || null);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/instagram/config — Guardar com validação automática ─────────────
router.post('/config', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const { access_token, display_name } = req.body;

    if (!access_token) {
      return res.status(400).json({ error: 'access_token é obrigatório.' });
    }

    // Validar token e obter Instagram Business Account ID automaticamente
    const igInfo = await InstagramService.validateAndGetIgId(access_token);

    if (!igInfo) {
      return res.status(400).json({
        error: 'Não foi possível encontrar uma conta Instagram Business ligada a este token.',
        details: 'Certifique-se que: (1) A sua conta Instagram está no modo Business/Creator; (2) Está ligada a uma Facebook Page; (3) O token tem as permissões: instagram_manage_messages, pages_messaging.',
      });
    }

    const { data, error } = await supabaseAdmin
      .from('instagram_config')
      .upsert({
        org_id:             orgId,
        instagram_user_id:  igInfo.igUserId,
        access_token,
        display_name:       display_name || igInfo.username,
        username:           igInfo.username,
        is_active:          true,
        updated_at:         new Date().toISOString(),
      }, { onConflict: 'org_id' })
      .select()
      .single();

    if (error) throw error;

    console.log(`[INSTAGRAM] Configuração guardada para @${igInfo.username} (ID: ${igInfo.igUserId})`);
    res.json({
      message: `Instagram conectado com sucesso! @${igInfo.username}`,
      data,
    });
  } catch (err: any) {
    console.error('[INSTAGRAM] Erro ao guardar config:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/instagram/config — Desconectar Instagram ─────────────────────
router.delete('/config', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.orgId;
    const { error } = await supabaseAdmin
      .from('instagram_config')
      .update({ is_active: false })
      .eq('org_id', orgId);

    if (error) throw error;
    res.json({ message: 'Instagram desconectado.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/instagram/webhook — Verificação Meta ────────────────────────────
router.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[INSTAGRAM WEBHOOK] Verificado com sucesso.');
    res.status(200).send(challenge);
  } else {
    console.warn('[INSTAGRAM WEBHOOK] Token inválido na verificação.');
    res.sendStatus(403);
  }
});

// ─── POST /api/instagram/webhook — Recepção de DMs ────────────────────────────
router.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Responder imediatamente à Meta

  try {
    const body = req.body;

    // Suportar tanto object='instagram' quanto page (Meta pode enviar ambos)
    if (body.object !== 'instagram' && body.object !== 'page') return;

    for (const entry of (body.entry || [])) {
      const messaging = entry.messaging?.[0];
      if (!messaging) continue;

      const message = messaging.message;
      if (!message) continue;

      // Ignorar echoes (mensagens enviadas pelo próprio agente)
      if (message.is_echo) continue;

      const messageId  = message.mid;
      const senderId   = messaging.sender?.id;
      const recipientId = messaging.recipient?.id; // Este é o Instagram User ID da nossa página

      if (!messageId || !senderId || !recipientId) continue;

      // Dedup
      if (processedIgMessages.has(messageId)) {
        console.log(`[INSTAGRAM WEBHOOK] Mensagem ${messageId} já processada. Ignorando.`);
        continue;
      }
      processedIgMessages.add(messageId);

      const userText = message.text || '';
      const attachments = message.attachments || [];

      console.log(`[INSTAGRAM WEBHOOK] Nova DM de ${senderId} para página ${recipientId}`);

      // 1. Buscar configuração pelo Instagram User ID da página
      const { data: config } = await supabaseAdmin
        .from('instagram_config')
        .select('org_id, access_token, display_name, instagram_user_id')
        .eq('instagram_user_id', recipientId)
        .eq('is_active', true)
        .maybeSingle();

      if (!config) {
        console.warn(`[INSTAGRAM WEBHOOK] Nenhuma config activa para ig_user_id: ${recipientId}`);
        continue;
      }

      const { org_id: orgId, access_token: accessToken, instagram_user_id: igUserId } = config;

      // Buscar nome personalizado (chatbot_name)
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('chatbot_name')
        .eq('id', orgId)
        .maybeSingle();

      const botName = org?.chatbot_name || config.display_name || 'Assistente';

      // 2. Determinar o texto da mensagem
      let messageText = userText;
      if (!messageText && attachments.length > 0) {
        const att = attachments[0];
        if (att.type === 'image')  messageText = '(Imagem enviada)';
        else if (att.type === 'video')  messageText = '(Vídeo enviado)';
        else if (att.type === 'audio')  messageText = '(Áudio enviado)';
        else if (att.type === 'story_mention') messageText = '(Mencionou o seu story)';
        else if (att.type === 'share')  messageText = `(Conteúdo partilhado: ${att.payload?.url || ''})`;
        else messageText = '(Anexo recebido)';
      }

      if (!messageText) continue;

      // 3. Buscar histórico das últimas 24h (max 50 mensagens)
      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: dbHistory } = await supabaseAdmin
        .from('conversation_history')
        .select('sender, text')
        .eq('org_id', orgId)
        .eq('customer_phone', senderId)
        .gte('created_at', last24h)
        .order('created_at', { ascending: false })
        .limit(50);

      const history = (dbHistory || []).reverse().map(h => ({
        sender: h.sender as 'user' | 'bot' | 'human',
        text:   h.text,
      }));

      // 4. Persistir mensagem do utilizador
      await supabaseAdmin.from('conversation_history').insert({
        org_id:         orgId,
        customer_phone: senderId,
        sender:         'user',
        text:           messageText,
        metadata:       { platform: 'instagram', message_id: messageId },
      });

      // 5. Mark seen + typing indicator
      await InstagramService.markSeen(igUserId, senderId, accessToken);
      await InstagramService.sendTypingIndicator(igUserId, senderId, accessToken, 'typing_on');

      // 6. Gerar resposta com IA (Gemini 2.5 Flash)
      let aiReply = '';
      let transfer = false;

      try {
        const aiResult = await AIService.generateResponse({
          message: messageText,
          orgId,
          history,
          botName:  botName || 'Assistente',
          mode:     'simulation',
        });

        aiReply  = aiResult.reply;
        transfer = aiResult.transfer;
      } catch (aiErr: any) {
        console.error(`[INSTAGRAM IA] Erro ao gerar resposta: ${aiErr.message}`);
        aiReply = 'Desculpe, tive um problema técnico temporário. Por favor tente novamente em breve.';
      }

      // 7. Enviar resposta via Instagram DM
      await InstagramService.sendMessage(igUserId, senderId, aiReply, accessToken);

      // 8. Persistir resposta do bot
      await supabaseAdmin.from('conversation_history').insert({
        org_id:         orgId,
        customer_phone: senderId,
        sender:         'bot',
        text:           aiReply,
        metadata:       { platform: 'instagram' },
      });

      console.log(`[INSTAGRAM] Resposta enviada para ${senderId}. Transfer: ${transfer}`);
    }
  } catch (err: any) {
    console.error('[INSTAGRAM WEBHOOK] Erro fatal:', err.message);
  }
});

export default router;
