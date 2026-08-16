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
 * Formata um número de telefone com o indicativo internacional de país (E.164)
 * Suporta Moçambique (+258), Angola (+244), Portugal (+351), Brasil (+55), etc.
 */
export function formatInternationalPhone(phone: string, defaultCountryCode: string = '258'): string {
  if (!phone) return '';
  
  // Limpar espaços, traços, parênteses e caracteres não numéricos exceto o +
  let cleaned = phone.trim().replace(/[^\d+]/g, '');

  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  if (cleaned.startsWith('00')) {
    return '+' + cleaned.substring(2);
  }

  // Se o número começa com indicativos conhecidos comuns (258, 244, 351, 55)
  if (/^(258|244|351|55)\d{8,11}$/.test(cleaned)) {
    return '+' + cleaned;
  }

  // Se for um número local de Moçambique (82, 83, 84, 85, 86, 87) com 9 dígitos
  if (/^8[2-7]\d{7}$/.test(cleaned)) {
    return `+258${cleaned}`;
  }

  // Se for um número local de Angola (91, 92, 93, 94, 95, 99) com 9 dígitos
  if (/^9\d{8}$/.test(cleaned) && defaultCountryCode === '244') {
    return `+244${cleaned}`;
  }

  // Fallback adicionando o código padrão
  return `+${defaultCountryCode}${cleaned}`;
}

export class TelcoSMSService {
  /**
   * Envia um SMS através da API da TelcoSMS de forma multi-tenant e resiliente.
   */
  static async sendSMS(options: SendSMSOptions): Promise<SendSMSResult> {
    const { to, message, orgId } = options;
    let apiKey = options.apiKey?.trim();
    let senderId = options.senderId?.trim();

    try {
      // Se não tiver apiKey passada diretamente, busca na base de dados pela organização
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

      // Se a organização não tiver API Key configurada, regista aviso silencioso e não quebra o fluxo
      if (!apiKey) {
        console.warn(`[TELCOSMS] ℹ️ API Key não configurada para a organização "${orgId || 'desconhecida'}". Envio de SMS ignorado.`);
        return {
          success: false,
          error: 'TelcoSMS API Key não configurada no painel.'
        };
      }

      const formattedTo = formatInternationalPhone(to);
      if (!formattedTo || formattedTo.length < 8) {
        console.warn(`[TELCOSMS] Número de destinatário inválido: "${to}"`);
        return {
          success: false,
          error: 'Número de telefone do destinatário inválido.'
        };
      }

      const payload = {
        to: formattedTo,
        message: message,
        sender_id: senderId || 'Orion',
        api_key: apiKey
      };

      console.log(`[TELCOSMS] A enviar SMS para ${formattedTo} (Sender: ${payload.sender_id})...`);

      // TelcoSMS API endpoint principal (suporta envio JSON via POST)
      const telcoUrl = process.env.TELCOSMS_API_URL || 'https://api.telcosms.co.mz/v1/messages';

      const response = await axios.post(telcoUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'X-API-Key': apiKey,
          'api-key': apiKey
        },
        timeout: 15000 // 15 segundos de timeout para máxima resiliência
      });

      console.log(`[TELCOSMS] ✅ SMS enviado com sucesso para ${formattedTo}:`, response.data);

      return {
        success: true,
        messageId: response.data?.message_id || response.data?.id || response.data?.data?.id || 'sent',
        details: response.data
      };

    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.response?.data?.error || err.message || 'Erro de comunicação com a TelcoSMS';
      console.error('[TELCOSMS] ❌ Falha no disparo de SMS:', errMsg);

      // Nunca quebra o fluxo superior (retorna objeto com success: false)
      return {
        success: false,
        error: errMsg,
        details: err.response?.data
      };
    }
  }
}
