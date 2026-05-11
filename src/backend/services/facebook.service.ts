import axios from 'axios';

export class FacebookService {
    /**
     * Envia uma mensagem no Messenger
     */
    static async sendMessage(pageId: string, recipientId: string, text: string, accessToken: string) {
        try {
            const url = `https://graph.facebook.com/v21.0/${pageId}/messages`;
            await axios.post(url, {
                recipient: { id: recipientId },
                message: { text: text },
                messaging_type: "RESPONSE"
            }, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log(`[FACEBOOK] Mensagem enviada para ${recipientId}`);
        } catch (error: any) {
            console.error('[FACEBOOK] Erro ao enviar mensagem:', error.response?.data || error.message);
        }
    }

    /**
     * Envia indicador de digitação (typing_on)
     */
    static async sendTypingIndicator(pageId: string, recipientId: string, accessToken: string, action: 'typing_on' | 'typing_off' = 'typing_on') {
        try {
            const url = `https://graph.facebook.com/v21.0/${pageId}/messages`;
            await axios.post(url, {
                recipient: { id: recipientId },
                sender_action: action
            }, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
        } catch (error: any) {
            console.warn('[FACEBOOK] Erro ao enviar typing indicator:', error.response?.data || error.message);
        }
    }
}
