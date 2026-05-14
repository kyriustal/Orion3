import { Router, Request, Response } from 'express';
import { AIService } from '../services/ai.service';

const router = Router();

// ─── POST /api/orion-web/chat — Chat de suporte Orion (widget do site) ────────
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { message, history } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Mensagem não pode estar vazia.' });
    }

    // Manter apenas as últimas 30 mensagens para o widget de suporte
    const contextHistory = (history || []).slice(-30);

    const result = await AIService.generateResponse({
      message: message.trim(),
      history: contextHistory,
      orgId: 'orion_system',
      mode: 'support',
      botName: 'Orion Support',
    });

    res.json(result);
  } catch (err: any) {
    console.error('[CHAT ROUTE] Erro:', err.message);
    res.status(500).json({
      error: 'Erro temporário no serviço de suporte.',
      details: err.message,
    });
  }
});

export default router;
