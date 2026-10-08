-- ========================================================
-- TABELA DE TEMPLATES (HSM) DO WHATSAPP / META WABA
-- Armazena os modelos de mensagem e respetivos botões interativos
-- ========================================================

CREATE TABLE IF NOT EXISTS templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'MARKETING', -- 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  language    TEXT NOT NULL DEFAULT 'pt_BR',
  content     TEXT NOT NULL,
  buttons     JSONB DEFAULT '[]',                -- Guarda os botões interativos [{id, type, text, url, phone_number}]
  status      TEXT NOT NULL DEFAULT 'pending',   -- 'approved' | 'pending' | 'rejected'
  meta_id     TEXT,                              -- ID oficial atribuído pela Meta WABA
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_template_name_org UNIQUE (org_id, name)
);

-- Suporte a colunas extra em bases de dados existentes
ALTER TABLE templates ADD COLUMN IF NOT EXISTS buttons JSONB DEFAULT '[]';
ALTER TABLE templates ADD COLUMN IF NOT EXISTS meta_id TEXT;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'pt_BR';
ALTER TABLE templates ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'MARKETING';

-- Índices para pesquisa rápida por organização e estado
CREATE INDEX IF NOT EXISTS idx_templates_org_name ON templates(org_id, name);
CREATE INDEX IF NOT EXISTS idx_templates_status ON templates(status);

-- RLS (Row Level Security)
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members can manage templates" ON templates;
CREATE POLICY "Org members can manage templates" ON templates
  FOR ALL USING (org_id IN (
    SELECT org_id FROM team_members WHERE user_id = auth.uid()
  ));
