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
            const fileBuffer = fs.readFileSync(filePath);
            const fileBlob = new Blob([fileBuffer], { type: 'audio/mpeg' });
            
            formData.append('file', fileBlob, 'audio.mp3');
            formData.append('type', 'audio'); // <-- Formato correto exigido pela API da Meta
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
    /**
     * Envia media (imagem, vídeo, áudio ou documento) a partir de uma URL pública
     */
    static async sendMediaByUrl(
        toNumber: string, 
        mediaUrl: string, 
        mimeType: string, 
        fileName: string,
        phoneNumberId: string, 
        accessToken?: string
    ) {
        const token = accessToken || process.env.META_ACCESS_TOKEN;
        if (!token) return null;

        try {
            const isImage = mimeType.startsWith('image/');
            const isVideo = mimeType.startsWith('video/');
            const isAudio = mimeType.startsWith('audio/');
            
            let type = 'document';
            if (isImage) type = 'image';
            else if (isVideo) type = 'video';
            else if (isAudio) type = 'audio';

            const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
            const payload: any = {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: toNumber,
                type: type,
            };

            if (isImage) {
                payload.image = { link: mediaUrl };
            } else if (isVideo) {
                payload.video = { link: mediaUrl };
            } else if (isAudio) {
                payload.audio = { link: mediaUrl };
            } else {
                payload.document = { link: mediaUrl, filename: fileName };
            }

            const response = await axios.post(url, payload, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            return response.data?.messages?.[0]?.id || null;
        } catch (error: any) {
            console.error(`[WHATSAPP] Erro ao enviar media por URL (${fileName}):`, error.response?.data || error.message);
            return null;
        }
    }
    /**
     * Busca os templates da Meta
     */
    static async getTemplates(wabaId: string, accessToken: string) {
        try {
            const url = `https://graph.facebook.com/v19.0/${wabaId}/message_templates`;
            const response = await axios.get(url, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            return response.data?.data || [];
        } catch (error: any) {
            console.error('[WHATSAPP] Erro ao buscar templates:', error.response?.data || error.message);
            return [];
        }
    }

    /**
     * Prepara o texto do template para a Meta:
     * Converte [Nome], [Empresa], [Produto], {{nome}}, {{empresa}}, etc., para {{1}}, {{2}}, {{3}}
     * e gera os exemplos obrigatórios exigidos pela API da Meta.
     */
    static normalizeTemplateForMeta(rawContent: string): { text: string; examples: string[] } {
        let text = rawContent || '';
        const placeholdersFound: string[] = [];

        // Substituir padrões [Placeholder] ou {{placeholder}} por {{1}}, {{2}}, etc.
        text = text.replace(/\[([^\]]+)\]|\{\{([^}]+)\}\}/g, (match, p1, p2) => {
            const name = (p1 || p2 || match).trim();
            let index = placeholdersFound.indexOf(name);
            if (index === -1) {
                placeholdersFound.push(name);
                index = placeholdersFound.length - 1;
            }
            return `{{${index + 1}}}`;
        });

        // Gerar amostras de exemplo para cada variável encontrada (exigido pela Meta WABA)
        const examples = placeholdersFound.map((name, idx) => {
            const lower = name.toLowerCase();
            if (lower.includes('nome') || lower.includes('cliente')) return 'Maria Silva';
            if (lower.includes('empresa') || lower.includes('loja')) return 'Empresa Exemplo';
            if (lower.includes('produto') || lower.includes('servico')) return 'Plano Premium';
            if (lower.includes('data') || lower.includes('hora')) return '15/10/2026';
            if (lower.includes('link') || lower.includes('url')) return 'https://exemplo.com';
            return `Exemplo_${idx + 1}`;
        });

        return { text, examples };
    }

    /**
     * Submete um novo template com suporte a botões e variáveis para a Meta WABA
     */
    static async createMetaTemplate(
        wabaId: string,
        accessToken: string,
        template: {
            name: string;
            category: string;
            language: string;
            content: string;
            buttons?: { id?: string; type: string; text: string; url?: string; phone_number?: string }[];
        }
    ) {
        try {
            const { text: formattedContent, examples } = this.normalizeTemplateForMeta(template.content);

            const bodyComponent: any = {
                type: "BODY",
                text: formattedContent
            };

            // A Meta WABA API exige o campo `example` quando há variáveis {{1}}, {{2}}...
            if (examples.length > 0) {
                bodyComponent.example = {
                    body_text: [examples]
                };
            }

            const components: any[] = [bodyComponent];

            if (template.buttons && template.buttons.length > 0) {
                const formattedButtons = template.buttons.slice(0, 3).map(b => {
                    const type = (b.type || 'QUICK_REPLY').toUpperCase();
                    if (type === 'URL') {
                        return {
                            type: 'URL',
                            text: (b.text || 'Acessar Link').substring(0, 25),
                            url: b.url || 'https://example.com'
                        };
                    }
                    if (type === 'PHONE_NUMBER' || type === 'PHONE') {
                        return {
                            type: 'PHONE_NUMBER',
                            text: (b.text || 'Ligar').substring(0, 25),
                            phone_number: b.phone_number || '+5511999999999'
                        };
                    }
                    return {
                        type: 'QUICK_REPLY',
                        text: (b.text || 'Confirmar').substring(0, 25)
                    };
                });

                components.push({
                    type: "BUTTONS",
                    buttons: formattedButtons
                });
            }

            // Sanitizar nome do template conforme regras da Meta: minúsculas, sem acentos, sem caracteres especiais
            const cleanName = template.name
                .toLowerCase()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9_]/g, '_')
                .replace(/_+/g, '_');

            const url = `https://graph.facebook.com/v19.0/${wabaId}/message_templates`;
            const response = await axios.post(url, {
                name: cleanName,
                category: template.category || 'MARKETING',
                language: template.language || 'pt_BR',
                components
            }, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            return response.data;
        } catch (error: any) {
            console.error('[WHATSAPP] Erro ao criar template na Meta:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Envia uma mensagem baseada em template oficial da Meta ou fallback interativo com botões
     */
    static async sendTemplateMessage(
        phoneNumberId: string,
        to: string,
        templateName: string,
        languageCode: string = 'pt_BR',
        variables: Record<string, string> = {},
        buttons: { id?: string; type?: string; text: string; title?: string }[] = [],
        accessToken?: string,
        contentFallback?: string
    ): Promise<string | null> {
        const token = accessToken || process.env.META_ACCESS_TOKEN;
        if (!token) {
            console.error('WhatsApp Access Token não configurado.');
            return null;
        }

        try {
            const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

            const bodyParams = Object.keys(variables)
                .sort((a, b) => parseInt(a) - parseInt(b))
                .map(key => ({
                    type: "text",
                    text: variables[key] || ""
                }));

            const components: any[] = [];
            if (bodyParams.length > 0) {
                components.push({
                    type: "body",
                    parameters: bodyParams
                });
            }

            const response = await axios.post(url, {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to,
                type: "template",
                template: {
                    name: templateName,
                    language: { code: languageCode },
                    ...(components.length > 0 ? { components } : {})
                }
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log(`[WHATSAPP] Template ${templateName} enviado para ${to}`);
            return response.data?.messages?.[0]?.id || null;
        } catch (error: any) {
            console.warn(`[WHATSAPP] Falha no disparo do template oficial (${templateName}):`, error.response?.data || error.message);
            if (contentFallback) {
                let filledText = contentFallback;
                Object.keys(variables).forEach(k => {
                    filledText = filledText.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), variables[k] || '');
                });

                if (buttons && buttons.length > 0) {
                    const formattedBtns = buttons.map((b, idx) => ({
                        id: b.id || `btn_${idx + 1}`,
                        title: b.text || b.title || `Opção ${idx + 1}`
                    }));
                    return this.sendInteractiveButtons(phoneNumberId, to, filledText, formattedBtns, token);
                } else {
                    return this.sendTextMessage(phoneNumberId, to, filledText, token);
                }
            }
            return null;
        }
    }

    /**
     * Envia uma mensagem interativa com botões de resposta rápida (máximo 3 botões)
     */
    static async sendInteractiveButtons(
        phoneNumberId: string,
        to: string,
        bodyText: string,
        buttons: { id: string; title: string }[],
        accessToken?: string
    ): Promise<string | null> {
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
                to,
                type: "interactive",
                interactive: {
                    type: "button",
                    body: { text: bodyText },
                    action: {
                        buttons: buttons.slice(0, 3).map(b => ({
                            type: "reply",
                            reply: {
                                id: b.id,
                                title: b.title.substring(0, 20), // WhatsApp limita a 20 chars
                            }
                        }))
                    }
                }
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log(`[WHATSAPP] Mensagem interativa enviada para ${to}`);
            return response.data?.messages?.[0]?.id || null;
        } catch (error: any) {
            console.error('[WHATSAPP] Erro ao enviar mensagem interativa:', error.response?.data || error.message);
            console.log('[WHATSAPP] Tentando fallback como texto simples...');
            return this.sendTextMessage(phoneNumberId, to, bodyText, token);
        }
    }
}
