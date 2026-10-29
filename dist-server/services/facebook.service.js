"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FacebookService = void 0;
const axios_1 = __importDefault(require("axios"));
class FacebookService {
    /**
     * Envia uma mensagem no Messenger
     */
    static async sendMessage(pageId, recipientId, text, accessToken) {
        try {
            // Tentar primeiro no endpoint /{pageId}/messages
            const url = `https://graph.facebook.com/v19.0/${pageId}/messages`;
            const response = await axios_1.default.post(url, {
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
        }
        catch (error) {
            // Se falhar com pageId, tentar fallback com 'me/messages' se for Page Token
            const metaError = error.response?.data?.error;
            const detail = metaError?.message || error.message;
            console.warn(`[FACEBOOK] Falha no endpoint /${pageId}/messages (${detail}). A tentar fallback /me/messages...`);
            try {
                const fallbackUrl = `https://graph.facebook.com/v19.0/me/messages`;
                const fbResponse = await axios_1.default.post(fallbackUrl, {
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
            }
            catch (fallbackErr) {
                const finalError = fallbackErr.response?.data?.error?.message || fallbackErr.message || detail;
                console.error('[FACEBOOK] Erro definitivo ao enviar mensagem:', fallbackErr.response?.data || fallbackErr.message);
                throw new Error(`Facebook API send error: ${finalError}`);
            }
        }
    }
    /**
     * Envia indicador de digitação (typing_on / typing_off)
     */
    static async sendTypingIndicator(pageId, recipientId, accessToken, action = 'typing_on') {
        try {
            const url = `https://graph.facebook.com/v19.0/${pageId}/messages`;
            await axios_1.default.post(url, {
                recipient: { id: recipientId },
                sender_action: action
            }, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                timeout: 5000
            });
        }
        catch (error) {
            console.warn('[FACEBOOK] Erro ao enviar typing indicator:', error.response?.data?.error?.message || error.message);
        }
    }
    /**
     * Marca uma mensagem como lida (mark_seen)
     */
    static async markSeen(pageId, recipientId, accessToken) {
        try {
            const url = `https://graph.facebook.com/v19.0/${pageId}/messages`;
            await axios_1.default.post(url, {
                recipient: { id: recipientId },
                sender_action: 'mark_seen'
            }, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                timeout: 5000
            });
        }
        catch (_) { /* silencioso */ }
    }
    /**
     * Subscreve a página para receber eventos de webhook da aplicação (messages, messaging_postbacks, etc.)
     */
    static async subscribePageToApp(pageId, accessToken) {
        const url = `https://graph.facebook.com/v19.0/${pageId}/subscribed_apps`;
        // Tentativa 1: Campos completos (mensagens + feed)
        try {
            const res = await axios_1.default.post(url, {
                subscribed_fields: ['messages', 'messaging_postbacks', 'messaging_optins', 'message_deliveries', 'message_reads', 'feed']
            }, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });
            console.log(`[FACEBOOK] Subscrição de webhook da página ${pageId} realizada com sucesso (campos completos):`, res.data);
            return { success: true };
        }
        catch (err) {
            console.warn(`[FACEBOOK] Tentativa 1 falhou com feed, tentando apenas campos de mensagens...`);
        }
        // Tentativa 2: Apenas campos essenciais de mensagens do Messenger
        try {
            const res = await axios_1.default.post(url, {
                subscribed_fields: ['messages', 'messaging_postbacks', 'messaging_optins', 'message_deliveries', 'message_reads']
            }, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });
            console.log(`[FACEBOOK] Subscrição de webhook da página ${pageId} realizada com sucesso (apenas mensagens):`, res.data);
            return { success: true };
        }
        catch (err) {
            console.warn(`[FACEBOOK] Tentativa 2 falhou, tentando subscrição padrão do app...`);
        }
        // Tentativa 3: Subscrição padrão sem body explícito (usa configurações da Meta App)
        try {
            const res = await axios_1.default.post(url, {}, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });
            console.log(`[FACEBOOK] Subscrição de webhook padrão realizada com sucesso:`, res.data);
            return { success: true };
        }
        catch (err) {
            const detail = err.response?.data?.error?.message || err.message;
            console.warn(`[FACEBOOK] Falha definitiva ao subscrever app à página ${pageId}: ${detail}`);
            return { success: false, error: detail };
        }
    }
    /**
     * Valida o token e permissões junto à Meta Graph API
     */
    static async validatePageToken(pageId, accessToken) {
        try {
            // 1. Verificar informações do token / me
            const meRes = await axios_1.default.get('https://graph.facebook.com/v19.0/me', {
                params: { access_token: accessToken, fields: 'id,name' },
                timeout: 10000
            });
            const meData = meRes.data || {};
            let pageName = meData.name;
            let actualPageId = meData.id;
            // Se for diferente do pageId fornecido, verificar especificamente o pageId
            if (pageId && pageId !== meData.id) {
                try {
                    const pageRes = await axios_1.default.get(`https://graph.facebook.com/v19.0/${pageId}`, {
                        params: { access_token: accessToken, fields: 'id,name' },
                        timeout: 10000
                    });
                    if (pageRes.data?.id) {
                        actualPageId = pageRes.data.id;
                        pageName = pageRes.data.name || pageName;
                    }
                }
                catch (_) { }
            }
            // 2. Verificar permissões concedidas ao token
            let permissions = [];
            try {
                const permRes = await axios_1.default.get('https://graph.facebook.com/v19.0/me/permissions', {
                    params: { access_token: accessToken },
                    timeout: 10000
                });
                const permData = permRes.data?.data || [];
                permissions = permData
                    .filter((p) => p.status === 'granted')
                    .map((p) => p.permission);
            }
            catch (_) { }
            // Permissões necessárias para Messenger
            const hasMessaging = permissions.includes('pages_messaging');
            // 3. Tentar verificar se já está subscrito
            let subscribed = false;
            try {
                const targetId = pageId || actualPageId;
                const subRes = await axios_1.default.get(`https://graph.facebook.com/v19.0/${targetId}/subscribed_apps`, {
                    params: { access_token: accessToken },
                    timeout: 10000
                });
                subscribed = Array.isArray(subRes.data?.data) && subRes.data.data.length > 0;
            }
            catch (_) { }
            return {
                valid: true,
                pageId: actualPageId || pageId,
                pageName: pageName || 'Página Facebook',
                permissions,
                hasMessaging,
                subscribed
            };
        }
        catch (err) {
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
exports.FacebookService = FacebookService;
