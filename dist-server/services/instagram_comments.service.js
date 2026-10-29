"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstagramCommentsService = void 0;
const axios_1 = __importDefault(require("axios"));
/**
 * InstagramCommentsService — Responde automaticamente a comentários em posts/reels do Instagram
 * via Graph API v19.0
 */
class InstagramCommentsService {
    /**
     * Responde publicamente a um comentário num post
     */
    static async replyToComment(commentId, message, accessToken) {
        try {
            await axios_1.default.post(`https://graph.facebook.com/v19.0/${commentId}/replies`, { message }, { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10_000 });
            console.log(`[IG-COMMENTS] Reply publicado ao comentário ${commentId}`);
            return true;
        }
        catch (err) {
            console.error('[IG-COMMENTS] Erro ao responder comentário:', err.response?.data?.error?.message || err.message);
            return false;
        }
    }
    /**
     * Oculta um comentário (para spam/conteúdo impróprio)
     */
    static async hideComment(commentId, accessToken) {
        try {
            await axios_1.default.post(`https://graph.facebook.com/v19.0/${commentId}`, { hide: true }, { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 5_000 });
        }
        catch (_) { /* silencioso */ }
    }
}
exports.InstagramCommentsService = InstagramCommentsService;
