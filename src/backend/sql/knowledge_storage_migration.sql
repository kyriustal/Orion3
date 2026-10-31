-- ──────────────────────────────────────────────────────────────────────────────
-- MIGRATION: knowledge_docs — Adicionar colunas para ficheiro original no Storage
-- Executar no Supabase Dashboard > SQL Editor
-- ──────────────────────────────────────────────────────────────────────────────

-- Adicionar coluna storage_path (caminho no Supabase Storage bucket 'assets')
ALTER TABLE knowledge_docs
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS file_url     TEXT;

-- Índice opcional para listagem por storage_path
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_storage ON knowledge_docs(storage_path) WHERE storage_path IS NOT NULL;

-- Comentários descritivos
COMMENT ON COLUMN knowledge_docs.storage_path IS 'Caminho do ficheiro original no bucket Supabase Storage (assets/). NULL = documento antigo sem ficheiro original.';
COMMENT ON COLUMN knowledge_docs.file_url     IS 'URL pública do ficheiro original no Supabase Storage. NULL = sem ficheiro original.';
