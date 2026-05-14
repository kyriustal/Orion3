import axios from 'axios';

/**
 * Serviço para comunicação com a Instagram Messaging API (via Meta Graph API v19.0)
 *
 * Pré-requisitos:
 * - Conta Instagram Business ligada a uma Facebook Page
 * - Token de acesso da página (Page Access Token) com permissões:
 *   instagram_basic, instagram_manage_messages, pages_messaging
 */
export class InstagramService {

  /**
   * Envia uma mensagem de texto no Instagram Direct
   * @param igUserId   Instagram Business Account ID (do remetente/página)
   * @param recipientId  Instagram Scoped User ID do destinatário
   * @param text         Conteúdo da mensagem
   * @param accessToken  Page Access Token
   */
  static async sendMessage(
    igUserId: string,
    recipientId: string,
    text: string,
    accessToken: string
  ): Promise<void> {
    try {
      const url = `https://graph.facebook.com/v19.0/${igUserId}/messages`;

      await axios.post(url, {
        recipient: { id: recipientId },
        message:   { text },
        messaging_type: 'RESPONSE',
      }, {
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10_000,
      });

      console.log(`[INSTAGRAM] Mensagem enviada para ${recipientId}`);
    } catch (err: any) {
      const detail = err.response?.data?.error?.message || err.message;
      console.error(`[INSTAGRAM] Erro ao enviar mensagem para ${recipientId}: ${detail}`);
      throw new Error(`Instagram send error: ${detail}`);
    }
  }

  /**
   * Envia o indicador "a escrever..." no Instagram Direct
   */
  static async sendTypingIndicator(
    igUserId: string,
    recipientId: string,
    accessToken: string,
    action: 'typing_on' | 'typing_off' = 'typing_on'
  ): Promise<void> {
    try {
      const url = `https://graph.facebook.com/v19.0/${igUserId}/messages`;

      await axios.post(url, {
        recipient:     { id: recipientId },
        sender_action: action,
      }, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        timeout: 5_000,
      });
    } catch (err: any) {
      // Silencioso — é apenas um indicador estético
      console.warn(`[INSTAGRAM] Falha ao enviar typing indicator: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  /**
   * Marca uma mensagem como lida no Instagram Direct
   */
  static async markSeen(
    igUserId: string,
    recipientId: string,
    accessToken: string
  ): Promise<void> {
    try {
      await axios.post(`https://graph.facebook.com/v19.0/${igUserId}/messages`, {
        recipient:     { id: recipientId },
        sender_action: 'mark_seen',
      }, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 5_000,
      });
    } catch (_) { /* silencioso */ }
  }

  /**
   * Valida o token e obtém o Instagram Business Account ID e username
   * ligados a uma Page Access Token
   */
  static async validateAndGetIgId(accessToken: string): Promise<{ igUserId: string; username: string } | null> {
    try {
      // 1. Obter as páginas associadas ao token
      const meRes = await axios.get('https://graph.facebook.com/v19.0/me/accounts', {
        params: { access_token: accessToken, fields: 'id,name,instagram_business_account' },
        timeout: 10_000,
      });

      const pages = meRes.data?.data || [];
      for (const page of pages) {
        if (page.instagram_business_account?.id) {
          const igId = page.instagram_business_account.id;

          // 2. Obter username do Instagram
          const igRes = await axios.get(`https://graph.facebook.com/v19.0/${igId}`, {
            params: { fields: 'id,username,name', access_token: accessToken },
            timeout: 10_000,
          });

          return {
            igUserId:  igRes.data.id,
            username:  igRes.data.username || igRes.data.name || 'Instagram Business',
          };
        }
      }

      return null;
    } catch (err: any) {
      console.error('[INSTAGRAM] Erro na validação:', err.response?.data?.error?.message || err.message);
      return null;
    }
  }
}
