import { Router } from 'express';
import { ai } from '../config/gemini';

const router = Router();

router.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    // Logica ultra simples que funcionava antes
    res.json({ 
      reply: "Olá! O sistema está online novamente. Como posso ajudar?", 
      status: 'success' 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
