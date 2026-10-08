-- ════════════════════════════════════════════════════════════════
-- Migração: adicionar unique constraint em contacts(org_id, phone)
-- Necessário para o upsert de contactos funcionar corretamente
-- Execute este script no Supabase SQL Editor
-- ════════════════════════════════════════════════════════════════

-- 1. Remover duplicados antes de criar a constraint
-- (mantém o mais antigo de cada par org_id+phone)
DELETE FROM contacts
WHERE id NOT IN (
  SELECT DISTINCT ON (org_id, phone) id
  FROM contacts
  ORDER BY org_id, phone, created_at ASC
);

-- 2. Adicionar unique constraint (se ainda não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contacts_org_id_phone_key'
  ) THEN
    ALTER TABLE contacts ADD CONSTRAINT contacts_org_id_phone_key UNIQUE (org_id, phone);
  END IF;
END
$$;

-- 3. Adicionar coluna email se não existir
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email TEXT;

-- 4. Recarregar schema cache do PostgREST
NOTIFY pgrst, 'reload schema';
