-- ------------------------------------------------------------------------------
-- EXTERNAL_INTEGRATIONS (Conector genérico de APIs — CRM, ERP, Recrutamento...)
-- Cada integração define como consultar um sistema externo da empresa:
-- autenticação, endpoints com templates ({{phone}} / {{reference}}) e mapeamento
-- de campos da resposta para um perfil unificado de cliente.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS external_integrations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,                    -- Ex: "CRM Interno", "Gestão de Processos"
  description      TEXT,
  base_url         TEXT NOT NULL,                    -- Ex: https://crm.empresa.com/api
  auth_type        TEXT NOT NULL DEFAULT 'none',     -- 'none' | 'bearer' | 'header' | 'basic' | 'query'
  auth_config      JSONB DEFAULT '{}'::jsonb,        -- { token, header_name, query_param, username, password }
  endpoints        JSONB DEFAULT '{}'::jsonb,        -- { lookup_by_phone: {method, path, body}, lookup_by_reference: {...} }
  field_mapping    JSONB DEFAULT '{}'::jsonb,        -- { name: 'data.nome', process_number: 'data.processo', status: 'data.estado', ... }
  summary_template TEXT,                             -- Ex: "Cliente {{name}}, processo {{process_number}} em estado {{status}}"
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  timeout_ms       INT NOT NULL DEFAULT 10000,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_integrations_org ON external_integrations(org_id, is_active);

DROP TRIGGER IF EXISTS set_external_integrations_timestamp ON external_integrations;
CREATE TRIGGER set_external_integrations_timestamp
BEFORE UPDATE ON external_integrations
FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

ALTER TABLE external_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_external_integrations" ON external_integrations;
CREATE POLICY "service_role_external_integrations" ON external_integrations FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- VERIFIED_IDENTITIES (Protocolo de segurança)
-- Números não registados que provaram identidade via nº de processo/contrato.
-- A IA só fornece dados de clientes a números registados ou verificados.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS verified_identities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone         TEXT NOT NULL,
  reference     TEXT NOT NULL,                -- nº de processo/contrato validado
  customer_name TEXT,
  channel       TEXT DEFAULT 'whatsapp',
  verified_at   TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days',
  UNIQUE (org_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_verified_identities_phone ON verified_identities(org_id, phone);

ALTER TABLE verified_identities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_verified_identities" ON verified_identities;
CREATE POLICY "service_role_verified_identities" ON verified_identities FOR ALL USING (true) WITH CHECK (true);
