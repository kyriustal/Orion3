import axios from 'axios';
import fs from 'fs';

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
            return null;
        }

        try {
            const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
            
            const response = await axios.post(url, {
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
            return response.data?.messages?.[0]?.id || null;
        } catch (error: any) {
            console.error('Erro ao enviar mensagem para Meta:', error.response?.data || error.message);
            return null;
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
    /**
     * Envia o indicador de "digitando..." (typing indicator)
     */
    static async sendTypingIndicator(phoneNumberId: string, messageId: string, accessToken?: string) {
        const token = accessToken || process.env.META_ACCESS_TOKEN;
        
        if (!token) return;

        try {
            const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
            
            await axios.post(url, {
                messaging_product: "whatsapp",
                status: "read",
                message_id: messageId
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
        } catch (error: any) {
            // Silencioso se falhar, pois é um recurso estético
            console.warn('[WHATSAPP] Falha ao enviar typing indicator:', error.response?.data || error.message);
        }
    }

    /**
     * Faz upload de uma mídia para os servidores da Meta
     * @returns ID da mídia carregada
     */
    static async uploadMedia(filePath: string, phoneNumberId: string, accessToken?: string): Promise<string | null> {
        const token = accessToken || process.env.META_ACCESS_TOKEN;
        if (!token) return null;

        try {
            const formData = new FormData();
            const fileStream = fs.createReadStream(filePath);
            // @ts-ignore
            formData.append('file', fileStream);
            formData.append('type', 'audio/mpeg');
            formData.append('messaging_product', 'whatsapp');

            const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/media`;
            const response = await axios.post(url, formData, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                }
            });

            return response.data.id;
        } catch (error: any) {
            console.error('[WHATSAPP] Erro no upload de mídia:', error.response?.data || error.message);
            return null;
        }
    }

    /**
     * Envia uma mensagem de áudio
     */
    static async sendAudio(toNumber: string, mediaId: string, phoneNumberId: string, accessToken?: string) {
        const token = accessToken || process.env.META_ACCESS_TOKEN;
        if (!token) return null;

        try {
            const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
            const response = await axios.post(url, {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: toNumber,
                type: "audio",
                audio: {
                    id: mediaId
                }
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.data?.messages?.[0]?.id || null;
        } catch (error: any) {
            console.error('[WHATSAPP] Erro ao enviar áudio:', error.response?.data || error.message);
            return null;
        }
    }
}
