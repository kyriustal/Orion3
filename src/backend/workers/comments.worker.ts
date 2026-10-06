/**
 * comments.worker.ts — Worker de polling de comentários para Facebook, Instagram e TikTok
 *
 * Executa a cada 2 minutos, verifica comentários novos em todas as orgs configuradas,
 * gera respostas via IA e publica nos respectivos canais.
 *
 * Dedup: controla comentários já processados via Set em memória (limpo a cada hora)
 * e coluna `processed_comment_ids` na tabela de config de cada canal.
 */

import { supabaseAdmin } from '../config/supabase';
import { AIService } from '../services/ai.service';
import { FacebookCommentsService } from '../services/facebook_comments.service';
import { InstagramCommentsService } from '../services/instagram_comments.service';
import { TikTokService } from '../services/tiktok.service';
import { getIo } from '../socket';

const POLL_INTERVAL_MS   = 2 * 60 * 1000;  // 2 minutos
const DEDUP_CLEAR_MS     = 60 * 60 * 1000; // 1 hora

// Set de dedup em memória: "platform:orgId:commentId"
const processedComments = new Set<string>();
setInterval(() => processedComments.clear(), DEDUP_CLEAR_MS);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOrgBotName(orgId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('organizations')
    .select('chatbot_name')
    .eq('id', orgId)
    .maybeSingle();
  return data?.chatbot_name || 'Assistente';
}

async function getCommentHistory(orgId: string, commenterId: string, platform: string) {
  const { data } = await supabaseAdmin
    .from('conversation_history')
    .select('sender, text')
    .eq('org_id', orgId)
    .eq('customer_phone', `${platform}:${commenterId}`)
    .order('created_at', { ascending: false })
    .limit(20);
  return (data || []).reverse().map(h => ({ sender: h.sender as 'user' | 'bot', text: h.text }));
}

async function saveComment(orgId: string, commenterId: string, platform: string, sender: 'user' | 'bot', text: string, meta?: any) {
  await supabaseAdmin.from('conversation_history').insert({
    org_id: orgId,
    customer_phone: `${platform}:${commenterId}`,
    sender,
    text,
    metadata: { platform, comment_automation: true, ...meta },
  });
}

async function emitToPanel(orgId: string, platform: string, commenterId: string, text: string, sender: 'user' | 'bot') {
  try {
    getIo().to(`org:${orgId}`).emit('new_message', {
      phone: `${platform}:${commenterId}`,
      sender,
      text,
      time: new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
      timestamp: new Date().toISOString(),
      platform,
    });
  } catch (_) {}
}

async function generateAiReply(orgId: string, commenterId: string, platform: string, commentText: string, botName: string) {
  const history = await getCommentHistory(orgId, commenterId, platform);

  const contextMessage = `[Comentário num ${platform === 'facebook' ? 'post do Facebook' : platform === 'instagram' ? 'post do Instagram' : 'vídeo do TikTok'}]: ${commentText}`;

  const aiResult = await AIService.generateResponse({
    message: contextMessage,
    orgId,
    history,
    botName,
    mode: 'simulation',
  });

  return aiResult?.reply || null;
}

// ─── Facebook Comments ────────────────────────────────────────────────────────

