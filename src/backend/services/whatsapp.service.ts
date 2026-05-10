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

    /**
     * Busca a URL de mídia da Meta e retorna o conteúdo em Base64
     */
    static async getMedia(mediaId: string, accessToken: string) {
        try {
            // 1. Obter a URL da mídia
            const urlResponse = await axios.get(`https://graph.facebook.com/v19.0/${mediaId}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            const mediaUrl = urlResponse.data?.url;
            const mimeType = urlResponse.data?.mime_type;

            if (!mediaUrl) throw new Error("URL da mídia não encontrada.");

            // 2. Baixar o conteúdo binário
            const mediaResponse = await axios.get(mediaUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                responseType: 'arraybuffer'
            });

            const base64 = Buffer.from(mediaResponse.data).toString('base64');

            return {
                base64,
                mimeType
            };
        } catch (error: any) {
            console.error('Erro ao baixar mídia da Meta:', error.message);
            return null;
        }
    }
}

