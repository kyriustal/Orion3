import axios from 'axios';

/**
 * Serviço para gerenciar comunicação com a API do WhatsApp (Meta)
 */
export class WhatsAppService {
    /**
     * Envia uma mensagem de texto simples para um número
     */
    static async sendTextMessage(phoneNumberId: string, to: string, text: string, accessToken?: string) {
        const token = accessToken || process.env.META_ACCESS_TOKEN;
        
        if (!token) {
            console.error('WhatsApp Access Token não configurado.');
            return;
        }

        try {
            const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
            
            await axios.post(url, {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: to,
                type: "text",
                text: { body: text }
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            console.log(`Resposta enviada para ${to}`);
        } catch (error: any) {
            console.error('Erro ao enviar mensagem para Meta:', error.response?.data || error.message);
        }
    }
}