async function pollFacebookComments() {
  try {
    const { data: configs } = await supabaseAdmin
      .from('facebook_config')
      .select('org_id, page_id, access_token, comment_automation_enabled')
      .eq('is_active', true)
      .eq('comment_automation_enabled', true);

    if (!configs?.length) return;

    for (const config of configs) {
      const { org_id: orgId, page_id: pageId, access_token: accessToken } = config;
      const botName = await getOrgBotName(orgId);

      try {
        // Buscar posts recentes da página
        const { data: postsRes } = await (await import('axios')).default.get(
          `https://graph.facebook.com/v19.0/${pageId}/feed`,
          {
            params: {
              fields: 'id,comments{id,from,message,created_time}',
              limit: 5,
              access_token: accessToken,
            },
            timeout: 15_000,
          }
        );

        const posts = postsRes?.data || [];
        for (const post of posts) {
          const comments = post.comments?.data || [];
          for (const comment of comments) {
            const dedupKey = `facebook:${orgId}:${comment.id}`;
            if (processedComments.has(dedupKey)) continue;
            processedComments.add(dedupKey);

            const commentText = comment.message?.trim();
            if (!commentText) continue;

            const commenterId = comment.from?.id || 'unknown';
            const commenterName = comment.from?.name || 'Cliente';

            console.log(`[FB-COMMENTS-WORKER] Novo comentário de ${commenterName}: "${commentText.substring(0, 60)}"`);

            // Salvar mensagem do utilizador
            await saveComment(orgId, commenterId, 'facebook', 'user', commentText, { comment_id: comment.id, post_id: post.id, commenter_name: commenterName });
            await emitToPanel(orgId, 'facebook_comment', commenterId, commentText, 'user');

            // Gerar resposta IA
            const reply = await generateAiReply(orgId, commenterId, 'facebook', commentText, botName);
            if (!reply) continue;

            // Responder publicamente ao comentário
            const sent = await FacebookCommentsService.replyToComment(comment.id, reply, accessToken);
            if (sent) {
              await saveComment(orgId, commenterId, 'facebook', 'bot', reply, { comment_id: comment.id, post_id: post.id });
              await emitToPanel(orgId, 'facebook_comment', commenterId, reply, 'bot');
              console.log(`[FB-COMMENTS-WORKER] ✅ Reply publicado para ${commenterName}`);
            }
          }
        }
      } catch (orgErr: any) {
        console.error(`[FB-COMMENTS-WORKER] Erro na org ${orgId}:`, orgErr.message);
      }
    }
  } catch (err: any) {
    console.error('[FB-COMMENTS-WORKER] Erro geral:', err.message);
  }
}

// ─── Instagram Comments ───────────────────────────────────────────────────────

async function pollInstagramComments() {
  try {
    const { data: configs } = await supabaseAdmin
      .from('instagram_config')
      .select('org_id, instagram_user_id, access_token, comment_automation_enabled')
      .eq('is_active', true)
      .eq('comment_automation_enabled', true);

    if (!configs?.length) return;

    for (const config of configs) {
      const { org_id: orgId, instagram_user_id: igUserId, access_token: accessToken } = config;
      const botName = await getOrgBotName(orgId);

      try {
        // Buscar posts recentes
        const axiosInstance = (await import('axios')).default;
        const mediaRes = await axiosInstance.get(
          `https://graph.facebook.com/v19.0/${igUserId}/media`,
          {
            params: {
              fields: 'id,comments{id,from,text,timestamp}',
              limit: 5,
              access_token: accessToken,
            },
            timeout: 15_000,
          }
        );

        const posts = mediaRes.data?.data || [];
        for (const post of posts) {
          const comments = post.comments?.data || [];
          for (const comment of comments) {
            const dedupKey = `instagram:${orgId}:${comment.id}`;
            if (processedComments.has(dedupKey)) continue;
            processedComments.add(dedupKey);

            const commentText = comment.text?.trim();
            if (!commentText) continue;

            const commenterId = comment.from?.id || 'unknown';
            const commenterName = comment.from?.username || 'Cliente';

            console.log(`[IG-COMMENTS-WORKER] Novo comentário de @${commenterName}: "${commentText.substring(0, 60)}"`);

            await saveComment(orgId, commenterId, 'instagram', 'user', commentText, { comment_id: comment.id, post_id: post.id, commenter_name: commenterName });
            await emitToPanel(orgId, 'instagram_comment', commenterId, commentText, 'user');

            const reply = await generateAiReply(orgId, commenterId, 'instagram', commentText, botName);
            if (!reply) continue;

            const sent = await InstagramCommentsService.replyToComment(comment.id, reply, accessToken);
            if (sent) {
              await saveComment(orgId, commenterId, 'instagram', 'bot', reply, { comment_id: comment.id, post_id: post.id });
              await emitToPanel(orgId, 'instagram_comment', commenterId, reply, 'bot');
              console.log(`[IG-COMMENTS-WORKER] ✅ Reply publicado para @${commenterName}`);
            }
          }
        }
      } catch (orgErr: any) {
        console.error(`[IG-COMMENTS-WORKER] Erro na org ${orgId}:`, orgErr.message);
      }
    }
  } catch (err: any) {
    console.error('[IG-COMMENTS-WORKER] Erro geral:', err.message);
  }
}

