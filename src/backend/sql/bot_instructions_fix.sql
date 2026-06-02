-- ════════════════════════════════════════════════════════════════
-- MIGRAÇÃO: Corrigir FK da tabela bot_instructions
-- Problema: A constraint aponta para auth.users em vez de organizations
-- Solução: Recriar a FK apontando para public.organizations(id)
-- 
-- INSTRUÇÕES: Execute este script no SQL Editor do Supabase Dashboard
-- ════════════════════════════════════════════════════════════════

-- 1. Remover constraint errada
ALTER TABLE bot_instructions DROP CONSTRAINT IF EXISTS bot_instructions_org_id_fkey;

-- 2. Recriar constraint apontando para organizations
ALTER TABLE bot_instructions 
  ADD CONSTRAINT bot_instructions_org_id_fkey 
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- Confirmar
SELECT conname, confrelid::regclass AS references_table
FROM pg_constraint
WHERE conname = 'bot_instructions_org_id_fkey';
