import axios from 'axios';
import { supabaseAdmin } from '../config/supabase';

export interface GoogleCalendarEventInput {
  summary: string;
  description?: string;
  location?: string;
  appointmentDate: string; // YYYY-MM-DD
  appointmentTime: string; // HH:mm or HH:mm:ss
  durationMinutes?: number;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
}

/**
 * Obtém um Access Token válido da Google a partir do Refresh Token guardado
 */
export async function getGoogleAccessToken(
  orgId: string,
  customCredentials?: { clientId?: string; clientSecret?: string; refreshToken?: string }
): Promise<{ accessToken: string | null; error?: string }> {
  try {
    let clientId = customCredentials?.clientId?.trim();
    let clientSecret = customCredentials?.clientSecret?.trim();
    let refreshToken = customCredentials?.refreshToken?.trim();

    if (!clientId || !clientSecret || !refreshToken) {
      if (orgId) {
        const { data: org, error } = await supabaseAdmin
          .from('organizations')
          .select('google_client_id, google_client_secret, google_user_refresh_token, google_refresh_token')
          .eq('id', orgId)
          .maybeSingle();

        if (error) {
          console.warn('[CALENDAR SERVICE] Aviso ao consultar organização:', error.message);
        }

        if (org) {
          clientId = clientId || org.google_client_id?.trim();
          clientSecret = clientSecret || org.google_client_secret?.trim();
          refreshToken = refreshToken || org.google_user_refresh_token?.trim() || org.google_refresh_token?.trim();
        }
      }

      clientId = clientId || process.env.GOOGLE_CLIENT_ID?.trim();
      clientSecret = clientSecret || process.env.GOOGLE_CLIENT_SECRET?.trim();
    }

    if (!refreshToken) {
      return { accessToken: null, error: 'Google Refresh Token não configurado. Por favor, clique em "Conectar via OAuth Google" para autorizar a conta.' };
    }
    if (!clientId || !clientSecret) {
      return { accessToken: null, error: 'Google Client ID ou Client Secret ausentes. Por favor, preencha as credenciais no painel.' };
    }

    const tokenRes = await axios.post(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000,
      }
    );

    const accessToken = tokenRes.data.access_token;
    if (!accessToken) {
      return { accessToken: null, error: 'Google não retornou um access_token válido.' };
    }

    return { accessToken };
  } catch (err: any) {
    const rawError = err.response?.data?.error;
    const rawDesc = err.response?.data?.error_description || '';
    console.error('[CALENDAR SERVICE] Erro ao obter access_token da Google:', { error: rawError, description: rawDesc, message: err.message });

    let friendlyError = rawDesc || rawError || err.message;
    if (rawError === 'invalid_grant' || rawDesc.toLowerCase().includes('bad request')) {
      friendlyError = 'Refresh Token inválido ou expirado. Por favor, clique em "Conectar via OAuth Google" para gerar uma nova autorização.';
    } else if (rawError === 'invalid_client') {
      friendlyError = 'Google Client ID ou Client Secret incorretos. Verifique as credenciais no Google Cloud Console.';
    } else if (rawError === 'unauthorized_client') {
      friendlyError = 'Cliente OAuth não autorizado para este tipo de concessão.';
    } else if (rawError === 'redirect_uri_mismatch') {
      friendlyError = 'URI de Redirecionamento não autorizada no Google Cloud Console.';
    }

    return { accessToken: null, error: friendlyError };
  }
}

/**
 * Testa a conexão ativa com o Google Calendar e retorna informações do calendário principal
 */
export async function testGoogleCalendarConnection(
  orgId: string,
  customCredentials?: { clientId?: string; clientSecret?: string; refreshToken?: string }
): Promise<{ success: boolean; calendar?: { id: string; summary: string; timeZone: string }; error?: string }> {
  const { accessToken, error } = await getGoogleAccessToken(orgId, customCredentials);
  if (!accessToken) {
    return { success: false, error: error || 'Não foi possível autenticar com o Google Calendar.' };
  }

  try {
    const res = await axios.get('https://www.googleapis.com/calendar/v3/calendars/primary', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      timeout: 10000,
    });

    return {
      success: true,
      calendar: {
        id: res.data.id,
        summary: res.data.summary,
        timeZone: res.data.timeZone,
      },
    };
  } catch (err: any) {
    const errorDetails = err.response?.data?.error?.message || err.message;
    console.error('[CALENDAR SERVICE] Erro ao consultar Google Calendar:', errorDetails);
    return { success: false, error: errorDetails };
  }
}

/**
 * Cria um agendamento no Google Calendar principal evitando duplicações
 */
