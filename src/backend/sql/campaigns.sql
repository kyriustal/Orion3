-- Criação da tabela de campanhas
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    template TEXT NOT NULL,
    template_variables JSONB DEFAULT '{}',
    audience TEXT NOT NULL DEFAULT 'all',
    filters JSONB DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'SENDING' CHECK (status IN ('SENDING', 'PAUSED', 'COMPLETED', 'FAILED', 'SCHEDULED')),
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    total_contacts INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage campaigns"
ON campaigns
FOR ALL
USING (org_id IN (
    SELECT org_id FROM team_members WHERE user_id = auth.uid()
));

-- Index para performance
CREATE INDEX IF NOT EXISTS idx_campaigns_org_id ON campaigns(org_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
