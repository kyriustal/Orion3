import { supabaseAdmin } from '../config/supabase';
import { createGoogleCalendarEvent } from './calendar.service';
import { EmailService } from './email.service';
import { TelcoSMSService } from './telcosms.service';

export interface BookingValidationInput {
  name?: string;
  subject?: string;
  phone?: string;
  email?: string;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:mm or HH:mm:ss
}

export interface BookingValidationResult {
  isValid: boolean;
  missingFields: string[];
  errorMessage?: string;
  cleanData?: {
    name: string;
    subject: string;
    phone?: string;
    email?: string;
    date: string;
    time: string;
  };
}

export interface ProcessBookingResult {
  success: boolean;
  bookingId?: string;
  calendarEventId?: string;
  calendarHtmlLink?: string;
  alertsScheduled: number;
  instantEmailSent?: boolean;
  instantSmsSent?: boolean;
  error?: string;
}

export class BookingService {
  /**
   * Valida estritamente se todos os 5 dados obrigatórios foram fornecidos:
   * 1. Nome do cliente
   * 2. Assunto / Serviço
   * 3. Pelo menos um contacto válido (Telefone OU E-mail)
   * 4. Dia / Data válida (YYYY-MM-DD)
   * 5. Hora válida (HH:MM)
   */
  static validateBookingData(input: BookingValidationInput): BookingValidationResult {
    const missingFields: string[] = [];

    const name = (input.name || '').trim();
    if (!name || name.length < 2) {
      missingFields.push('Nome do cliente');
    }

    const subject = (input.subject || '').trim();
    if (!subject || subject.length < 2) {
      missingFields.push('Assunto / Serviço');
    }

    const email = (input.email || '').trim().toLowerCase();
    const hasValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    const phoneRaw = (input.phone || '').trim();
    const phoneClean = phoneRaw.replace(/[^\d+]/g, '');
    const hasValidPhone = phoneClean.length >= 8;

    if (!hasValidEmail && !hasValidPhone) {
      missingFields.push('Contacto (Telefone ou E-mail válido)');
    }

    const date = (input.date || '').trim();
    const isoDateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    let hasValidDate = false;
    if (isoDateMatch) {
      const year = parseInt(isoDateMatch[1], 10);
      const month = parseInt(isoDateMatch[2], 10);
      const day = parseInt(isoDateMatch[3], 10);
      if (year >= 2024 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        hasValidDate = true;
      }
    }
    if (!hasValidDate) {
      missingFields.push('Data válida (formato YYYY-MM-DD)');
    }

    let time = (input.time || '').trim();
    if (time.length === 5) {
      time = `${time}:00`;
    }
    const timeMatch = time.match(/^([0-1]?[0-9]|2[0-3]):([0-5][0-9])(:[0-5][0-9])?$/);
    if (!timeMatch) {
      missingFields.push('Hora válida (formato HH:MM)');
    } else {
      time = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
    }

    if (missingFields.length > 0) {
      return {
        isValid: false,
        missingFields,
        errorMessage: `Não é possível agendar. Campos obrigatórios em falta: ${missingFields.join(', ')}.`,
      };
    }

    return {
      isValid: true,
      missingFields: [],
      cleanData: {
        name,
        subject,
        email: hasValidEmail ? email : undefined,
        phone: hasValidPhone ? phoneClean : undefined,
        date,
        time,
      },
    };
  }

