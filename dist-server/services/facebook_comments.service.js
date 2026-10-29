"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FacebookCommentsService = void 0;
const axios_1 = __importDefault(require("axios"));
/**
 * FacebookCommentsService — Responde automaticamente a comentários em posts de Facebook Pages
 * via Graph API v19.0
 */
class FacebookCommentsService {
    /**
     * Responde a um comentário público num post da página
     */
    static async replyToComment(commentId, message, accessToken) {
        try {
            await axios_1.default.post(`https://graph.facebook.com/v19.0/${commentId}/comments`, { message }, { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10_000 });
            console.log(`[FB-COMMENTS] Resposta publicada ao comentário ${commentId}`);
            return true;
        }
        catch (err) {
            console.error('[FB-COMMENTS] Erro ao responder comentário:', err.response?.data?.error?.message || err.message);
            return false;
        }
    }
    /**
     * Envia uma DM privada ao autor do comentário (Private Reply)
     */
    static async sendPrivateReply(commentId, message, accessToken) {
        try {
            await axios_1.default.post(`https://graph.facebook.com/v19.0/me/messages`, {
                recipient: { comment_id: commentId },
                message: { text: message },
                messaging_type: 'RESPONSE',
            }, { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10_000 });
            console.log(`[FB-COMMENTS] Private Reply enviado ao comentário ${commentId}`);
            return true;
        }
        catch (err) {
            console.warn('[FB-COMMENTS] Private Reply falhou (pode não suportado):', err.response?.data?.error?.message || err.message);
            return false;
        }
    }
    /**
     * Oculta um comentário (para spam/ofensivo)
     */
    static async hideComment(commentId, accessToken) {
        try {
            await axios_1.default.post(`https://graph.facebook.com/v19.0/${commentId}`, { is_hidden: true }, { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 5_000 });
        }
        catch (_) { /* silencioso */ }
    }
}
exports.FacebookCommentsService = FacebookCommentsService;
