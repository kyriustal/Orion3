// src/backend/workers/followup.worker.ts
// Worker que executa a cada minuto e dispara follow-ups agendados

import { FollowupService } from '../services/followup.service';
import { AIService }       from '../services/ai.service';
import { WhatsAppService } from '../services/whatsapp.service';
import { FacebookService } from '../services/facebook.service';
import { supabaseAdmin }   from '../config/supabase';

async function runFollowups() {
  try {
    const due = await FollowupService.getDue();
    if (due.length === 0) return;

    console.log(`[FOLLOWUP WORKER] ${due.length} follow-up(s) a processar...`);

    for (const item of due) {
      try {
        // ── 1. Verificar se o cliente respondeu depois do momento agendado ──
        const replied = await FollowupService.clientRepliedAfter(
          item.org_id,
          item.customer_phone,
          item.scheduled_at
        );

        if (replied) {
          console.log(`[FOLLOWUP] Cliente ${item.customer_phone} respondeu. Cancelando follow-up ${item.id}.`);
          await FollowupService.setStatus(item.id, 'cancelled');
          continue;
        }

        // ── 2. Buscar configurações da organização (token de acesso) ─────────
        let accessToken = '';
        let phoneNumberId = '';
        let pageId = '';

        if (item.platform === 'whatsapp') {
          const { data: waCfg } = await supabaseAdmin
            .from('whatsapp_config')
            .select('access_token, phone_number_id')
            .eq('org_id', item.org_id)
            .eq('is_active', true)
            .maybeSingle();

          if (!waCfg) {
            console.warn(`[FOLLOWUP] Nenhuma config WhatsApp para org ${item.org_id}. Ignorando.`);
            continue;
          }
          accessToken   = waCfg.access_token;
          phoneNumberId = waCfg.phone_number_id;

        } else {
          const { data: fbCfg } = await supabaseAdmin
            .from('facebook_config')
            .select('access_token, page_id')
            .eq('org_id', item.org_id)
            .eq('is_active', true)
            .maybeSingle();

          if (!fbCfg) {
            console.warn(`[FOLLOWUP] Nenhuma config Facebook para org ${item.org_id}. Ignorando.`);
            continue;
          }
          accessToken = fbCfg.access_token;
          pageId      = fbCfg.page_id;
        }

        // ── 3. Buscar nome do bot ─────────────────────────────────────────────
        const { data: orgData } = await supabaseAdmin
          .from('organizations')
          .select('chatbot_name')
          .eq('id', item.org_id)
          .maybeSingle();

        const botName = orgData?.chatbot_name || 'Assistente';

        // ── 4. Buscar histórico (contexto da conversa) ────────────────────────
        const history = await FollowupService.fetchContext(item.org_id, item.customer_phone);

        // ── 5. Montar prompt de follow-up ─────────────────────────────────────
        const lastUserMsg = history.filter(m => m.sender === 'user').pop()?.text ?? '';
        const basePrompt  = item.custom_prompt
          ? item.custom_prompt
          : 'Olá! Vi que ainda não recebemos a sua resposta. Posso ajudar com alguma dúvida?';

        const prompt = item.custom_prompt
          ? basePrompt                            // prompt personalizado já serve como mensagem
          : `${basePrompt}\n\n[Última mensagem do cliente]: ${lastUserMsg}`;

        // ── 6. Gerar resposta com IA ──────────────────────────────────────────
        console.log(`[FOLLOWUP] Gerando resposta IA para ${item.customer_phone} (${item.platform})...`);
        const aiResult = await AIService.generateResponse({
          message:  prompt,
          orgId:    item.org_id,
          history,
          botName,
          mode:     'simulation',
        });

        // ── 7. Enviar mensagem pelo canal correto ─────────────────────────────
        if (item.platform === 'whatsapp') {
          await WhatsAppService.sendTextMessage(
            phoneNumberId,
            item.customer_phone,
            aiResult.reply,
            accessToken
          );
        } else {
          await FacebookService.sendMessage(
            pageId,
            item.customer_phone,
            aiResult.reply,
            accessToken
          );
        }

        // ── 8. Persistir resposta no histórico ────────────────────────────────
        await supabaseAdmin.from('conversation_history').insert({
          org_id:         item.org_id,
          customer_phone: item.customer_phone,
          sender:         'bot',
          text:           aiResult.reply,
          metadata:       { platform: item.platform, followup_id: item.id, type: 'followup' },
        });

        // ── 9. Marcar como enviado ────────────────────────────────────────────
        await FollowupService.setStatus(item.id, 'sent');
        console.log(`[FOLLOWUP] ✅ Follow-up enviado para ${item.customer_phone} (${item.platform})`);

      } catch (itemErr: any) {
        console.error(`[FOLLOWUP] Erro no item ${item.id}:`, itemErr.message);
      }
    }
  } catch (err: any) {
    console.error('[FOLLOWUP WORKER] Erro global:', err.message);
  }
}

// Executar imediatamente ao iniciar, depois a cada 60 segundos
runFollowups();
const workerInterval = setInterval(runFollowups, 60_000);

console.log('[FOLLOWUP WORKER] ✅ Worker de follow-up iniciado (intervalo: 60s)');

export { workerInterval };
