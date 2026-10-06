-- ==============================================================================
-- Migration: Automação de Canais (Facebook, Instagram, TikTok e E-mail Inbox)
-- ==============================================================================

-- 1. Facebook Comments Automation
ALTER TABLE facebook_config ADD COLUMN IF NOT EXISTS comment_automation_enabled boolean DEFAULT false;
ALTER TABLE facebook_config ADD COLUMN IF NOT EXISTS comment_private_reply boolean DEFAULT true;
ALTER TABLE facebook_config ADD COLUMN IF NOT EXISTS comment_prompt text;

-- 2. Instagram Comments Automation
CREATE TABLE IF NOT EXISTS instagram_config (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  instagram_account_id text,
  page_access_token text,
  is_active boolean DEFAULT true,
  comment_automation_enabled boolean DEFAULT false,
  comment_prompt text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id)
);
ALTER TABLE instagram_config ADD COLUMN IF NOT EXISTS comment_automation_enabled boolean DEFAULT false;
ALTER TABLE instagram_config ADD COLUMN IF NOT EXISTS comment_prompt text;

-- 3. TikTok Business Config & Comments Automation
CREATE TABLE IF NOT EXISTS tiktok_config (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_key text,
  client_secret text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  display_name text,
  avatar_url text,
  is_active boolean DEFAULT true,
  comment_automation_enabled boolean DEFAULT false,
  comment_prompt text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id)
);

-- RLS TikTok
ALTER TABLE tiktok_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_tiktok" ON tiktok_config;
CREATE POLICY "service_role_all_tiktok" ON tiktok_config FOR ALL USING (true) WITH CHECK (true);

-- 4. Email Inbox (IMAP / SMTP) Automation
CREATE TABLE IF NOT EXISTS email_inbox_config (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  imap_host text NOT NULL,
  imap_port integer DEFAULT 993,
  imap_user text NOT NULL,
  imap_password text NOT NULL,
  imap_tls boolean DEFAULT true,
  smtp_host text,
  smtp_port integer DEFAULT 587,
  smtp_user text,
  smtp_password text,
  smtp_from text,
  is_active boolean DEFAULT true,
  automation_enabled boolean DEFAULT false,
  auto_reply_prompt text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id)
);

-- RLS Email Inbox
ALTER TABLE email_inbox_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_email_inbox" ON email_inbox_config;
CREATE POLICY "service_role_all_email_inbox" ON email_inbox_config FOR ALL USING (true) WITH CHECK (true);
