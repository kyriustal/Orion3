-- ==============================================================================
--                   ORION PLATFORM - ESQUEMA COMPLETO DE BASE DE DADOS
-- ==============================================================================
-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Função auxiliar para atualização automática de updated_at
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 1. ORGANIZATIONS (Empresas / Tenants)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email              TEXT NOT NULL,
  first_name               TEXT,
  last_name                TEXT,
  name                     TEXT NOT NULL,
  phone                    TEXT,
  whatsapp                 TEXT,
  address                  TEXT,
  maps_link                TEXT,
  contact_person           TEXT,
  social_object            TEXT,
  employees_count          TEXT,
  product_description      TEXT,
  chatbot_name             TEXT DEFAULT 'Assistente',
  calendar_provider        VARCHAR(50) DEFAULT 'none',
  calendar_link            TEXT,
  google_client_id         TEXT,
  google_client_secret     TEXT,
  google_refresh_token     TEXT,
  google_direct_url         TEXT,
  google_user_refresh_token TEXT,
  microsoft_client_id      TEXT,
  microsoft_client_secret   TEXT,
  microsoft_refresh_token   TEXT,
  telcosms_api_key         TEXT,
  telcosms_sender_id       TEXT,
  google_sheets_webhook_url TEXT,
  daily_report_email       TEXT,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER set_organizations_timestamp
