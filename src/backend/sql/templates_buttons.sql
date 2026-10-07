-- Adiciona a coluna de botões nas tabelas de templates e campanhas
ALTER TABLE templates ADD COLUMN IF NOT EXISTS buttons JSONB DEFAULT '[]';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS buttons JSONB DEFAULT '[]';
