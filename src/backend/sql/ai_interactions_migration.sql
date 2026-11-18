-- ------------------------------------------------------------------------------
-- AI_INTERACTIONS (Métricas de qualidade da IA — página Insights)
-- Uma linha por interação processada pela IA em qualquer canal.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_interactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel             TEXT NOT NULL DEFAULT 'whatsapp', -- 'whatsapp' | 'instagram' | 'facebook' | 'email' | 'webchat' | 'tiktok' | 'sms'
  customer_phone      TEXT NOT NULL,
  customer_message    TEXT,
  success             BOOLEAN NOT NULL DEFAULT TRUE,
  transferred         BOOLEAN NOT NULL DEFAULT FALSE,  -- cliente pediu atendimento humano
  booking_created     BOOLEAN NOT NULL DEFAULT FALSE,  -- interação gerou agendamento
  proposal            BOOLEAN NOT NULL DEFAULT FALSE,  -- proposta comercial detectada
  confirm             BOOLEAN NOT NULL DEFAULT FALSE,  -- dúvida fora da base (confirmar info)
  attempts            INT  NOT NULL DEFAULT 1,          -- tentativas do protocolo de auto-cura (1-3)
  response_latency_ms INT,                              -- tempo total entre receber e responder
  error_message       TEXT,
  metadata            JSONB DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_interactions_org_created ON ai_interactions(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_org_channel ON ai_interactions(org_id, channel);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_customer ON ai_interactions(org_id, customer_phone);

ALTER TABLE ai_interactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_ai_interactions" ON ai_interactions;
CREATE POLICY "service_role_ai_interactions" ON ai_interactions FOR ALL USING (true) WITH CHECK (true);
