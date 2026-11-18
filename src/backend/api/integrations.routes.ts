import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import { ExternalIntegrationsService } from '../services/external_integrations.service';

const router = Router();

const ALLOWED_FIELDS = [
  'name', 'description', 'base_url', 'auth_type', 'auth_config',
  'endpoints', 'field_mapping', 'summary_template', 'is_active', 'timeout_ms',
];

function pickFields(body: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const key of ALLOWED_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

// ─── GET /api/integrations — Listar integrações da organização ───────────────
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user?.orgId || req.user?.id;
    const { data, error } = await supabaseAdmin
      .from('external_integrations')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Nunca expor o token completo — apenas uma versão mascarada
    const sanitized = (data || []).map(i => ({
      ...i,
      auth_config: {
        ...i.auth_config,
        token: i.auth_config?.token ? '••••••••' + String(i.auth_config.token).slice(-4) : undefined,
        password: i.auth_config?.password ? '••••••••' : undefined,
      },
    }));

    res.json(sanitized);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/integrations — Criar integração ───────────────────────────────
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user?.orgId || req.user?.id;
    const fields = pickFields(req.body);

    if (!fields.name || !fields.base_url) {
      return res.status(400).json({ error: 'Nome e URL base são obrigatórios.' });
    }

    const { data, error } = await supabaseAdmin
      .from('external_integrations')
      .insert({ org_id: orgId, ...fields })
      .select()
      .single();

    if (error) throw error;
    res.json({ message: `Integração "${fields.name}" criada com sucesso!`, integration: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/integrations/:id — Actualizar integração ───────────────────────
router.put('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user?.orgId || req.user?.id;
    const { id } = req.params;
    const fields = pickFields(req.body);

    // Se o token vier mascarado, manter o existente
    if (fields.auth_config?.token?.startsWith('••••')) delete fields.auth_config.token;
    if (fields.auth_config?.password?.startsWith('••••')) delete fields.auth_config.password;

    const { error } = await supabaseAdmin
      .from('external_integrations')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('org_id', orgId);

    if (error) throw error;
    res.json({ message: 'Integração actualizada com sucesso!' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/integrations/:id — Remover integração ───────────────────────
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user?.orgId || req.user?.id;
    const { error } = await supabaseAdmin
      .from('external_integrations')
      .delete()
      .eq('id', req.params.id)
      .eq('org_id', orgId);

    if (error) throw error;
    res.json({ message: 'Integração removida.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/integrations/:id/test — Testar conexão e lookup ───────────────
router.post('/:id/test', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user?.orgId || req.user?.id;
    if (!orgId) return res.status(400).json({ error: 'Organização não identificada.' });
    const { id } = req.params;
    const { phone, reference } = req.body || {};

    const { data: integration } = await supabaseAdmin
      .from('external_integrations')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle();

    if (!integration) return res.status(404).json({ error: 'Integração não encontrada.' });

    let result;
    if (reference) {
      result = await ExternalIntegrationsService.lookupByReference(orgId, reference);
    } else if (phone) {
      result = await ExternalIntegrationsService.lookupByPhone(orgId, phone);
    } else {
      return res.status(400).json({ error: 'Forneça um telefone ou referência (nº de processo) para testar.' });
    }

    res.json({
      success: result.found,
      message: result.found
        ? `✅ Conexão OK! Dados encontrados via "${result.source}".`
        : 'Conexão efectuada, mas nenhum registo encontrado para o valor testado (verifique o mapeamento de campos).',
      profile: result.found ? { source: result.source, reference: result.reference, data: result.data, summary: result.summary } : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
