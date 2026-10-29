"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PushService = void 0;
const web_push_1 = __importDefault(require("web-push"));
const supabase_1 = require("../config/supabase");
// ─── Configurar chaves VAPID ──────────────────────────────────────────────────
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@orionboot.com';
if (VAPID_PUBLIC && VAPID_PRIVATE) {
    web_push_1.default.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
}
else {
    console.warn('[PushService] ⚠️  Chaves VAPID não configuradas no .env. Web Push desativado.');
}
class PushService {
    /**
     * Envia uma Web Push Notification para TODOS os dispositivos registados de uma organização.
     */
    static async sendAlertToOrg(orgId, payload) {
        if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
            console.warn('[PushService] Chaves VAPID em falta — notificação push ignorada.');
            return;
        }
        try {
            const { data: subscriptions, error } = await supabase_1.supabaseAdmin
                .from('push_subscriptions')
                .select('endpoint, p256dh, auth')
                .eq('org_id', orgId);
            if (error || !subscriptions || subscriptions.length === 0) {
                console.log(`[PushService] Nenhuma assinatura de push para a org ${orgId}.`);
                return;
            }
            const notification = JSON.stringify({
                title: payload.title,
                body: payload.body,
                icon: payload.icon || '/favicon.png',
                badge: payload.badge || '/favicon.png',
                tag: payload.tag || payload.type,
                url: payload.url || '/dashboard/live-chat',
                type: payload.type,
            });
            const sendPromises = subscriptions.map(async (sub) => {
                const pushSubscription = {
                    endpoint: sub.endpoint,
                    keys: {
                        p256dh: sub.p256dh,
                        auth: sub.auth,
                    },
                };
                try {
                    await web_push_1.default.sendNotification(pushSubscription, notification, {
                        TTL: 60, // Expirar em 60 segundos se não entregue
                    });
                    console.log(`[PushService] ✅ Push enviado para: ${sub.endpoint.substring(0, 50)}...`);
                }
                catch (err) {
                    // Se a assinatura expirou/inválida, limpar da base de dados
                    if (err.statusCode === 404 || err.statusCode === 410) {
                        console.log(`[PushService] Assinatura inválida/expirada. A remover...`);
                        await supabase_1.supabaseAdmin
                            .from('push_subscriptions')
                            .delete()
                            .eq('endpoint', sub.endpoint);
                    }
                    else {
                        console.error(`[PushService] Erro ao enviar push:`, err.message);
                    }
                }
            });
            await Promise.allSettled(sendPromises);
            console.log(`[PushService] Push enviado para ${subscriptions.length} dispositivo(s) da org ${orgId}.`);
        }
        catch (err) {
            console.error(`[PushService] Erro geral ao enviar push:`, err.message);
        }
    }
    /**
     * Retorna a chave pública VAPID para o frontend subscrever.
     */
    static getPublicKey() {
        return VAPID_PUBLIC;
    }
}
exports.PushService = PushService;
