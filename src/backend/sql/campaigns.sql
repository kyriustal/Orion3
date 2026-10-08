-- ========================================================
-- FIX COMPLETO PARA A TABELA CAMPAIGNS
-- Garante a criação da tabela e adição de TODAS as colunas
-- ========================================================

CREATE TABLE IF NOT EXISTS campaigns (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id             UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name               TEXT NOT NULL DEFAULT '',
    template           TEXT NOT NULL DEFAULT '',
    template_variables JSONB DEFAULT '{}',
    buttons            JSONB DEFAULT '[]',
    audience           TEXT NOT NULL DEFAULT 'all',
    filters            JSONB DEFAULT '{}',
    status             TEXT NOT NULL DEFAULT 'SENDING',
    progress           INTEGER DEFAULT 0,
    total_contacts     INTEGER DEFAULT 0,
    sent_count         INTEGER DEFAULT 0,
    failed_count       INTEGER DEFAULT 0,
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Adicionar TODAS as colunas individualmente caso a tabela já existisse com estrutura antiga
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS name               TEXT NOT NULL DEFAULT '';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS template           TEXT NOT NULL DEFAULT '';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS template_variables JSONB DEFAULT '{}';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS buttons            JSONB DEFAULT '[]';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS audience           TEXT NOT NULL DEFAULT 'all';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS filters            JSONB DEFAULT '{}';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS status             TEXT NOT NULL DEFAULT 'SENDING';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS progress           INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS total_contacts     INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sent_count         INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS failed_count       INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS created_at         TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ DEFAULT NOW();

-- Recarregar o cache do PostgREST / Supabase (OBRIGATÓRIO)
NOTIFY pgrst, 'reload schema';

-- RLS
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members can manage campaigns" ON campaigns;
CREATE POLICY "Org members can manage campaigns" ON campaigns FOR ALL USING (true);

-- Índices
CREATE INDEX IF NOT EXISTS idx_campaigns_org_id ON campaigns(org_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