export async function createGoogleCalendarEvent(
  orgId: string,
  input: GoogleCalendarEventInput
): Promise<{ success: boolean; eventId?: string; htmlLink?: string; error?: string; alreadyExisted?: boolean }> {
  const { accessToken, error } = await getGoogleAccessToken(orgId);
  if (!accessToken) {
    console.warn('[CALENDAR SERVICE] Agendamento não sincronizado com Google Calendar:', error);
    return { success: false, error };
  }

  try {
    const duration = input.durationMinutes || 60;
    const timeFormatted = input.appointmentTime.length === 5 ? `${input.appointmentTime}:00` : input.appointmentTime;
    
    // Tratamento seguro de datas sem distorção de fuso horário
    // input.appointmentDate: YYYY-MM-DD, input.appointmentTime: HH:mm[:ss]
    const dateParts = input.appointmentDate.split('-').map(Number);
    const timeParts = timeFormatted.split(':').map(Number);
    
    if (dateParts.length !== 3 || isNaN(dateParts[0]) || isNaN(dateParts[1]) || isNaN(dateParts[2])) {
      return { success: false, error: 'Data do agendamento inválida (formato esperado YYYY-MM-DD).' };
    }
    if (timeParts.length < 2 || isNaN(timeParts[0]) || isNaN(timeParts[1])) {
      return { success: false, error: 'Hora do agendamento inválida (formato esperado HH:MM).' };
    }

    const startDateTime = new Date(dateParts[0], dateParts[1] - 1, dateParts[2], timeParts[0], timeParts[1], timeParts[2] || 0);

    if (isNaN(startDateTime.getTime())) {
      return { success: false, error: 'Data ou hora do agendamento inválida.' };
    }

    const endDateTime = new Date(startDateTime.getTime() + duration * 60 * 1000);

    // ── 1. Deduplicação Ativa no Google Calendar ─────────────────────────────
    // Verificar se já existe um evento na faixa de tempo (+/- 15 minutos) com o mesmo cliente ou resumo
    try {
      const windowMin = new Date(startDateTime.getTime() - 15 * 60 * 1000).toISOString();
      const windowMax = new Date(endDateTime.getTime() + 15 * 60 * 1000).toISOString();

      const existingRes = await axios.get('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          timeMin: windowMin,
          timeMax: windowMax,
          singleEvents: true,
        },
        timeout: 8000,
      });

      const existingEvents = existingRes.data?.items || [];
      const duplicate = existingEvents.find((evt: any) => {
        const summaryMatch = evt.summary && input.summary && evt.summary.toLowerCase().trim() === input.summary.toLowerCase().trim();
        const clientInDesc = input.customerName && evt.description && evt.description.toLowerCase().includes(input.customerName.toLowerCase().trim());
        const phoneInDesc = input.customerPhone && evt.description && evt.description.includes(input.customerPhone.trim());
        const emailInDesc = input.customerEmail && (
          (evt.description && evt.description.toLowerCase().includes(input.customerEmail.toLowerCase().trim())) ||
          (evt.attendees && evt.attendees.some((a: any) => a.email?.toLowerCase() === input.customerEmail?.toLowerCase()))
        );

        return summaryMatch || (clientInDesc && (phoneInDesc || emailInDesc)) || (phoneInDesc && emailInDesc);
      });

      if (duplicate) {
        console.log(`[CALENDAR SERVICE] ℹ️ Evento duplicado evitado! Reutilizando evento existente: ${duplicate.id}`);
        return {
          success: true,
          eventId: duplicate.id,
          htmlLink: duplicate.htmlLink,
          alreadyExisted: true,
        };
      }
    } catch (checkErr: any) {
      console.warn('[CALENDAR SERVICE] Aviso ao verificar duplicatas no Google Calendar (prosseguindo com criação):', checkErr.message);
    }

    // ── 2. Montar Detalhes do Evento ──────────────────────────────────────────
    const descriptionParts: string[] = [];
    if (input.description) descriptionParts.push(input.description);
    if (input.customerName) descriptionParts.push(`Cliente: ${input.customerName}`);
    if (input.customerPhone) descriptionParts.push(`Telefone: ${input.customerPhone}`);
    if (input.customerEmail) descriptionParts.push(`E-mail: ${input.customerEmail}`);
    descriptionParts.push(`\nAgendado via Orion Intelligence Platform`);

    const eventPayload: any = {
      summary: input.summary,
      description: descriptionParts.join('\n'),
      start: {
        dateTime: startDateTime.toISOString(),
      },
      end: {
        dateTime: endDateTime.toISOString(),
      },
    };

    if (input.location) {
      eventPayload.location = input.location;
    }

    if (input.customerEmail && input.customerEmail.includes('@')) {
      eventPayload.attendees = [
        {
          email: input.customerEmail,
          displayName: input.customerName || undefined,
        },
      ];
    }

    const eventRes = await axios.post(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      eventPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    console.log('[CALENDAR SERVICE] Evento criado no Google Calendar:', eventRes.data.id);
    return {
      success: true,
      eventId: eventRes.data.id,
      htmlLink: eventRes.data.htmlLink,
      alreadyExisted: false,
    };
  } catch (err: any) {
    const errorDetails = err.response?.data?.error?.message || err.message;
    console.error('[CALENDAR SERVICE] Falha ao criar evento no Google Calendar:', errorDetails);
    return { success: false, error: errorDetails };
  }
}
