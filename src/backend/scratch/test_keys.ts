import dotenv from 'dotenv';
dotenv.config();

import { getUniqueApiKeys, getUniqueDeepseekApiKeys } from '../services/ai.service';
import axios from 'axios';

async function testAll() {
  console.log('=== TEST ALL AI SERVICES ===');
  console.log('OPENAI_API_KEY present:', !!process.env.OPENAI_API_KEY);
  console.log('GROQ_API_KEY present:', !!process.env.GROQ_API_KEY);

  const geminiKeys = getUniqueApiKeys();
  console.log(`Gemini Keys count: ${geminiKeys.length}`);

  for (let i = 0; i < geminiKeys.length; i++) {
    const k = geminiKeys[i];
    const masked = k.substring(0, 8) + '...' + k.substring(k.length - 4);
    for (const m of ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${k}`;
        const resp = await axios.post(url, {
          contents: [{ parts: [{ text: 'Ping' }] }]
        }, { timeout: 8000 });
        const txt = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log(`[Gemini OK] Key ${i+1} (${masked}) Model ${m}: ${txt?.trim()}`);
      } catch (err: any) {
        console.log(`[Gemini FAIL] Key ${i+1} (${masked}) Model ${m}: ${err.response?.status} - ${err.response?.data?.error?.message || err.message}`);
      }
    }
  }

  const dsKeys = getUniqueDeepseekApiKeys();
  console.log(`DeepSeek Keys count: ${dsKeys.length}`);
}

testAll();
