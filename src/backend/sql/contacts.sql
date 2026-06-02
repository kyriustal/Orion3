-- ════════════════════════════════════════════════════════════════
-- Tabela de Contactos / Leads capturados automaticamente pelo bot
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS contacts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID REFERENCES organizations(id) ON DELETE CASCADE,
  phone       TEXT,
  name        TEXT,
  email       TEXT,
  notes       TEXT,
  source      TEXT DEFAULT 'whatsapp', -- 'whatsapp' | 'instagram' | 'facebook'
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_org   ON contacts(org_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(org_id, phone);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_contacts_updated_at ON contacts;
CREATE TRIGGER set_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_contacts_updated_at();
