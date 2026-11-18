-- ------------------------------------------------------------------------------
-- KNOWLEDGE_SUGGESTIONS (Auto-melhoria da base de conhecimento)
-- Perguntas que a IA não soube responder, com resposta sugerida pela IA,
-- aguardando aprovação humana para entrar na base de conhecimento.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS knowledge_suggestions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  question         TEXT NOT NULL,
  suggested_answer TEXT,
  status           TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  channel          TEXT DEFAULT 'whatsapp',
  customer_phone   TEXT,
  occurrences      INT NOT NULL DEFAULT 1,          -- quantas vezes a pergunta se repetiu
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_suggestions_org_status ON knowledge_suggestions(org_id, status);
CREATE INDEX IF NOT EXISTS idx_knowledge_suggestions_created ON knowledge_suggestions(org_id, created_at DESC);

DROP TRIGGER IF EXISTS set_knowledge_suggestions_timestamp ON knowledge_suggestions;
CREATE TRIGGER set_knowledge_suggestions_timestamp
BEFORE UPDATE ON knowledge_suggestions
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

ALTER TABLE knowledge_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_knowledge_suggestions" ON knowledge_suggestions;
CREATE POLICY "service_role_knowledge_suggestions" ON knowledge_suggestions FOR ALL USING (true) WITH CHECK (true);
