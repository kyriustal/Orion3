-- ============================================================
-- MIGRAÇÃO: Campos de Telefone e Link do Google Maps da Empresa
-- Executar no Supabase SQL Editor:
-- https://supabase.com/dashboard/project/iinubqqhkmopwyndjbja/sql
-- ============================================================

-- Adicionar coluna maps_link na tabela organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS maps_link TEXT;

-- Recarregar cache de schema do PostgREST / Supabase
NOTIFY pgrst, 'reload schema';

-- Confirmar colunas
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'organizations'
  AND column_name IN ('phone', 'whatsapp', 'address', 'maps_link')
ORDER BY column_name;
