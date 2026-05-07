import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { AIService } from '../services/ai.service';
import { supabase } from '../config/supabase';

const router = Router();

// /api/agent/simulate
router.post('/agent/simulate', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { message, botName, history } = req.body;
        const orgId = req.user?.id || 'default';

        // Agora usa o AIService que está configurado com Gemini
        const result = await AIService.generateResponse({
            message,
            botName,
            orgId,
            history: history || []
        });

        res.json(result);
    } catch (error: any) {
        console.error('Erro na Simulação:', error.message);
        res.status(500).json({ error: "Erro na simulação", details: error.message });
    }
});

// Outras rotas core
router.get('/settings/org', requireAuth, (req, res) => res.json({ data: [] }));
router.get('/templates', requireAuth, (req, res) => res.json({ data: [] }));
router.get('/team', requireAuth, (req, res) => res.json({ data: [] }));
router.get('/automations', requireAuth, (req, res) => res.json({ data: [] }));

export default router;
