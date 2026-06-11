-- Adicionar colunas de calendário à tabela organizations se não existirem
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS calendar_provider VARCHAR(50) DEFAULT 'none';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS calendar_link TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS google_client_id TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS google_client_secret TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS microsoft_client_id TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS microsoft_client_secret TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS microsoft_refresh_token TEXT;

-- Criar a tabela bookings se não existir
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT,
  email TEXT,
  phone TEXT NOT NULL,
  service TEXT,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS (Row Level Security) na tabela bookings
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Criar policies para permitir visualização e inserção
CREATE POLICY "Users can view bookings of their own organization" ON bookings
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM team_members WHERE user_id = auth.uid() UNION SELECT auth.uid())
  );

CREATE POLICY "Anyone can insert bookings" ON bookings
  FOR INSERT WITH CHECK (true);
