-- Criar tabela facebook_config se não existir
CREATE TABLE IF NOT EXISTS facebook_config (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  page_id     text NOT NULL,
  access_token      text,
  page_access_token text,
  app_id      text,
  app_secret  text,
  display_name text,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(org_id)
);

-- Se a tabela já existir, adicionar as colunas em falta (executar individualmente se necessário)
ALTER TABLE facebook_config ADD COLUMN IF NOT EXISTS page_access_token text;
ALTER TABLE facebook_config ADD COLUMN IF NOT EXISTS app_id text;
ALTER TABLE facebook_config ADD COLUMN IF NOT EXISTS app_secret text;

-- Ativar RLS
ALTER TABLE facebook_config ENABLE ROW LEVEL SECURITY;

-- Políticas: apenas o service_role (backend) pode ler/escrever
DROP POLICY IF EXISTS "service_role_all" ON facebook_config;
CREATE POLICY "service_role_all" ON facebook_config
  FOR ALL USING (true) WITH CHECK (true);