BEFORE UPDATE ON organizations
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_organizations" ON organizations;
CREATE POLICY "service_role_organizations" ON organizations FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 2. TEAM_MEMBERS (Membros da equipa da organização)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_members (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  role       VARCHAR(50) NOT NULL DEFAULT 'AGENT', -- 'ADMIN', 'AGENT', 'VIEWER'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_members_org ON team_members(org_id);
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_team_members" ON team_members;
CREATE POLICY "service_role_team_members" ON team_members FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 3. WHATSAPP_CONFIG (Configuração Meta Cloud API WhatsApp)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  phone_number_id TEXT NOT NULL,
  waba_id         TEXT,
  access_token    TEXT NOT NULL,
  display_name    TEXT,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_config_phone ON whatsapp_config(phone_number_id);
ALTER TABLE whatsapp_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_whatsapp_config" ON whatsapp_config;
CREATE POLICY "service_role_whatsapp_config" ON whatsapp_config FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 4. FACEBOOK_CONFIG (Configuração Facebook Messenger)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS facebook_config (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  page_id           TEXT NOT NULL,
  access_token      TEXT,
  page_access_token TEXT,
  app_id            TEXT,
  app_secret        TEXT,
  display_name      TEXT,
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_facebook_config_page ON facebook_config(page_id);
ALTER TABLE facebook_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_facebook_config" ON facebook_config;
CREATE POLICY "service_role_facebook_config" ON facebook_config FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 5. INSTAGRAM_CONFIG (Configuração Instagram Direct API)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS instagram_config (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  instagram_user_id TEXT NOT NULL,
  page_id           TEXT,
  access_token      TEXT NOT NULL,
  display_name      TEXT,
  username          TEXT,
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instagram_config_user ON instagram_config(instagram_user_id);
ALTER TABLE instagram_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_instagram_config" ON instagram_config;
CREATE POLICY "service_role_instagram_config" ON instagram_config FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 6. CONVERSATION_HISTORY (Histórico unificado de conversas e mensagens)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversation_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_phone TEXT NOT NULL,
  sender         TEXT NOT NULL CHECK (sender IN ('user', 'bot', 'human', 'system')),
  text           TEXT,
  metadata       JSONB DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conv_history_org_phone ON conversation_history(org_id, customer_phone);
CREATE INDEX IF NOT EXISTS idx_conv_history_created ON conversation_history(created_at DESC);
ALTER TABLE conversation_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_conv_history" ON conversation_history;
CREATE POLICY "service_role_conv_history" ON conversation_history FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 7. CONTACTS (Leads e contactos capturados)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone      TEXT,
  name       TEXT,
  email      TEXT,
  notes      TEXT,
  source     TEXT DEFAULT 'whatsapp', -- 'whatsapp' | 'instagram' | 'facebook'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_org ON contacts(org_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(org_id, phone);

CREATE TRIGGER set_contacts_timestamp
BEFORE UPDATE ON contacts
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_contacts" ON contacts;
CREATE POLICY "service_role_contacts" ON contacts FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 8. BOOKINGS (Agendamentos e marcações)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  first_name       TEXT NOT NULL,
  last_name        TEXT,
  email            TEXT,
  phone            TEXT NOT NULL,
  service          TEXT,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_org ON bookings(org_id);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(appointment_date, appointment_time);
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_bookings" ON bookings;
CREATE POLICY "service_role_bookings" ON bookings FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 9. BUSINESS_HOURS (Horários de funcionamento por organização)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_hours (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_open     BOOLEAN NOT NULL DEFAULT false,
  open_time   TIME,
  close_time  TIME,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (org_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_business_hours_org ON business_hours(org_id);
ALTER TABLE business_hours ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_business_hours" ON business_hours;
CREATE POLICY "service_role_business_hours" ON business_hours FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 10. APPOINTMENT_REMINDERS (Lembretes e alertas automáticos de agendamento)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointment_reminders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  booking_id       UUID REFERENCES bookings(id) ON DELETE SET NULL,
  customer_name    TEXT NOT NULL,
  customer_phone   TEXT,
  customer_email   TEXT,
  subject          TEXT NOT NULL,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  reminder_stage   TEXT NOT NULL CHECK (reminder_stage IN ('instant', '7_days_before', '3_days_before', 'day_of_7am', 'post_appointment_review')),
  scheduled_at     TIMESTAMPTZ NOT NULL,
  channels         TEXT NOT NULL DEFAULT 'both' CHECK (channels IN ('email', 'sms', 'both')),
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  error_message    TEXT,
  sent_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointment_reminders_status_sched ON appointment_reminders(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointment_reminders_org_booking ON appointment_reminders(org_id, booking_id);
ALTER TABLE appointment_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_appointment_reminders" ON appointment_reminders;
CREATE POLICY "service_role_appointment_reminders" ON appointment_reminders FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 11. FOLLOWUP_SCHEDULES (Follow-ups automáticos e remarketing)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS followup_schedules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_phone   TEXT NOT NULL,
  platform         TEXT NOT NULL DEFAULT 'whatsapp' CHECK (platform IN ('whatsapp', 'facebook', 'instagram')),
  scheduled_at     TIMESTAMPTZ NOT NULL,
  last_message_id  TEXT,
  custom_prompt    TEXT,
  followup_step    INTEGER NOT NULL DEFAULT 1,
  context_snapshot TEXT,
  customer_name    TEXT,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled')),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_followup_status_scheduled ON followup_schedules(status, scheduled_at);
ALTER TABLE followup_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_followup_schedules" ON followup_schedules;
CREATE POLICY "service_role_followup_schedules" ON followup_schedules FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 12. BOT_INSTRUCTIONS (Fragmentos de conhecimento rápido da IA)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bot_instructions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title      TEXT,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_instructions_org ON bot_instructions(org_id);
ALTER TABLE bot_instructions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_bot_instructions" ON bot_instructions;
CREATE POLICY "service_role_bot_instructions" ON bot_instructions FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 13. KNOWLEDGE_DOCS (Documentos carregados na base de conhecimento da IA)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS knowledge_docs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  filename        TEXT NOT NULL,
  file_size       INTEGER,
  content         TEXT NOT NULL,
  content_preview TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_docs_org ON knowledge_docs(org_id);
ALTER TABLE knowledge_docs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_knowledge_docs" ON knowledge_docs;
CREATE POLICY "service_role_knowledge_docs" ON knowledge_docs FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 14. PUBLIC_ASSETS (Ficheiros e imagens que a IA e os agentes enviam)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public_assets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  file_url    TEXT NOT NULL,
  mime_type   TEXT,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_public_assets_org ON public_assets(org_id);
ALTER TABLE public_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_public_assets" ON public_assets;
CREATE POLICY "service_role_public_assets" ON public_assets FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 15. TEMPLATES (Modelos de mensagem WhatsApp / Meta)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  category   TEXT,
  language   TEXT DEFAULT 'pt_BR',
  content    TEXT,
  status     TEXT DEFAULT 'pending',
  meta_id    TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_template_name_org UNIQUE (org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_templates_org ON templates(org_id);
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_templates" ON templates;
CREATE POLICY "service_role_templates" ON templates FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 16. CAMPAIGNS (Disparos em massa e campanhas)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaigns (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  template   TEXT,
  audience   TEXT,
  status     TEXT NOT NULL DEFAULT 'SENDING',
  progress   INTEGER NOT NULL DEFAULT 0,
  filters    TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_org ON campaigns(org_id);
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_campaigns" ON campaigns;
CREATE POLICY "service_role_campaigns" ON campaigns FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 17. AUTOMATIONS (Automações e fluxos)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS automations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  type       TEXT,
  config     JSONB,
  status     TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automations_org ON automations(org_id);
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_automations" ON automations;
CREATE POLICY "service_role_automations" ON automations FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 18. PUSH_SUBSCRIPTIONS (Assinaturas Web Push de Notificações do Navegador)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    UUID,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subs_org ON push_subscriptions(org_id);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_push_subscriptions" ON push_subscriptions;
CREATE POLICY "service_role_push_subscriptions" ON push_subscriptions FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 19. SUBSCRIPTIONS (Assinaturas e planos SaaS dos clientes)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  email         TEXT,
  plan          TEXT NOT NULL DEFAULT 'trial', -- 'trial', 'starter', 'pro', 'enterprise', 'debt', 'none'
  status        TEXT NOT NULL DEFAULT 'active', -- 'active', 'expired', 'debt'
  trial_ends_at TIMESTAMPTZ,
  plan_ends_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions(org_id);
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_subscriptions" ON subscriptions;
CREATE POLICY "service_role_subscriptions" ON subscriptions FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 20. PAYMENTS (Pagamentos Multicaixa Express / Proxypay)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  reference   TEXT NOT NULL,
  entity      TEXT NOT NULL,
  amount      BIGINT NOT NULL,
  plan        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'paid', 'expired'
  proxypay_id TEXT,
  paid_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(reference);
CREATE INDEX IF NOT EXISTS idx_payments_org ON payments(org_id);
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_payments" ON payments;
CREATE POLICY "service_role_payments" ON payments FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 21. FRAUD_FLAGS (Registo de tentativas de abuso de trial gratuito)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fraud_flags (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  new_org_id     UUID,
  new_email      TEXT,
  matched_org_id UUID,
  matched_field  TEXT,
  matched_value  TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fraud_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_fraud_flags" ON fraud_flags;
CREATE POLICY "service_role_fraud_flags" ON fraud_flags FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 22. VIPS (Lista de contas e telefones VIP com acesso ilimitado)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vips (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT UNIQUE NOT NULL,
  phone      TEXT,
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE vips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_vips" ON vips;
CREATE POLICY "service_role_vips" ON vips FOR ALL USING (true) WITH CHECK (true);
