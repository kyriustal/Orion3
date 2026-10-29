/**
 * Orion AI — Service Worker para Web Push Notifications
 * Executa em segundo plano no browser mesmo quando o painel está fechado.
 */

const CACHE_NAME = 'orion-sw-v1';
const LIVE_CHAT_URL = '/dashboard/live-chat';

// ─── Evento de Instalação ─────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Orion Service Worker instalado.');
  self.skipWaiting(); // Ativar imediatamente sem esperar pelo reload
});

// ─── Evento de Ativação ───────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Orion Service Worker ativado.');
  event.waitUntil(self.clients.claim()); // Tomar controlo de todos os clientes
});

// ─── Evento de Push (chamado pelo servidor via web-push) ──────────────────────
self.addEventListener('push', (event) => {
  console.log('[SW] Evento push recebido.');

  let data = {
    title: '🔔 Orion AI — Nova Notificação',
    body:  'Há um novo evento que requer a tua atenção.',
    icon:  '/favicon.png',
    badge: '/favicon.png',
    tag:   'orion-alert',
    url:   LIVE_CHAT_URL,
    type:  'info',
  };

  try {
    if (event.data) {
      data = { ...data, ...JSON.parse(event.data.text()) };
    }
  } catch (e) {
    console.warn('[SW] Erro ao parsear dados do push:', e);
  }

  // Escolher emoji e cor com base no tipo
  const isHandover = data.type === 'handover';
  const title = isHandover
    ? '🚨 Pedido de Atendimento Humano'
    : '📅 Novo Pedido de Agendamento';

  const options = {
    body:              data.body,
    icon:              data.icon  || '/favicon.png',
    badge:             data.badge || '/favicon.png',
    tag:               data.tag   || 'orion-alert',
    renotify:          true,   // Tocar som mesmo que a notificação já exista com o mesmo tag
    requireInteraction: isHandover, // Notificações de handover ficam até ser clicadas
    vibrate:           isHandover ? [200, 100, 200, 100, 200] : [200, 100, 200],
    data: {
      url:  data.url || LIVE_CHAT_URL,
      type: data.type,
    },
    actions: [
      { action: 'open', title: '📂 Abrir Live Chat' },
      { action: 'dismiss', title: 'Fechar' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ─── Evento de Clique na Notificação ─────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || LIVE_CHAT_URL;

  if (event.action === 'dismiss') return;

  // Focar janela existente ou abrir nova
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Tentar encontrar uma janela já aberta da Orion
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      // Nenhuma janela aberta — abrir nova
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// ─── Evento de Fecho da Notificação ──────────────────────────────────────────
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notificação fechada:', event.notification.tag);
});
