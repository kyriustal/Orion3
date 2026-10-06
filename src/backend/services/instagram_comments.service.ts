import axios from 'axios';

/**
 * InstagramCommentsService — Responde automaticamente a comentários em posts/reels do Instagram
 * via Graph API v19.0
 */
export class InstagramCommentsService {
  /**
   * Responde publicamente a um comentário num post
   */
  static async replyToComment(
    commentId: string,
    message: string,
    accessToken: string
  ): Promise<boolean> {
    try {
      await axios.post(
        `https://graph.facebook.com/v19.0/${commentId}/replies`,
        { message },
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10_000 }
      );
      console.log(`[IG-COMMENTS] Reply publicado ao comentário ${commentId}`);
      return true;
    } catch (err: any) {
      console.error('[IG-COMMENTS] Erro ao responder comentário:', err.response?.data?.error?.message || err.message);
      return false;
    }
  }

  /**
   * Oculta um comentário (para spam/conteúdo impróprio)
   */
  static async hideComment(commentId: string, accessToken: string): Promise<void> {
    try {
      await axios.post(
        `https://graph.facebook.com/v19.0/${commentId}`,
        { hide: true },
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 5_000 }
      );
    } catch (_) { /* silencioso */ }
  }
}
