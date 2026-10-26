-- ========================================================
-- MIGRAÇÃO: AGENDAMENTO / CALENDARIZAÇÃO DE CAMPANHAS EM MASSA
-- ========================================================

-- 1. Adicionar coluna scheduled_at na tabela campaigns caso ainda não exista
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Criar índice para otimizar a busca do worker de campanhas agendadas
CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled 
ON campaigns (status, scheduled_at) 
WHERE status = 'SCHEDULED';

-- 3. Recarregar o cache de esquema do PostgREST / Supabase
NOTIFY pgrst, 'reload schema';
