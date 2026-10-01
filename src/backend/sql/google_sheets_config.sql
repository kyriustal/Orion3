-- ════════════════════════════════════════════════════════════════
-- Integração Google Sheets & Apps Script para Orion 2.0
-- ════════════════════════════════════════════════════════════════
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS google_sheets_webhook_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS daily_report_email TEXT;
