-- ════════════════════════════════════════════════════════════════
-- Migração facebook_config: adicionar colunas em falta
-- Execute no Supabase SQL Editor
-- ════════════════════════════════════════════════════════════════

-- Adicionar colunas que podem não existir na tabela original
ALTER TABLE facebook_config ADD COLUMN IF NOT EXISTS page_access_token text;
ALTER TABLE facebook_config ADD COLUMN IF NOT EXISTS app_id            text;
ALTER TABLE facebook_config ADD COLUMN IF NOT EXISTS app_secret        text;
ALTER TABLE facebook_config ADD COLUMN IF NOT EXISTS display_name      text;
ALTER TABLE facebook_config ADD COLUMN IF NOT EXISTS comment_automation_enabled boolean DEFAULT false;
ALTER TABLE facebook_config ADD COLUMN IF NOT EXISTS comment_private_reply      boolean DEFAULT true;
ALTER TABLE facebook_config ADD COLUMN IF NOT EXISTS comment_prompt             text;

-- Garantir que existe índice por org_id
CREATE INDEX IF NOT EXISTS idx_facebook_config_org ON facebook_config(org_id);

-- Recarregar schema cache do PostgREST
NOTIFY pgrst, 'reload schema';
