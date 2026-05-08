import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { AIService } from '../services/ai.service';

const router = Router();

// Rota de Simulação do Agente (Empresa do Usuário)
router.post('/agent/simulate', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { message, botName, history } = req.body;
        const orgId = req.user?.id || 'default';

        const result = await AIService.generateResponse({
            message,
            botName,
            orgId,
            history: history || [],
            mode: 'simulation' // FORÇA MODO EMPRESA
        });

        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: "Erro na simulação", details: error.message });
    }
});

// Outras rotas permanecem...
router.get('/settings/org', requireAuth, (req, res) => res.json({ data: [] }));

export default router;
