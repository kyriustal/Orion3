-- Atualização da tabela de templates para suportar sincronização com a Meta
ALTER TABLE templates ADD COLUMN IF NOT EXISTS meta_id TEXT;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'pt_BR';

-- Tornar nome e org_id únicos para permitir UPSERT (sincronização)
-- Primeiro removemos duplicatas se existirem (mantendo a mais recente)
DELETE FROM templates a USING templates b 
WHERE a.id < b.id AND a.name = b.name AND a.org_id = b.org_id;

-- Adicionar a restrição unique
ALTER TABLE templates DROP CONSTRAINT IF EXISTS unique_template_name_org;
ALTER TABLE templates ADD CONSTRAINT unique_template_name_org UNIQUE (org_id, name);
