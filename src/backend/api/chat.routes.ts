import { Router, Request, Response } from 'express';
import { AIService } from '../services/ai.service';

const router = Router();

// Rota do Chat Flutuante (Suporte Orion)
router.post('/chat', async (req: Request, res: Response) => {
    try {
        const { message, history } = req.body;
        if (!message) return res.status(400).json({ error: "Mensagem vazia." });

        const extendedHistory = (history || []).slice(-30);
        const result = await AIService.generateResponse({
            message,
            history: extendedHistory,
            orgId: 'orion_system',
            mode: 'support',
            botName: 'Orion Support'
        });

        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: 'Erro no suporte', details: error.message });
    }
});

export default router;
