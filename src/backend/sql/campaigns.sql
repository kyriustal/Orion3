-- ========================================================
-- TABELA DE CAMPANHAS DE DISPARO EM MASSA
-- ========================================================

CREATE TABLE IF NOT EXISTS campaigns (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id             UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name               TEXT NOT NULL,
    template           TEXT NOT NULL,
    template_variables JSONB DEFAULT '{}',
    buttons            JSONB DEFAULT '[]',
    audience           TEXT NOT NULL DEFAULT 'all',
    filters            JSONB DEFAULT '{}',
    status             TEXT NOT NULL DEFAULT 'SENDING' CHECK (status IN ('SENDING', 'PAUSED', 'COMPLETED', 'FAILED', 'SCHEDULED')),
    progress           INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    total_contacts     INTEGER DEFAULT 0,
    sent_count         INTEGER DEFAULT 0,
    failed_count       INTEGER DEFAULT 0,
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Garantir que todas as colunas existem se a tabela já tinha sido criada anteriormente
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS audience           TEXT NOT NULL DEFAULT 'all';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS filters            JSONB DEFAULT '{}';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS buttons            JSONB DEFAULT '[]';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS template_variables JSONB DEFAULT '{}';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS progress           INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS total_contacts     INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sent_count         INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS failed_count       INTEGER DEFAULT 0;

-- Recarregar o cache do PostgREST / Supabase
NOTIFY pgrst, 'reload schema';

-- RLS (Row Level Security)
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can manage campaigns" ON campaigns;
CREATE POLICY "Org members can manage campaigns"
ON campaigns
FOR ALL
USING (org_id IN (
    SELECT org_id FROM team_members WHERE user_id = auth.uid()
));

-- Índices para otimização de performance
CREATE INDEX IF NOT EXISTS idx_campaigns_org_id ON campaigns(org_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
