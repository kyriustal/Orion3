-- Tabela para guardar as assinaturas de Web Push Notifications por dispositivo
-- Execute este script no Editor SQL do Supabase

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL,
  user_id     UUID,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para pesquisa rápida por organização
CREATE INDEX IF NOT EXISTS idx_push_subs_org ON push_subscriptions(org_id);

-- Segurança RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org isolada - Push Subs" ON push_subscriptions
  USING (org_id = auth.jwt() ->> 'orgId');
