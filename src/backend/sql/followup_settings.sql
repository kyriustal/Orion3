-- ─── Tabela de configurações personalizadas de Follow-up por organização ─────
-- Cada organização pode ter UMA linha com as suas preferências de follow-up.

CREATE TABLE IF NOT EXISTS followup_settings (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id                uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,

  -- Ativação global
  enabled               boolean NOT NULL DEFAULT true,

  -- Step 1 (primeira mensagem de follow-up)
  step1_enabled         boolean NOT NULL DEFAULT true,
  step1_delay_hours     integer NOT NULL DEFAULT 12,        -- horas após última msg
  step1_message         text,                               -- NULL = usar template dinâmico padrão

  -- Step 2 (segunda mensagem de follow-up / encerramento cordial)
  step2_enabled         boolean NOT NULL DEFAULT false,     -- desativado por padrão
  step2_delay_hours     integer NOT NULL DEFAULT 24,
  step2_message         text,

  -- Janela de envio (horário permitido)
  send_window_start     text NOT NULL DEFAULT '09:00',      -- HH:MM
  send_window_end       text NOT NULL DEFAULT '20:00',      -- HH:MM

  -- Dias da semana permitidos (JSON array: [0=Dom,1=Seg,...,6=Sab])
  allowed_days          jsonb NOT NULL DEFAULT '[1,2,3,4,5,6]'::jsonb,

  -- Timestamps
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- RLS: apenas service_role acede (lógica de acesso é feita no backend)
ALTER TABLE followup_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON followup_settings;
CREATE POLICY "service_role_all" ON followup_settings
  FOR ALL USING (true) WITH CHECK (true);
