import axios from 'axios';

export interface FacebookValidationResult {
  valid: boolean;
  pageId?: string;
  pageName?: string;
  permissions: string[];
  hasMessaging: boolean;
  subscribed?: boolean;
  error?: string;
}

export class FacebookService {
  /**
   * Envia uma mensagem no Messenger
   */
  static async sendMessage(pageId: string, recipientId: string, text: string, accessToken: string): Promise<any> {
    try {
      // Tentar primeiro no endpoint /{pageId}/messages
      const url = `https://graph.facebook.com/v19.0/${pageId}/messages`;
      const response = await axios.post(url, {
        recipient: { id: recipientId },
        message: { text: text },
        messaging_type: "RESPONSE"
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      console.log(`[FACEBOOK] Mensagem enviada para ${recipientId}:`, response.data);
      return response.data;
    } catch (error: any) {
      // Se falhar com pageId, tentar fallback com 'me/messages' se for Page Token
      const metaError = error.response?.data?.error;
      const detail = metaError?.message || error.message;
      console.warn(`[FACEBOOK] Falha no endpoint /${pageId}/messages (${detail}). A tentar fallback /me/messages...`);

      try {
        const fallbackUrl = `https://graph.facebook.com/v19.0/me/messages`;
        const fbResponse = await axios.post(fallbackUrl, {
          recipient: { id: recipientId },
          message: { text: text },
          messaging_type: "RESPONSE"
        }, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        });

        console.log(`[FACEBOOK] Fallback /me/messages teve sucesso para ${recipientId}:`, fbResponse.data);
        return fbResponse.data;
      } catch (fallbackErr: any) {
        const finalError = fallbackErr.response?.data?.error?.message || fallbackErr.message || detail;
        console.error('[FACEBOOK] Erro definitivo ao enviar mensagem:', fallbackErr.response?.data || fallbackErr.message);
        throw new Error(`Facebook API send error: ${finalError}`);
      }
    }
  }

  /**
   * Envia indicador de digitação (typing_on / typing_off)
   */
  static async sendTypingIndicator(pageId: string, recipientId: string, accessToken: string, action: 'typing_on' | 'typing_off' = 'typing_on'): Promise<void> {
    try {
      const url = `https://graph.facebook.com/v19.0/${pageId}/messages`;
      await axios.post(url, {
        recipient: { id: recipientId },
        sender_action: action
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        timeout: 5000
      });
    } catch (error: any) {
      console.warn('[FACEBOOK] Erro ao enviar typing indicator:', error.response?.data?.error?.message || error.message);
    }
  }

  /**
   * Marca uma mensagem como lida (mark_seen)
   */
  static async markSeen(pageId: string, recipientId: string, accessToken: string): Promise<void> {
    try {
      const url = `https://graph.facebook.com/v19.0/${pageId}/messages`;
      await axios.post(url, {
        recipient: { id: recipientId },
        sender_action: 'mark_seen'
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        timeout: 5000
      });
    } catch (_) { /* silencioso */ }
  }

  /**
   * Subscreve a página para receber eventos de webhook da aplicação (messages, messaging_postbacks, etc.)
   */
  static async subscribePageToApp(pageId: string, accessToken: string): Promise<{ success: boolean; error?: string }> {
    try {
      const url = `https://graph.facebook.com/v19.0/${pageId}/subscribed_apps`;
      const res = await axios.post(url, {
        subscribed_fields: ['messages', 'messaging_postbacks', 'messaging_optins', 'message_deliveries', 'message_reads', 'feed']
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      console.log(`[FACEBOOK] Subscrição de webhook da página ${pageId} realizada com sucesso:`, res.data);
      return { success: true };
    } catch (err: any) {
      const detail = err.response?.data?.error?.message || err.message;
      console.warn(`[FACEBOOK] Falha ao subscrever app à página ${pageId}: ${detail}`);
      return { success: false, error: detail };
    }
  }

  /**
   * Valida o token e permissões junto à Meta Graph API
   */
  static async validatePageToken(pageId: string, accessToken: string): Promise<FacebookValidationResult> {
    try {
      // 1. Verificar informações do token / me
      const meRes = await axios.get('https://graph.facebook.com/v19.0/me', {
        params: { access_token: accessToken, fields: 'id,name' },
        timeout: 10000
      });

      const meData = meRes.data || {};
      let pageName = meData.name;
      let actualPageId = meData.id;

      // Se for diferente do pageId fornecido, verificar especificamente o pageId
      if (pageId && pageId !== meData.id) {
        try {
          const pageRes = await axios.get(`https://graph.facebook.com/v19.0/${pageId}`, {
            params: { access_token: accessToken, fields: 'id,name' },
            timeout: 10000
          });
          if (pageRes.data?.id) {
            actualPageId = pageRes.data.id;
            pageName = pageRes.data.name || pageName;
          }
        } catch (_) {}
      }

      // 2. Verificar permissões concedidas ao token
      let permissions: string[] = [];
      try {
        const permRes = await axios.get('https://graph.facebook.com/v19.0/me/permissions', {
          params: { access_token: accessToken },
          timeout: 10000
        });
        const permData = permRes.data?.data || [];
        permissions = permData
          .filter((p: any) => p.status === 'granted')
          .map((p: any) => p.permission);
      } catch (_) {}

      // Permissões necessárias para Messenger
      const hasMessaging = permissions.includes('pages_messaging');

      // 3. Tentar verificar se já está subscrito
      let subscribed = false;
      try {
        const targetId = pageId || actualPageId;
        const subRes = await axios.get(`https://graph.facebook.com/v19.0/${targetId}/subscribed_apps`, {
          params: { access_token: accessToken },
          timeout: 10000
        });
        subscribed = Array.isArray(subRes.data?.data) && subRes.data.data.length > 0;
      } catch (_) {}

      return {
        valid: true,
        pageId: actualPageId || pageId,
        pageName: pageName || 'Página Facebook',
        permissions,
        hasMessaging,
        subscribed
      };
    } catch (err: any) {
      const errMsg = err.response?.data?.error?.message || err.message;
      return {
        valid: false,
        permissions: [],
        hasMessaging: false,
        error: errMsg
      };
    }
  }
}
