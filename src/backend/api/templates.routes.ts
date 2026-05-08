import { Router } from 'express';
import { supabase } from '../config/supabase';
import { requireAuth } from '../middleware/auth';

const router = Router();

// Listar templates
router.get('/', requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user.id;
    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .eq('org_id', orgId);

    if (error && error.code !== 'PGRST116') throw error;
    res.json(data || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Criar template (Envia para "Análise")
router.post('/', requireAuth, async (req: any, res) => {
  try {
    const orgId = req.user.id;
    const { name, category, language, content } = req.body;

    const { data, error } = await supabase
      .from('templates')
      .insert({
        org_id: orgId,
        name,
        category,
        language: language || 'pt_BR',
        content,
        status: 'pending' // Começa em análise
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
