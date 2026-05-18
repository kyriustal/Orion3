import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { requireAuth } from '../middleware/auth';

const router = Router();

// Listar automações
router.get('/', requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user!.orgId;
    const { data, error } = await supabaseAdmin
      .from('automations')
      .select('*')
      .eq('org_id', orgId);

    if (error && error.code !== 'PGRST116') throw error;
    res.json(data || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Criar automação
router.post('/', requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user!.orgId;
    const { name, type, config } = req.body;

    const { data, error } = await supabaseAdmin
      .from('automations')
      .insert({
        org_id: orgId,
        name,
        type,
        config,
        status: 'active'
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Alternar status (Ativo/Inativo)
router.put('/:id/toggle', requireAuth, async (req: any, res) => {
  try {
    const { status } = req.body;
    const { data, error } = await supabaseAdmin
      .from('automations')
      .update({ status })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Status atualizado' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
