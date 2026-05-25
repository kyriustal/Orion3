-- Tabela de agendamentos de follow-up / remarketing
CREATE TABLE IF NOT EXISTS followup_schedules (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_phone   text NOT NULL,
  platform         text NOT NULL DEFAULT 'whatsapp' CHECK (platform IN ('whatsapp','facebook')),
  scheduled_at     timestamptz NOT NULL,
  last_message_id  text,
  custom_prompt    text,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','cancelled')),
  created_at       timestamptz DEFAULT now()
);

-- Colunas extra (caso a tabela já exista mas sem estas colunas)
ALTER TABLE followup_schedules ADD COLUMN IF NOT EXISTS custom_prompt text;
ALTER TABLE followup_schedules ADD COLUMN IF NOT EXISTS last_message_id text;
ALTER TABLE followup_schedules ADD COLUMN IF NOT EXISTS platform text DEFAULT 'whatsapp';

-- Índice para que o worker encontre registos pendentes rapidamente
CREATE INDEX IF NOT EXISTS idx_followup_status_scheduled
  ON followup_schedules (status, scheduled_at);

-- RLS
ALTER TABLE followup_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON followup_schedules;
CREATE POLICY "service_role_all" ON followup_schedules
  FOR ALL USING (true) WITH CHECK (true);
