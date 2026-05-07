import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';

const router = Router();

// Handlers simples
router.get('/settings/org', requireAuth, async (req: AuthRequest, res: Response) => {
    res.json({ data: [{ name: 'Minha Empresa', chatbot_name: 'Orion Bot' }] });
});

router.post('/agent/simulate', requireAuth, async (req: AuthRequest, res: Response) => {
    res.json({ reply: "Simulação ativa (Modo de Segurança)", status: 'success' });
});

// Outras rotas vazias para não quebrar o frontend
router.get('/templates', requireAuth, (req, res) => res.json({ data: [] }));
router.get('/team', requireAuth, (req, res) => res.json({ data: [] }));
router.get('/automations', requireAuth, (req, res) => res.json({ data: [] }));

export default router;
