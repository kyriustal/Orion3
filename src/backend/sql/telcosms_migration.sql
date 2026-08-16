-- ============================================================
-- MIGRAÇÃO: Configuração Multi-tenant da TelcoSMS
-- Executar no Supabase SQL Editor:
-- https://supabase.com/dashboard/project/iinubqqhkmopwyndjbja/sql
-- ============================================================

-- Adicionar colunas de TelcoSMS na tabela organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS telcosms_api_key   TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS telcosms_sender_id TEXT;

-- Recarregar cache de schema do PostgREST / Supabase
NOTIFY pgrst, 'reload schema';

-- Confirmar colunas
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'organizations'
  AND column_name IN ('telcosms_api_key', 'telcosms_sender_id')
ORDER BY column_name;
