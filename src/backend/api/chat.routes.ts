import { Router, Request, Response } from 'express';
import { AIService } from '../services/ai.service';

const router = Router();

// /api/orion-web/chat
router.post('/chat', async (req: Request, res: Response) => {
    try {
        const { message, history, botName, orgId } = req.body;

        if (!message) {
            return res.status(400).json({ error: "Mensagem é obrigatória." });
        }

        const result = await AIService.generateResponse({
            message,
            botName,
            orgId: orgId || 'default',
            history: history || []
        });

        res.json(result);
    } catch (error: any) {
        console.error('Erro na Rota de Chat:', error.message);
        res.status(500).json({ error: error.message });
    }
});

export default router;
