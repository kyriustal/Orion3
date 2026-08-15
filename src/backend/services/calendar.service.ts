import axios from 'axios';
import { supabaseAdmin } from '../config/supabase';

export interface GoogleCalendarEventInput {
  summary: string;
  description?: string;
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
      const { data: org, error } = await supabaseAdmin
        .from('organizations')
        .select('google_client_id, google_client_secret, google_user_refresh_token, google_refresh_token')
        .eq('id', orgId)
        .maybeSingle();

      if (error) {
        console.error('[CALENDAR SERVICE] Erro ao buscar organização:', error.message);
        return { accessToken: null, error: 'Organização não encontrada.' };
      }

      clientId = clientId || org?.google_client_id?.trim() || process.env.GOOGLE_CLIENT_ID?.trim();
      clientSecret = clientSecret || org?.google_client_secret?.trim() || process.env.GOOGLE_CLIENT_SECRET?.trim();
      refreshToken = refreshToken || org?.google_user_refresh_token?.trim() || org?.google_refresh_token?.trim();
    }

    if (!refreshToken) {
      return { accessToken: null, error: 'Google Refresh Token não configurado.' };
    }
    if (!clientId || !clientSecret) {
      return { accessToken: null, error: 'Google Client ID ou Client Secret ausentes.' };
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
    const errorDetails = err.response?.data?.error_description || err.response?.data?.error || err.message;
    console.error('[CALENDAR SERVICE] Erro ao obter access_token da Google:', errorDetails);
    return { accessToken: null, error: errorDetails };
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
 * Cria um agendamento no Google Calendar principal
 */
export async function createGoogleCalendarEvent(
  orgId: string,
  input: GoogleCalendarEventInput
): Promise<{ success: boolean; eventId?: string; htmlLink?: string; error?: string }> {
  const { accessToken, error } = await getGoogleAccessToken(orgId);
  if (!accessToken) {
    console.warn('[CALENDAR SERVICE] Agendamento não sincronizado com Google Calendar:', error);
    return { success: false, error };
  }

  try {
    const duration = input.durationMinutes || 60;
    const timeFormatted = input.appointmentTime.length === 5 ? `${input.appointmentTime}:00` : input.appointmentTime;
    const startDateTime = new Date(`${input.appointmentDate}T${timeFormatted}`);

    if (isNaN(startDateTime.getTime())) {
      return { success: false, error: 'Data ou hora do agendamento inválida.' };
    }

    const endDateTime = new Date(startDateTime.getTime() + duration * 60 * 1000);

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
    };
  } catch (err: any) {
    const errorDetails = err.response?.data?.error?.message || err.message;
    console.error('[CALENDAR SERVICE] Falha ao criar evento no Google Calendar:', errorDetails);
    return { success: false, error: errorDetails };
  }
}
