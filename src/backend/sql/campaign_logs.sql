-- ========================================================
-- TABELA DE LOGS DE DISPAROS DE CAMPANHAS
-- Regista cada número de telefone que recebeu a mensagem
-- ========================================================

CREATE TABLE IF NOT EXISTS campaign_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_phone TEXT NOT NULL,
  customer_name  TEXT,
  status         TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  message_id     TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para pesquisas rápidas no relatório
CREATE INDEX IF NOT EXISTS idx_campaign_logs_campaign ON campaign_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_org ON campaign_logs(org_id);

-- RLS (Row Level Security)
ALTER TABLE campaign_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members can view campaign logs" ON campaign_logs;
CREATE POLICY "Org members can view campaign logs" ON campaign_logs
  FOR ALL USING (org_id IN (
    SELECT org_id FROM team_members WHERE user_id = auth.uid()
  ));
