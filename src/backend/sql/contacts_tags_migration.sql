-- ════════════════════════════════════════════════════════════════
-- Migração: Suporte a Tags e Notas na tabela contacts
-- Permite filtragem por tags e notas nas campanhas
-- ════════════════════════════════════════════════════════════════

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email TEXT;

-- Índice GIN para busca rápida por tags
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts USING GIN (tags);

-- Recarregar o cache do PostgREST
NOTIFY pgrst, 'reload schema';
