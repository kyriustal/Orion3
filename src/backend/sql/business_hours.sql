-- Tabela de Horários de Funcionamento da Empresa
-- Permite configurar os dias e horas de abertura por organização
CREATE TABLE IF NOT EXISTS business_hours (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  day_of_week  smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  -- 0 = Domingo, 1 = Segunda, 2 = Terça, 3 = Quarta, 4 = Quinta, 5 = Sexta, 6 = Sábado
  is_open      boolean NOT NULL DEFAULT false,
  open_time    time,    -- ex: '09:00'
  close_time   time,    -- ex: '18:00'
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (org_id, day_of_week)
);

-- Índice para buscas rápidas por organização
CREATE INDEX IF NOT EXISTS idx_business_hours_org
  ON business_hours (org_id);

-- RLS
ALTER TABLE business_hours ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON business_hours;
CREATE POLICY "service_role_all" ON business_hours
  FOR ALL USING (true) WITH CHECK (true);

-- ─── Migração: adicionar colunas extra ao followup_schedules ───────────────────
ALTER TABLE followup_schedules ADD COLUMN IF NOT EXISTS followup_step      integer NOT NULL DEFAULT 1;
ALTER TABLE followup_schedules ADD COLUMN IF NOT EXISTS context_snapshot   text;
ALTER TABLE followup_schedules ADD COLUMN IF NOT EXISTS customer_name      text;