// ─── TikTok Comments ──────────────────────────────────────────────────────────

async function pollTikTokComments() {
  try {
    const { data: configs } = await supabaseAdmin
      .from('tiktok_config')
      .select('org_id, open_id, comment_automation_enabled')
      .eq('is_active', true)
      .eq('comment_automation_enabled', true);

    if (!configs?.length) return;

    for (const config of configs) {
      const { org_id: orgId, open_id: openId } = config;
      const botName = await getOrgBotName(orgId);

      try {
        const tokenData = await TikTokService.getValidToken(orgId);
        if (!tokenData) continue;

        const { access_token: accessToken } = tokenData;

        // Buscar vídeos recentes
        const videos = await TikTokService.listVideos(openId, accessToken, 5);

        for (const video of videos) {
          const { comments } = await TikTokService.getComments(video.id, accessToken);

          for (const comment of comments) {
            const dedupKey = `tiktok:${orgId}:${comment.id}`;
            if (processedComments.has(dedupKey)) continue;
            processedComments.add(dedupKey);

            const commentText = comment.text?.trim();
            if (!commentText) continue;

            const commenterId = comment.user?.open_id || comment.id;
            const commenterName = comment.user?.display_name || 'Utilizador TikTok';

            console.log(`[TIKTOK-WORKER] Novo comentário de ${commenterName}: "${commentText.substring(0, 60)}"`);

            await saveComment(orgId, commenterId, 'tiktok', 'user', commentText, { comment_id: comment.id, video_id: video.id, commenter_name: commenterName });
            await emitToPanel(orgId, 'tiktok_comment', commenterId, commentText, 'user');

            const reply = await generateAiReply(orgId, commenterId, 'tiktok', commentText, botName);
            if (!reply) continue;

            const sent = await TikTokService.replyToComment(video.id, comment.id, reply, accessToken);
            if (sent) {
              await saveComment(orgId, commenterId, 'tiktok', 'bot', reply, { comment_id: comment.id, video_id: video.id });
              await emitToPanel(orgId, 'tiktok_comment', commenterId, reply, 'bot');
              console.log(`[TIKTOK-WORKER] ✅ Reply publicado para ${commenterName}`);
            }
          }
        }
      } catch (orgErr: any) {
        console.error(`[TIKTOK-WORKER] Erro na org ${orgId}:`, orgErr.message);
      }
    }
  } catch (err: any) {
    console.error('[TIKTOK-WORKER] Erro geral:', err.message);
  }
}

// ─── Main Loop ────────────────────────────────────────────────────────────────

async function runPolling() {
  console.log('[COMMENTS-WORKER] ▶ Iniciando ciclo de polling de comentários...');
  await Promise.allSettled([
    pollFacebookComments(),
    pollInstagramComments(),
    pollTikTokComments(),
  ]);
}

// Executar imediatamente e depois a cada POLL_INTERVAL_MS
runPolling().catch(err => console.error('[COMMENTS-WORKER] Erro no ciclo inicial:', err.message));
setInterval(() => {
  runPolling().catch(err => console.error('[COMMENTS-WORKER] Erro no ciclo periódico:', err.message));
}, POLL_INTERVAL_MS);

console.log(`[COMMENTS-WORKER] 🚀 Worker de comentários iniciado. Polling a cada ${POLL_INTERVAL_MS / 1000}s`);
