import axios from 'axios';
import { supabaseAdmin } from '../config/supabase';

/**
 * TikTokService — Integração com TikTok Business API
 * 
 * Limitações importantes da plataforma:
 * - Sem webhooks de comentários em tempo real → polling periódico
 * - Requer conta TikTok Business verificada
 * - OAuth 2.0 com refresh token (token expira em 24h)
 */
export class TikTokService {
  private static readonly BASE_URL = 'https://business-api.tiktok.com/open_api/v1.3';
  private static readonly AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
  private static readonly TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';

  /**
   * Gera a URL de autorização OAuth para a conta TikTok Business
   */
  static getAuthUrl(clientKey: string, redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      client_key: clientKey,
      response_type: 'code',
      scope: 'user.info.basic,video.list,comment.list,comment.create',
      redirect_uri: redirectUri,
      state,
    });
    return `${this.AUTH_URL}?${params.toString()}`;
  }

  /**
   * Troca o código de autorização por access_token + refresh_token
   */
  static async exchangeCodeForToken(
    code: string,
    clientKey: string,
    clientSecret: string,
    redirectUri: string
  ): Promise<{ access_token: string; refresh_token: string; open_id: string; expires_in: number } | null> {
    try {
      const res = await axios.post(this.TOKEN_URL, {
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15_000,
      });

      const d = res.data?.data;
      if (!d?.access_token) throw new Error('Token não recebido');
      return d;
    } catch (err: any) {
      console.error('[TIKTOK] Erro ao trocar código por token:', err.response?.data || err.message);
      return null;
    }
  }

  /**
   * Renova o access_token usando o refresh_token
   */
  static async refreshToken(
    refreshToken: string,
    clientKey: string,
    clientSecret: string
  ): Promise<{ access_token: string; refresh_token: string; expires_in: number } | null> {
    try {
      const res = await axios.post(this.TOKEN_URL, {
        client_key: clientKey,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15_000,
      });

      const d = res.data?.data;
      if (!d?.access_token) throw new Error('Refresh falhou');
      return d;
    } catch (err: any) {
      console.error('[TIKTOK] Erro ao renovar token:', err.response?.data || err.message);
      return null;
    }
  }

  /**
   * Lista vídeos recentes da conta
   */
  static async listVideos(
    openId: string,
    accessToken: string,
    maxCount = 10
  ): Promise<any[]> {
    try {
      const res = await axios.post(
        'https://open.tiktokapis.com/v2/video/list/',
        { max_count: maxCount },
        {
          params: { fields: 'id,title,create_time,cover_image_url,share_url,comment_count' },
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 15_000,
        }
      );
      return res.data?.data?.videos || [];
    } catch (err: any) {
      console.error('[TIKTOK] Erro ao listar vídeos:', err.response?.data || err.message);
      return [];
    }
  }

  /**
   * Busca comentários de um vídeo (polling)
   */
  static async getComments(
    videoId: string,
    accessToken: string,
    cursor = 0
  ): Promise<{ comments: any[]; cursor: number; has_more: boolean }> {
    try {
      const res = await axios.post(
        'https://open.tiktokapis.com/v2/comment/list/',
        { video_id: videoId, count: 20, cursor },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 15_000,
        }
      );
      const d = res.data?.data || {};
      return {
        comments: d.comments || [],
        cursor: d.cursor || 0,
        has_more: d.has_more || false,
      };
    } catch (err: any) {
      console.error('[TIKTOK] Erro ao buscar comentários:', err.response?.data || err.message);
      return { comments: [], cursor: 0, has_more: false };
    }
  }

  /**
   * Responde a um comentário num vídeo
   */
  static async replyToComment(
    videoId: string,
    commentId: string,
    text: string,
    accessToken: string
  ): Promise<boolean> {
    try {
      const res = await axios.post(
        'https://open.tiktokapis.com/v2/comment/create/',
        { video_id: videoId, text, parent_comment_id: commentId },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 10_000,
        }
      );
      const ok = res.data?.error?.code === 'ok' || res.data?.data?.comment_id;
      if (ok) console.log(`[TIKTOK] Reply ao comentário ${commentId} no vídeo ${videoId}`);
      return !!ok;
    } catch (err: any) {
      console.error('[TIKTOK] Erro ao responder comentário:', err.response?.data || err.message);
      return false;
    }
  }

  /**
   * Busca perfil do utilizador autenticado
   */
  static async getUserInfo(accessToken: string): Promise<{ open_id: string; username: string; display_name: string } | null> {
    try {
      const res = await axios.get('https://open.tiktokapis.com/v2/user/info/', {
        params: { fields: 'open_id,username,display_name,avatar_url' },
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10_000,
      });
      return res.data?.data?.user || null;
    } catch (err: any) {
      console.error('[TIKTOK] Erro ao obter info do utilizador:', err.response?.data || err.message);
      return null;
    }
  }

  /**
   * Obtém ou renova o access_token guardado no Supabase para uma org
   */
  static async getValidToken(orgId: string): Promise<{ access_token: string; open_id: string } | null> {
    const { data: config } = await supabaseAdmin
      .from('tiktok_config')
      .select('access_token, refresh_token, token_expires_at, open_id, client_key, client_secret')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .maybeSingle();

    if (!config) return null;

    const expiresAt = config.token_expires_at ? new Date(config.token_expires_at) : null;
    const now = new Date();
    const isExpiringSoon = !expiresAt || (expiresAt.getTime() - now.getTime()) < 5 * 60 * 1000; // < 5 min

    if (isExpiringSoon && config.refresh_token) {
      const refreshed = await TikTokService.refreshToken(
        config.refresh_token,
        config.client_key,
        config.client_secret
      );
      if (refreshed) {
        const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000);
        await supabaseAdmin.from('tiktok_config').update({
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          token_expires_at: newExpiry.toISOString(),
        }).eq('org_id', orgId);
        return { access_token: refreshed.access_token, open_id: config.open_id };
      }
      return null;
    }

    return { access_token: config.access_token, open_id: config.open_id };
  }
}
