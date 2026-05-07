import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import axios from 'axios';

const router = Router();

router.post('/agent/simulate', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { message, botName, history } = req.body;
        const apiKey = process.env.OPENAI_API_KEY;
        const name = botName || "Orion Bot";

        console.log("Chamando OpenAI para a Simulação...");

        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: `Você é o ${name}, um assistente virtual inteligente.` },
                    ...(history || []).slice(-5).map((h: any) => ({
                        role: h.sender === 'user' ? 'user' : 'assistant',
                        content: h.text
                    })),
                    { role: 'user', content: message }
                ],
                temperature: 0.7
            },
            {
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
            }
        );

        res.json({ 
            reply: response.data.choices[0].message.content, 
            status: 'success' 
        });
    } catch (error: any) {
        console.error('Simulate AI Error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Erro na IA', details: error.message });
    }
});

// Rotas de suporte
router.get('/settings/org', requireAuth, (req, res) => res.json({ data: [] }));
router.get('/templates', requireAuth, (req, res) => res.json({ data: [] }));
router.get('/team', requireAuth, (req, res) => res.json({ data: [] }));
router.get('/automations', requireAuth, (req, res) => res.json({ data: [] }));

export default router;
