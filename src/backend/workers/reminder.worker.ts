// src/backend/workers/reminder.worker.ts
// Worker de lembretes que executa a cada 60 segundos e processa os alertas de agendamentos

import { supabaseAdmin } from '../config/supabase';
import { EmailService } from '../services/email.service';
import { TelcoSMSService } from '../services/telcosms.service';

async function runAppointmentReminders() {
  try {
    const nowIso = new Date().toISOString();

    // 1. Buscar lembretes pendentes cujo horário já passou
    const { data: dueReminders, error } = await supabaseAdmin
      .from('appointment_reminders')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', nowIso)
      .limit(50);

    if (error) {
      // Se a tabela ainda não existir em ambientes de dev, avisa silenciosamente
      if (!error.message.includes('relation "appointment_reminders" does not exist')) {
        console.error('[REMINDER WORKER] Erro ao consultar lembretes pendentes:', error.message);
      }
      return;
    }

    if (!dueReminders || dueReminders.length === 0) {
      return;
    }

    console.log(`[REMINDER WORKER] 🔔 ${dueReminders.length} lembrete(s) de agendamento a processar...`);

    for (const reminder of dueReminders) {
      try {
        const orgId = reminder.org_id;

        // Obter dados da organização
        const { data: org } = await supabaseAdmin
          .from('organizations')
          .select('name, phone, whatsapp, address, maps_link, telcosms_api_key, telcosms_sender_id')
          .eq('id', orgId)
          .maybeSingle();

        const companyName = org?.name?.trim() || 'Nossa Empresa';
        const companyPhone = org?.phone?.trim() || org?.whatsapp?.trim() || '';
        const companyAddress = org?.address?.trim() || '';
        const mapsLink = org?.maps_link?.trim() || '';

        let emailSuccess = false;
        let smsSuccess = false;
        const errors: string[] = [];

        // ── 1. Enviar Email se o cliente tiver e-mail cadastrado ──
        if (reminder.customer_email && (reminder.channels === 'email' || reminder.channels === 'both')) {
          try {
            console.log(`[REMINDER WORKER] ✉️ Enviando lembrete (${reminder.reminder_stage}) por e-mail para ${reminder.customer_email}...`);
            emailSuccess = await EmailService.sendBookingReminderToCustomer({
              customerEmail: reminder.customer_email,
              customerName: reminder.customer_name,
              date: reminder.appointment_date,
              time: reminder.appointment_time,
              subject: reminder.subject,
              reminderStage: reminder.reminder_stage as any,
              companyName,
              companyPhone,
              companyAddress,
              mapsLink,
            });
          } catch (eErr: any) {
            errors.push(`Email error: ${eErr.message}`);
          }
        }

        // ── 2. Enviar SMS se o cliente tiver telefone cadastrado ──
        if (reminder.customer_phone && (reminder.channels === 'sms' || reminder.channels === 'both')) {
          try {
            console.log(`[REMINDER WORKER] 📱 Enviando lembrete (${reminder.reminder_stage}) por SMS para ${reminder.customer_phone}...`);
            const smsRes = await TelcoSMSService.sendBookingReminderSMS({
              orgId,
              to: reminder.customer_phone,
              customerName: reminder.customer_name,
              date: reminder.appointment_date,
              time: reminder.appointment_time,
              subject: reminder.subject,
              reminderStage: reminder.reminder_stage as any,
              companyName,
              mapsLink,
            });
            smsSuccess = smsRes.success;
            if (!smsRes.success && smsRes.error) {
              errors.push(`SMS: ${smsRes.error}`);
            }
          } catch (sErr: any) {
            errors.push(`SMS error: ${sErr.message}`);
          }
        }

        // ── 3. Atualizar Status do Lembrete ──
        const isSent = emailSuccess || smsSuccess || errors.length === 0;
        await supabaseAdmin
          .from('appointment_reminders')
          .update({
            status: isSent ? 'sent' : 'failed',
            error_message: errors.length > 0 ? errors.join(' | ') : null,
            sent_at: new Date().toISOString(),
          })
          .eq('id', reminder.id);

        console.log(`[REMINDER WORKER] ✅ Lembrete ${reminder.id} (${reminder.reminder_stage}) processado: ${isSent ? 'ENVIADO' : 'FALHA'}`);

      } catch (itemErr: any) {
        console.error(`[REMINDER WORKER] Erro no item ${reminder.id}:`, itemErr.message);
        await supabaseAdmin
          .from('appointment_reminders')
          .update({
            status: 'failed',
            error_message: itemErr.message,
          })
          .eq('id', reminder.id);
      }
    }
  } catch (err: any) {
    console.error('[REMINDER WORKER] Erro global:', err.message);
  }
}

// Executar imediatamente ao iniciar, depois a cada 60 segundos
runAppointmentReminders();
const reminderWorkerInterval = setInterval(runAppointmentReminders, 60_000);

console.log('[REMINDER WORKER] ✅ Worker de lembretes e alertas automáticos iniciado (intervalo: 60s)');

export { reminderWorkerInterval };
