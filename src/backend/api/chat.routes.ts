import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { ai } from '../config/gemini';

const router = Router();

// /api/orion-web/chat
router.post('/chat', async (req, res) => {
  try {
    const { message, history, context } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!process.env.VITE_GEMINI_API_KEY && !process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: 'AI not configured' });
    }

    // Call Gemini
    let prompt = `Você é o Orion, um assistente virtual inteligente e prestativo.\n`;
    if (context) {
        prompt += `Contexto Adicional: ${context}\n`;
    }
    prompt += `Mensagem do usuário: ${message}`;

    const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: prompt
    });

    res.json({
      reply: response.text,
      status: 'success'
    });
  } catch (error: any) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to generate response', details: error.message });
  }
});

export default router;
