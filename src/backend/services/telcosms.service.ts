import axios from 'axios';
import { supabaseAdmin } from '../config/supabase';

export interface SendSMSOptions {
  to: string;
  message: string;
  apiKey?: string;
  senderId?: string;
  orgId?: string;
}

export interface SendSMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
  details?: any;
}

/**
 * Formata um número para a TelcoSMS (Angola / Internacional).
 * Para números de Angola (+244 9xxxxxxxx), extrai os 9 dígitos locais padrão (9xxxxxxxx)
 * ou mantém o formato internacional com indicativo se for de outro país.
 */
export function formatPhoneForTelcoSMS(phone: string): { local: string; international: string } {
  if (!phone) return { local: '', international: '' };
  
  // Limpar espaços, traços, parênteses e caracteres não numéricos exceto o +
  let cleaned = phone.trim().replace(/[^\d+]/g, '');

  if (cleaned.startsWith('+244')) {
    cleaned = cleaned.substring(4);
  } else if (cleaned.startsWith('244') && cleaned.length >= 12) {
    cleaned = cleaned.substring(3);
  } else if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }

  // Se for número de 9 dígitos de Angola (91, 92, 93, 94, 95, 99)
  const isAngolaLocal = /^9\d{8}$/.test(cleaned);
  const local = isAngolaLocal ? cleaned : cleaned;
  const international = isAngolaLocal ? `+244${cleaned}` : `+${cleaned}`;

  return { local, international };
}

export class TelcoSMSService {
  /**
   * Envia um SMS através da API da TelcoSMS de forma multi-tenant e resiliente.
   * Suporta TelcoSMS Angola (v2 e v1) e gateways padrão.
   */
  static async sendSMS(options: SendSMSOptions): Promise<SendSMSResult> {
    const { to, message, orgId } = options;
    let apiKey = options.apiKey?.trim();
    let senderId = options.senderId?.trim();

    try {
      // 1. Se não tiver apiKey passada diretamente, busca na base de dados pela organização
      if (!apiKey && orgId) {
        const { data: org, error } = await supabaseAdmin
          .from('organizations')
          .select('telcosms_api_key, telcosms_sender_id, name')
          .eq('id', orgId)
          .maybeSingle();

        if (error) {
          console.warn('[TELCOSMS] Erro ao consultar credenciais da organização:', error.message);
        }

        if (org) {
          apiKey = org.telcosms_api_key?.trim();
          senderId = senderId || org.telcosms_sender_id?.trim();
        }
      }

      // 2. Se a organização não tiver chave direta, verificar variáveis de ambiente (.env)
      if (!apiKey) {
        apiKey = process.env.TELCOSMS_API_KEY?.trim();
        senderId = senderId || process.env.TELCOSMS_SENDER_ID?.trim();
      }

      // Se a organização e o sistema não tiverem API Key configurada, regista aviso e não quebra o fluxo
      if (!apiKey) {
        console.warn(`[TELCOSMS] ℹ️ API Key não configurada para a organização "${orgId || 'desconhecida'}". Envio de SMS ignorado.`);
        return {
          success: false,
          error: 'TelcoSMS API Key não configurada no painel ou .env.'
        };
      }

      const { local: phoneLocal, international: phoneIntl } = formatPhoneForTelcoSMS(to);
      if (!phoneLocal || phoneLocal.length < 8) {
        console.warn(`[TELCOSMS] Número de destinatário inválido: "${to}"`);
        return {
          success: false,
          error: 'Número de telefone do destinatário inválido.'
        };
      }

      console.log(`[TELCOSMS] A enviar SMS para ${phoneLocal} (${phoneIntl})...`);

      // Endpoints oficiais da TelcoSMS (Angola)
      const endpoints = [
        process.env.TELCOSMS_API_URL,
        'https://www.telcosms.co.ao/api/v2/send_message',
        'https://telcosms.co.ao/api/v2/send_message',
        'https://www.telcosms.co.ao/send_message',
      ].filter(Boolean) as string[];

      let lastError = '';
      let lastDetails: any = null;

      for (const endpoint of endpoints) {
        try {
          // Payload oficial TelcoSMS v2 / v1
          const payload = {
            message: {
              api_key_app: apiKey,
              phone_number: phoneLocal,
              message_body: message,
              sender_id: senderId || undefined
            }
          };

          const response = await axios.post(endpoint, payload, {
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            timeout: 12000
          });

          console.log(`[TELCOSMS] Resposta recebida de ${endpoint}:`, response.data);

          // Verificar resposta da TelcoSMS
          const data = response.data;
          const status = data?.status || data?.message?.status || (data?.success ? 'success' : '');
          const errorMsg = data?.error || data?.message?.error || data?.detail;

          if (errorMsg && status !== 'success') {
            lastError = typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg);
            lastDetails = data;
            console.warn(`[TELCOSMS] Aviso de endpoint ${endpoint}:`, lastError);
            continue;
          }

          console.log(`[TELCOSMS] ✅ SMS enviado com sucesso para ${phoneLocal}!`);
          return {
            success: true,
            messageId: data?.id || data?.message_id || data?.message?.id || 'sent',
            details: data
          };
        } catch (err: any) {
          lastError = err.response?.data?.message || err.response?.data?.error || err.message || 'Falha de comunicação';
          lastDetails = err.response?.data;
          console.warn(`[TELCOSMS] Tentativa em ${endpoint} falhou:`, lastError);
        }
      }

      console.error('[TELCOSMS] ❌ Todas as tentativas de envio falharam:', lastError);
      return {
        success: false,
        error: lastError,
        details: lastDetails
      };

    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.response?.data?.error || err.message || 'Erro de comunicação com a TelcoSMS';
      console.error('[TELCOSMS] ❌ Erro inesperado no envio de SMS:', errMsg);

      return {
        success: false,
        error: errMsg,
        details: err.response?.data
      };
    }
  }

  /**
   * Envia SMS de lembrete programado (7 dias antes, 72h antes ou no dia marcado às 07:00).
   */
  static async sendBookingReminderSMS(params: {
    orgId: string;
    to: string;
    customerName: string;
    date: string;
    time: string;
    subject: string;
    reminderStage: '7_days_before' | '3_days_before' | 'day_of_7am';
    companyName: string;
    mapsLink?: string;
  }): Promise<SendSMSResult> {
    const { orgId, to, customerName, date, time, subject, reminderStage, companyName, mapsLink } = params;

    let stagePrefix = '';
    if (reminderStage === '7_days_before') {
      stagePrefix = `Lembrete: A sua marcação para ${subject} com ${companyName} é na próxima semana, dia ${date} às ${time}.`;
    } else if (reminderStage === '3_days_before') {
      stagePrefix = `Lembrete: Faltam 72h para a sua marcação de ${subject} com ${companyName}, dia ${date} às ${time}.`;
    } else {
      stagePrefix = `Bom dia ${customerName}! Lembramos que a sua marcação de ${subject} com ${companyName} é hoje, dia ${date} às ${time}.`;
    }

    let message = `Olá ${customerName}! ${stagePrefix}`;
    if (mapsLink) {
      message += ` Localizar no Google Maps: ${mapsLink}`;
    }
    message += ` Obrigado, ${companyName}.`;

    return this.sendSMS({
      orgId,
      to,
      message,
    });
  }
}

