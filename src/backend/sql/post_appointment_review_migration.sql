-- src/backend/sql/post_appointment_review_migration.sql
-- Adicionar 'post_appointment_review' ao check constraint da tabela appointment_reminders

ALTER TABLE appointment_reminders DROP CONSTRAINT IF EXISTS appointment_reminders_reminder_stage_check;

ALTER TABLE appointment_reminders ADD CONSTRAINT appointment_reminders_reminder_stage_check
  CHECK (reminder_stage IN ('instant', '7_days_before', '3_days_before', 'day_of_7am', 'post_appointment_review'));
