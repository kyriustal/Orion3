/**
 * email_inbox.worker.ts — Worker de polling de e-mails recebidos
 *
 * Executa a cada 3 minutos, busca e-mails não lidos no IMAP de cada org configurada,
 * gera respostas com IA e envia via SMTP mantendo o threading.
 */

import { supabaseAdmin } from '../config/supabase';
import { AIService } from '../services/ai.service';
import { EmailInboxService } from '../services/email_inbox.service';
import { getIo } from '../socket';

const POLL_INTERVAL_MS = 3 * 60 * 1000; // 3 minutos

// Dedup: "orgId:messageId" — limpo a cada 2h
const processedEmails = new Set<string>();
setInterval(() => processedEmails.clear(), 2 * 60 * 60 * 1000);

async function getOrgBotName(orgId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('organizations')
    .select('chatbot_name')
    .eq('id', orgId)
    .maybeSingle();
  return data?.chatbot_name || 'Assistente';
}

async function pollEmailInboxes() {
  console.log('[EMAIL-WORKER] ▶ Verificando caixas de entrada...');

  try {
    const { data: configs } = await supabaseAdmin
      .from('email_inbox_config')
      .select('*')
      .eq('is_active', true)
      .eq('automation_enabled', true);

    if (!configs?.length) return;

    for (const config of configs) {
      const orgId = config.org_id;

      try {
        const emails = await EmailInboxService.fetchUnreadEmails({
          host: config.imap_host,
          port: config.imap_port || 993,
          user: config.imap_user,
          password: config.imap_password,
          tls: config.imap_tls !== false,
        });

        if (!emails.length) continue;

        console.log(`[EMAIL-WORKER] ${emails.length} email(s) não lido(s) para org ${orgId}`);
        const botName = await getOrgBotName(orgId);

        for (const email of emails) {
          const dedupKey = `${orgId}:${email.messageId}`;
          if (processedEmails.has(dedupKey)) continue;
          processedEmails.add(dedupKey);

          const emailerId = email.fromAddress;
          const conversationId = `email:${emailerId}`;

          // Buscar histórico de conversa por e-mail
          const { data: dbHistory } = await supabaseAdmin
            .from('conversation_history')
            .select('sender, text')
            .eq('org_id', orgId)
            .eq('customer_phone', conversationId)
            .order('created_at', { ascending: false })
            .limit(30);

          const history = (dbHistory || []).reverse().map(h => ({
            sender: h.sender as 'user' | 'bot',
            text: h.text,
          }));

          // Salvar email do utilizador
          await supabaseAdmin.from('conversation_history').insert({
            org_id: orgId,
            customer_phone: conversationId,
            sender: 'user',
            text: email.text,
            metadata: {
              platform: 'email',
              message_id: email.messageId,
              subject: email.subject,
              from_name: email.from,
              from_address: emailerId,
            },
          }).catch(() => {});

          // Emitir para o Live Chat
          try {
            getIo().to(`org:${orgId}`).emit('new_message', {
              phone: conversationId,
              sender: 'user',
              text: `📧 [Email] ${email.subject}\n\n${email.text}`,
              time: new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
              timestamp: new Date().toISOString(),
              platform: 'email',
              metadata: { subject: email.subject, from_name: email.from },
            });
          } catch (_) {}

          // Gerar resposta IA com contexto de email
          const contextMessage = `[E-mail recebido]\nDe: ${email.from} (${emailerId})\nAssunto: ${email.subject}\n\n${email.text}`;

          let aiResult: any = null;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              if (attempt > 1) await new Promise(r => setTimeout(r, attempt * 1500));
              aiResult = await AIService.generateResponse({
                message: contextMessage,
                orgId,
                history,
                botName,
                mode: 'simulation',
              });
              if (aiResult?.reply) break;
            } catch (_) {}
          }

          if (!aiResult?.reply) {
            console.warn(`[EMAIL-WORKER] IA falhou para email de ${emailerId}`);
            continue;
          }

          // Enviar resposta via SMTP
          const sent = await EmailInboxService.sendReply({
            smtpHost: config.smtp_host || config.imap_host,
            smtpPort: config.smtp_port || 587,
            smtpUser: config.smtp_user || config.imap_user,
            smtpPass: config.smtp_password || config.imap_password,
            smtpFrom: config.smtp_from || config.imap_user,
            to: emailerId,
            subject: email.subject,
            body: aiResult.reply,
            inReplyTo: email.messageId,
            references: [email.references, email.messageId].filter(Boolean).join(' '),
          });

          if (sent) {
            // Salvar resposta do bot
            await supabaseAdmin.from('conversation_history').insert({
              org_id: orgId,
              customer_phone: conversationId,
              sender: 'bot',
              text: aiResult.reply,
              metadata: {
                platform: 'email',
                subject: email.subject,
                to_address: emailerId,
                in_reply_to: email.messageId,
              },
            }).catch(() => {});

            // Emitir para Live Chat
            try {
              getIo().to(`org:${orgId}`).emit('new_message', {
                phone: conversationId,
                sender: 'bot',
                text: aiResult.reply,
                time: new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
                timestamp: new Date().toISOString(),
                platform: 'email',
              });
            } catch (_) {}

            console.log(`[EMAIL-WORKER] ✅ Resposta enviada para ${emailerId}`);
          }
        }
      } catch (orgErr: any) {
        console.error(`[EMAIL-WORKER] Erro na org ${orgId}:`, orgErr.message);
      }
    }
  } catch (err: any) {
    console.error('[EMAIL-WORKER] Erro geral:', err.message);
  }
}

// Executar imediatamente e depois periódico
pollEmailInboxes().catch(err => console.error('[EMAIL-WORKER] Erro no ciclo inicial:', err.message));
setInterval(() => {
  pollEmailInboxes().catch(err => console.error('[EMAIL-WORKER] Erro no ciclo periódico:', err.message));
}, POLL_INTERVAL_MS);

console.log(`[EMAIL-WORKER] 🚀 Worker de e-mail iniciado. Polling a cada ${POLL_INTERVAL_MS / 1000}s`);