  /**
   * Valida se a data e hora do agendamento estão dentro do horário de atividade da empresa.
   */
  static async checkWithinBusinessHours(orgId: string, dateStr: string, timeStr: string): Promise<{ isValid: boolean; reason?: string }> {
    try {
      const [year, month, day] = dateStr.split('-').map(Number);
      const dateObj = new Date(year, month - 1, day);
      const dayOfWeek = dateObj.getDay(); // 0 = Domingo, 1 = Segunda, etc.

      // Procurar horários configurados no banco
      const { data: schedule, error } = await supabaseAdmin
        .from('business_hours')
        .select('is_open, open_time, close_time')
        .eq('org_id', orgId)
        .eq('day_of_week', dayOfWeek)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.warn('[BookingService] Erro ao buscar business_hours:', error.message);
      }

      // Horários padrão se não estiverem configurados no banco de dados
      const defaultSchedule = {
        0: { is_open: false, open_time: '08:00', close_time: '12:00' }, // Domingo
        1: { is_open: true,  open_time: '08:00', close_time: '18:00' }, // Segunda
        2: { is_open: true,  open_time: '08:00', close_time: '18:00' }, // Terça
        3: { is_open: true,  open_time: '08:00', close_time: '18:00' }, // Quarta
        4: { is_open: true,  open_time: '08:00', close_time: '18:00' }, // Quinta
        5: { is_open: true,  open_time: '08:00', close_time: '18:00' }, // Sexta
        6: { is_open: true,  open_time: '08:00', close_time: '13:00' }, // Sábado
      }[dayOfWeek as 0|1|2|3|4|5|6];

      const is_open = schedule ? schedule.is_open : defaultSchedule.is_open;
      const open_time = schedule?.open_time || defaultSchedule.open_time;
      const close_time = schedule?.close_time || defaultSchedule.close_time;

      const dayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
      const dayName = dayNames[dayOfWeek];

      if (!is_open) {
        return { isValid: false, reason: `A empresa está fechada ao ${dayName}.` };
      }

      const cleanTime = timeStr.substring(0, 5);
      const cleanOpen = open_time.substring(0, 5);
      const cleanClose = close_time.substring(0, 5);

      if (cleanTime < cleanOpen || cleanTime > cleanClose) {
        return {
          isValid: false,
          reason: `Horário de agendamento (${cleanTime}) fora do expediente de ${dayName} (${cleanOpen} às ${cleanClose}).`
        };
      }

      return { isValid: true };
    } catch (err: any) {
      console.warn('[BookingService] Erro na validação de horário comercial (fallback para válido):', err.message);
      return { isValid: true };
    }
  }

  /**
   * Gera uma hora aleatória no horário comercial (entre 08:00 e 17:00) para envio nos dias anteriores
   */
  private static getRandomBusinessHour(targetDate: Date): Date {
    const scheduled = new Date(targetDate);
    // Hora aleatória entre 8 e 16 (ex: 8h34, 14h15, 16h48)
    const randomHour = 8 + Math.floor(Math.random() * 9); // 8 a 16
    const randomMinute = Math.floor(Math.random() * 60);
    const randomSecond = Math.floor(Math.random() * 60);
    scheduled.setHours(randomHour, randomMinute, randomSecond, 0);
    return scheduled;
  }

  /**
   * Processa o agendamento completo:
   * 1. Valida todos os dados obrigatórios
   * 2. Salva na base de dados (tabela bookings) evitando duplicações
   * 3. Sincroniza com o Google Calendar sem duplicar eventos
   * 4. Envia alerta instantâneo (E-mail e/ou SMS)
   * 5. Programa alertas de 7 dias antes (horário comercial aleatório 08h-17h), 72h antes (horário comercial 08h-17h) e no dia às 07:00
   */
  static async processBooking(
    orgId: string,
    input: BookingValidationInput,
    options?: { channelOrigin?: string }
  ): Promise<ProcessBookingResult> {
    const validation = this.validateBookingData(input);
    if (!validation.isValid || !validation.cleanData) {
      console.warn(`[BookingService] ⚠️ Tentativa de agendamento rejeitada por falta de dados: ${validation.errorMessage}`);
      return {
        success: false,
        alertsScheduled: 0,
        error: validation.errorMessage,
      };
    }

    const { name, subject, phone, email, date, time } = validation.cleanData;

    // Validar horário de expediente
    const bhCheck = await this.checkWithinBusinessHours(orgId, date, time);
    if (!bhCheck.isValid) {
      console.warn(`[BookingService] ⚠️ Rejeitando agendamento fora do expediente: ${bhCheck.reason}`);
      return {
        success: false,
        alertsScheduled: 0,
        error: bhCheck.reason,
      };
    }

    console.log(`[BookingService] 📅 Processando agendamento para ${name} | Data: ${date} ${time} | Assunto: ${subject} | Org: ${orgId}`);

    // Obter dados da organização para o remetente, telefone e localização
    let orgData: any = null;
    try {
      const { data } = await supabaseAdmin
        .from('organizations')
        .select('name, phone, whatsapp, address, maps_link, telcosms_api_key, telcosms_sender_id')
        .eq('id', orgId)
        .maybeSingle();
      orgData = data;
    } catch (orgErr: any) {
      console.warn('[BookingService] Aviso ao obter dados da organização:', orgErr.message);
    }

    const companyName = orgData?.name?.trim() || 'Nossa Empresa';
    const companyPhone = orgData?.phone?.trim() || orgData?.whatsapp?.trim() || '';
    const companyAddress = orgData?.address?.trim() || '';
    const mapsLink = orgData?.maps_link?.trim() || '';

    // ── 1. Salvar ou Recuperar Agendamento no Banco (Deduplicação) ─────────────
    let bookingId: string | undefined = undefined;
    try {
      const { data: existingBooking } = await supabaseAdmin
        .from('bookings')
        .select('id')
        .eq('org_id', orgId)
        .eq('appointment_date', date)
        .eq('appointment_time', time)
        .maybeSingle();

      if (existingBooking) {
        bookingId = existingBooking.id;
        console.log(`[BookingService] ℹ️ Agendamento já existente na base de dados com ID: ${bookingId}`);
      } else {
        const { data: newBooking, error: insertError } = await supabaseAdmin
          .from('bookings')
          .insert({
            org_id: orgId,
            first_name: name.split(' ')[0] || name,
            last_name: name.split(' ').slice(1).join(' ') || undefined,
            email: email || undefined,
            phone: phone || 'N/A',
            service: subject,
            appointment_date: date,
            appointment_time: time,
          })
          .select('id')
          .single();

        if (!insertError && newBooking) {
          bookingId = newBooking.id;
          console.log(`[BookingService] ✅ Novo agendamento inserido na tabela bookings: ${bookingId}`);
        }
      }
    } catch (dbErr: any) {
      console.warn('[BookingService] Aviso ao persistir na tabela bookings (não bloqueante):', dbErr.message);
    }

    // ── 2. Sincronização Segura com Google Calendar ───────────────────────────
    let calendarResult: any = null;
    try {
      const descLines = [
        `Agendamento via Orion Platform (${options?.channelOrigin || 'Chatbot'})`,
        `Empresa: ${companyName}`,
        `Assunto: ${subject}`,
        `Cliente: ${name}`,
      ];
      if (phone) descLines.push(`Telefone: ${phone}`);
      if (email) descLines.push(`Email: ${email}`);
      if (companyAddress) descLines.push(`Endereço: ${companyAddress}`);
      if (companyPhone) descLines.push(`Telefone da Empresa: ${companyPhone}`);
      if (mapsLink) descLines.push(`Localização: [Localizar no Google Maps](${mapsLink})`);

      calendarResult = await createGoogleCalendarEvent(orgId, {
        summary: `${subject} - ${name}`,
        appointmentDate: date,
        appointmentTime: time,
        location: companyAddress || mapsLink || undefined,
        customerName: name,
        customerEmail: email,
        customerPhone: phone,
        description: descLines.join('\n'),
      });

      if (calendarResult.success) {
        console.log(`[BookingService] 📆 Google Calendar sincronizado! Event ID: ${calendarResult.eventId} (Já existia: ${calendarResult.alreadyExisted})`);
      } else {
        console.warn(`[BookingService] ℹ️ Google Calendar: ${calendarResult.error}`);
      }
    } catch (calErr: any) {
      console.error('[BookingService] ❌ Erro ao sincronizar Google Calendar:', calErr.message);
    }

    // ── 3. Disparo Imediato dos Alertas Instantâneos ──────────────────────────
    let instantEmailSent = false;
    let instantSmsSent = false;

    // Alerta Instantâneo por E-mail
    if (email) {
      try {
        console.log(`[BookingService] ✉️ Disparando e-mail de confirmação instantâneo para ${email}...`);
        instantEmailSent = await EmailService.sendBookingConfirmationToCustomer({
          customerEmail: email,
          customerName: name,
          date,
          time,
          subject,
          companyName,
          companyPhone,
          companyAddress,
          mapsLink,
        });
      } catch (eErr: any) {
        console.error('[BookingService] Erro no e-mail instantâneo:', eErr.message);
      }
    }

    // Alerta Instantâneo por SMS
    if (phone) {
      try {
        console.log(`[BookingService] 📱 Disparando SMS de confirmação instantâneo para ${phone}...`);
        let smsMsg = `Olá ${name}, a sua marcação para ${subject} com ${companyName} no dia ${date} às ${time} foi confirmada com sucesso!`;
        if (mapsLink) {
          smsMsg += ` Localizar no Google Maps: ${mapsLink}`;
        }
        smsMsg += ` Obrigado, ${companyName}.`;

        const smsRes = await TelcoSMSService.sendSMS({
          orgId,
          to: phone,
          message: smsMsg,
          apiKey: orgData?.telcosms_api_key,
          senderId: orgData?.telcosms_sender_id,
        });
        instantSmsSent = smsRes.success;
      } catch (sErr: any) {
        console.error('[BookingService] Erro no SMS instantâneo:', sErr.message);
      }
    }

    // ── 4. Programação dos 3 Estágios de Lembretes Futuros ─────────────────────
    let alertsScheduled = 0;
    const channels = email && phone ? 'both' : email ? 'email' : 'sms';

    // Parse da data e hora do agendamento
    const [y, m, d] = date.split('-').map(Number);
    const [h, min] = time.split(':').map(Number);
    const appointmentDateObj = new Date(y, m - 1, d, h, min, 0);

    const now = new Date();

    const remindersToSchedule = [];

    // Estágio 1: 7 Dias Antes (Em horário comercial aleatório 08:00 - 17:00)
    const sevenDaysBeforeDate = new Date(appointmentDateObj);
    sevenDaysBeforeDate.setDate(sevenDaysBeforeDate.getDate() - 7);
    const scheduled7Days = this.getRandomBusinessHour(sevenDaysBeforeDate);

    if (scheduled7Days.getTime() > now.getTime()) {
      remindersToSchedule.push({
        reminder_stage: '7_days_before',
        scheduled_at: scheduled7Days.toISOString(),
      });
    }

    // Estágio 2: 3 Dias Antes / 72 Horas Antes (Em horário comercial aleatório 08:00 - 17:00)
    const threeDaysBeforeDate = new Date(appointmentDateObj);
    threeDaysBeforeDate.setDate(threeDaysBeforeDate.getDate() - 3);
    const scheduled3Days = this.getRandomBusinessHour(threeDaysBeforeDate);

    if (scheduled3Days.getTime() > now.getTime()) {
      remindersToSchedule.push({
        reminder_stage: '3_days_before',
        scheduled_at: scheduled3Days.toISOString(),
      });
    }

    // Estágio 3: No Dia Marcado às 07:00 Horas
    const dayOf7am = new Date(y, m - 1, d, 7, 0, 0, 0);
    if (dayOf7am.getTime() > now.getTime()) {
      remindersToSchedule.push({
        reminder_stage: 'day_of_7am',
        scheduled_at: dayOf7am.toISOString(),
      });
    }

    // Inserir os lembretes na tabela appointment_reminders
    for (const rem of remindersToSchedule) {
      try {
        // Verificar se já existe lembrete pendente idêntico
        const { data: existingRem } = await supabaseAdmin
          .from('appointment_reminders')
          .select('id')
          .eq('org_id', orgId)
          .eq('appointment_date', date)
          .eq('appointment_time', time)
          .eq('reminder_stage', rem.reminder_stage)
          .eq('status', 'pending')
          .maybeSingle();

        if (!existingRem) {
          const { error: insErr } = await supabaseAdmin
            .from('appointment_reminders')
            .insert({
              org_id: orgId,
              booking_id: bookingId || undefined,
              customer_name: name,
              customer_phone: phone || undefined,
              customer_email: email || undefined,
              subject,
              appointment_date: date,
              appointment_time: time,
              reminder_stage: rem.reminder_stage,
              scheduled_at: rem.scheduled_at,
              channels,
              status: 'pending',
            });

          if (!insErr) {
            alertsScheduled++;
            console.log(`[BookingService] ⏰ Lembrete programado (${rem.reminder_stage}) para ${rem.scheduled_at} (Cliente: ${name})`);
          }
        }
      } catch (remErr: any) {
        console.warn(`[BookingService] Aviso ao programar lembrete ${rem.reminder_stage}:`, remErr.message);
      }
    }

    return {
      success: true,
      bookingId,
      calendarEventId: calendarResult?.eventId,
      calendarHtmlLink: calendarResult?.htmlLink,
      alertsScheduled,
      instantEmailSent,
      instantSmsSent,
    };
  }
}
