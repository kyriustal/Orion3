import dotenv from 'dotenv';
dotenv.config();

import { getUniqueApiKeys, postGeminiWithRetry } from '../services/ai.service';
import axios from 'axios';

async function testGemini() {
  console.log('--- Testing Gemini Keys & Models ---');
  const keys = getUniqueApiKeys();
  console.log(`Found ${keys.length} Gemini keys.`);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const masked = key.substring(0, 8) + '...' + key.substring(key.length - 4);
    for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        const res = await axios.post(url, {
          contents: [{ parts: [{ text: 'Hello, respond with "OK"' }] }]
        }, { timeout: 10000 });
        const txt = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log(`Key ${i+1} (${masked}) + Model [${model}]: SUCCESS -> ${txt?.trim()}`);
      } catch (err: any) {
        console.error(`Key ${i+1} (${masked}) + Model [${model}]: ERROR -> ${err.response?.status} - ${JSON.stringify(err.response?.data?.error || err.message)}`);
      }
    }
  }
}

testGemini();
