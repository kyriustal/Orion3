const axios = require('axios');
require('dotenv').config();

async function testModernModels() {
  const geminiRaw = (process.env.GEMINI_API_KEY || '').trim();
  const keys = geminiRaw.split(',').map(k => k.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  
  const testModels = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-3.7-flash', 'gemini-3.6-flash'];

  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const masked = k.substring(0, 8) + '...' + k.substring(k.length - 4);
    console.log(`\n=== Testando Chave #${i+1} (${masked}) ===`);

    for (const m of testModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${k}`;
        
        // 1. Text test
        const textRes = await axios.post(url, {
          contents: [{ parts: [{ text: 'Responda apenas: OK' }] }]
        }, { timeout: 8000 });
        const txt = textRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;

        // 2. Vision test (1x1 PNG)
        const samplePng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        const imgRes = await axios.post(url, {
          contents: [{
            parts: [
              { inlineData: { mimeType: 'image/png', data: samplePng } },
              { text: 'Descreva a cor desta imagem em uma palavra.' }
            ]
          }]
        }, { timeout: 8000 });
        const imgTxt = imgRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;

        console.log(`  Modelo [${m}]: ✅ SUCESSO! Texto: "${txt?.trim()}" | Visão: "${imgTxt?.trim()}"`);
        break; // Passed on this model
      } catch (err) {
        console.error(`  Modelo [${m}]: ❌ HTTP ${err.response?.status} - ${err.response?.data?.error?.message || err.message}`);
      }
    }
  }
}

testModernModels();
