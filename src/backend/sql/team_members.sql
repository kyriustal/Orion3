CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'AGENT', -- ADMIN, AGENT, VIEWER
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS (opcional) ou criar policies adequadas se RLS estiver activo
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own team members" ON team_members
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM team_members WHERE user_id = auth.uid() UNION SELECT auth.uid())
  );
