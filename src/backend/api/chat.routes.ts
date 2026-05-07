import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { AIService } from '../services/ai.service';

const router = Router();

// /api/orion-web/chat
router.post('/chat', async (req, res) => {
  try {
    const { message, history, context, orgId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Usamos o AIService para gerar a resposta "perfeita"
    const result = await AIService.generateResponse({
        message,
        orgId: orgId || 'default', // Se não houver orgId, usamos um default ou buscamos no banco
        history: history || []
    });

    res.json(result);
  } catch (error: any) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to generate response', details: error.message });
  }
});

export default router;
