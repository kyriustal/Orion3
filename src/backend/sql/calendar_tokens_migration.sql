-- ============================================================
-- MIGRAÇÃO: Colunas de tokens OAuth para Google & Microsoft Calendar
-- Executar no Supabase SQL Editor:
-- https://supabase.com/dashboard/project/iinubqqhkmopwyndjbja/sql
-- ============================================================

-- Colunas de provedor de calendário
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS calendar_provider  VARCHAR(50) DEFAULT 'none';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS calendar_link      TEXT;

-- Google Calendar OAuth tokens
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS google_client_id         TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS google_client_secret      TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS google_refresh_token      TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS google_direct_url         TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS google_user_refresh_token TEXT;

-- Microsoft Calendar OAuth tokens
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS microsoft_client_id     TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS microsoft_client_secret  TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS microsoft_refresh_token  TEXT;

-- Confirmar colunas criadas
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'organizations'
  AND column_name IN (
    'calendar_provider',
    'calendar_link',
    'google_client_id',
    'google_client_secret',
    'google_refresh_token',
    'google_direct_url',
    'google_user_refresh_token',
    'microsoft_client_id',
    'microsoft_client_secret',
    'microsoft_refresh_token'
  )
ORDER BY column_name;
