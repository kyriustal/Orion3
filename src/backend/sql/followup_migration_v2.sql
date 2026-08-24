-- ─── Migração v2: Protocolo de Follow-Up Inteligente ─────────────────────────
-- Execute este ficheiro no SQL Editor do Supabase

-- 1. Colunas extras na followup_schedules (idempotentes)
ALTER TABLE followup_schedules ADD COLUMN IF NOT EXISTS followup_step      integer NOT NULL DEFAULT 1;
ALTER TABLE followup_schedules ADD COLUMN IF NOT EXISTS context_snapshot   text;
ALTER TABLE followup_schedules ADD COLUMN IF NOT EXISTS customer_name      text;
ALTER TABLE followup_schedules ADD COLUMN IF NOT EXISTS cancelled_at       timestamptz;

-- 2. Índice para encontrar rapidamente todos os follow-ups pendentes de um número
CREATE INDEX IF NOT EXISTS idx_followup_phone_status
  ON followup_schedules (org_id, customer_phone, status);

-- 3. Confirmar que a tabela business_hours está criada (idempotente)
CREATE TABLE IF NOT EXISTS business_hours (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  day_of_week  smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  -- 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb
  is_open      boolean NOT NULL DEFAULT false,
  open_time    time,
  close_time   time,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (org_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_business_hours_org ON business_hours (org_id);

ALTER TABLE business_hours ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON business_hours;
CREATE POLICY "service_role_all" ON business_hours
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE followup_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON followup_schedules;
CREATE POLICY "service_role_all" ON followup_schedules
  FOR ALL USING (true) WITH CHECK (true);
