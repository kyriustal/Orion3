-- Adicionar colunas de calendário à tabela organizations se não existirem
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS calendar_provider VARCHAR(50) DEFAULT 'none';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS calendar_link TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS google_client_id TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS google_client_secret TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS google_direct_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS google_user_refresh_token TEXT;
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

-- Remover políticas antigas se existirem
DROP POLICY IF EXISTS "Users can view bookings of their own organization" ON bookings;
DROP POLICY IF EXISTS "Anyone can insert bookings" ON bookings;
DROP POLICY IF EXISTS "Allow select bookings" ON bookings;
DROP POLICY IF EXISTS "Allow all for bookings" ON bookings;

-- Criar policies seguras e compatíveis
CREATE POLICY "Allow select bookings" ON bookings
  FOR SELECT USING (true);

CREATE POLICY "Allow insert bookings" ON bookings
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update bookings" ON bookings
  FOR UPDATE USING (true);

CREATE POLICY "Allow delete bookings" ON bookings
  FOR DELETE USING (true);
