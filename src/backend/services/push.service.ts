import webpush from 'web-push';
import { supabaseAdmin } from '../config/supabase';

// ─── Configurar chaves VAPID ──────────────────────────────────────────────────
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY  || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_EMAIL   = process.env.VAPID_EMAIL       || 'mailto:admin@orionboot.com';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
} else {
  console.warn('[PushService] ⚠️  Chaves VAPID não configuradas no .env. Web Push desativado.');
}

export interface PushAlertPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
  type: 'handover' | 'booking' | 'proposal' | 'confirmation';
}

export class PushService {
  /**
   * Envia uma Web Push Notification para TODOS os dispositivos registados de uma organização.
   */
  static async sendAlertToOrg(orgId: string, payload: PushAlertPayload): Promise<void> {
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      console.warn('[PushService] Chaves VAPID em falta — notificação push ignorada.');
      return;
    }

    try {
      const { data: subscriptions, error } = await supabaseAdmin
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('org_id', orgId);

      if (error || !subscriptions || subscriptions.length === 0) {
        console.log(`[PushService] Nenhuma assinatura de push para a org ${orgId}.`);
        return;
      }

      const notification = JSON.stringify({
        title:   payload.title,
        body:    payload.body,
        icon:    payload.icon  || '/favicon.png',
        badge:   payload.badge || '/favicon.png',
        tag:     payload.tag   || payload.type,
        url:     payload.url   || '/dashboard/live-chat',
        type:    payload.type,
      });

      const sendPromises = subscriptions.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth:   sub.auth,
          },
        };

        try {
          await webpush.sendNotification(pushSubscription, notification, {
            TTL: 60, // Expirar em 60 segundos se não entregue
          });
          console.log(`[PushService] ✅ Push enviado para: ${sub.endpoint.substring(0, 50)}...`);
        } catch (err: any) {
          // Se a assinatura expirou/inválida, limpar da base de dados
          if (err.statusCode === 404 || err.statusCode === 410) {
            console.log(`[PushService] Assinatura inválida/expirada. A remover...`);
            await supabaseAdmin
              .from('push_subscriptions')
              .delete()
              .eq('endpoint', sub.endpoint);
          } else {
            console.error(`[PushService] Erro ao enviar push:`, err.message);
          }
        }
      });

      await Promise.allSettled(sendPromises);
      console.log(`[PushService] Push enviado para ${subscriptions.length} dispositivo(s) da org ${orgId}.`);
    } catch (err: any) {
      console.error(`[PushService] Erro geral ao enviar push:`, err.message);
    }
  }

  /**
   * Retorna a chave pública VAPID para o frontend subscrever.
   */
  static getPublicKey(): string {
    return VAPID_PUBLIC;
  }
}
