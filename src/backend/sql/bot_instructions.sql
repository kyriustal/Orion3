-- Tabela para instruções/conhecimentos específicos do bot (fragmentos de texto)
CREATE TABLE IF NOT EXISTS bot_instructions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index para performance
CREATE INDEX IF NOT EXISTS idx_bot_instructions_org ON bot_instructions(org_id);
