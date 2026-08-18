-- Tabela de lembretes e alertas automáticos de agendamentos
CREATE TABLE IF NOT EXISTS appointment_reminders (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  booking_id       UUID REFERENCES bookings(id) ON DELETE SET NULL,
  customer_name    TEXT NOT NULL,
  customer_phone   TEXT,
  customer_email   TEXT,
  subject          TEXT NOT NULL,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  reminder_stage   TEXT NOT NULL CHECK (reminder_stage IN ('instant', '7_days_before', '3_days_before', 'day_of_7am')),
  scheduled_at     TIMESTAMPTZ NOT NULL,
  channels         TEXT NOT NULL DEFAULT 'both' CHECK (channels IN ('email', 'sms', 'both')),
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  error_message    TEXT,
  sent_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para pesquisa otimizada no worker de lembretes
CREATE INDEX IF NOT EXISTS idx_appointment_reminders_status_scheduled
  ON appointment_reminders (status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_appointment_reminders_org_booking
  ON appointment_reminders (org_id, booking_id);

-- RLS (Row Level Security)
ALTER TABLE appointment_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_appointment_reminders" ON appointment_reminders;
CREATE POLICY "service_role_all_appointment_reminders" ON appointment_reminders
  FOR ALL USING (true) WITH CHECK (true);
