import { Router } from 'express';
import axios from 'axios';

const router = Router();

router.post('/chat', async (req, res) => {
  try {
    const { message, history } = req.body;
    const apiKey = process.env.OPENAI_API_KEY;

    if (!message) return res.status(400).json({ error: 'Mensagem vazia' });

    console.log("Chamando OpenAI para o Chat...");

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Você é um assistente virtual prestativo e profissional.' },
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
    console.error('Chat AI Error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Erro na IA', details: error.message });
  }
});

export default router;
