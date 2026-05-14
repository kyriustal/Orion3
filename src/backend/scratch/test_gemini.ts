import 'dotenv/config';
import axios from 'axios';

async function testGemini() {
  const rawKeys = process.env.GEMINI_API_KEY || '';
  const keys = rawKeys.split(',').map(k => k.trim().replace(/["']/g, ''));
  const model = 'gemini-2.5-flash';

  console.log(`Testando ${keys.length} chaves com o modelo ${model}...\n`);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    
    try {
      console.log(`[Chave ${i+1}] Testando...`);
      const res = await axios.post(url, {
        contents: [{ parts: [{ text: 'Olá, isto é um teste.' }] }]
      }, { timeout: 10000 });
      
      console.log(`[Chave ${i+1}] SUCESSO! Resposta:`, res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.substring(0, 50));
    } catch (err: any) {
      console.error(`[Chave ${i+1}] FALHOU:`, err.response?.data?.error?.message || err.message);
    }
    console.log('---');
  }
}

testGemini();
