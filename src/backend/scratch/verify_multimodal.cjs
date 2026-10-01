const axios = require('axios');
require('dotenv').config();

async function testAll() {
  console.log('=== TESTANDO NOVAS CHAVES GEMINI & MULTIMODAL ===');
  const geminiRaw = (process.env.GEMINI_API_KEY || '').trim();
  const keys = geminiRaw.split(',').map(k => k.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  
  console.log(`Total de chaves Gemini detectadas no .env: ${keys.length}`);
  if (keys.length === 0) {
    console.error('❌ Nenhuma chave GEMINI_API_KEY encontrada no .env!');
    return;
  }

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const masked = key.substring(0, 8) + '...' + key.substring(key.length - 4);
    console.log(`\n--- Testando Chave #${i + 1} (${masked}) ---`);

    // 1. Teste básico de texto
    const models = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
    for (const m of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`;
        const res = await axios.post(url, {
          contents: [{ parts: [{ text: 'Responda apenas: OK_GEMINI' }] }]
        }, { timeout: 10000 });
        const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log(`  [Modelo: ${m}] ✅ Sucesso! Resposta: ${text?.trim()}`);
      } catch (err) {
        console.error(`  [Modelo: ${m}] ❌ Falhou: HTTP ${err.response?.status} - ${err.response?.data?.error?.message || err.message}`);
      }
    }

    // 2. Teste de Visão de Imagem (1x1 PNG com cor azul)
    try {
      const samplePng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
      const res = await axios.post(url, {
        contents: [{
          parts: [
            { inlineData: { mimeType: 'image/png', data: samplePng } },
            { text: 'Descreva a cor predominante desta imagem em uma única palavra.' }
          ]
        }]
      }, { timeout: 12000 });
      const imgDesc = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      console.log(`  [Visão / Imagem] ✅ Sucesso! Análise: ${imgDesc?.trim()}`);
    } catch (err) {
      console.error(`  [Visão / Imagem] ❌ Falhou: HTTP ${err.response?.status} - ${err.response?.data?.error?.message || err.message}`);
    }
  }

  // 3. Testar DeepSeek
  console.log('\n--- Testando DeepSeek (Motor de Conversa) ---');
  const dsKey = (process.env.DEEPSEEK_API_KEY || '').trim().replace(/^["']|["']$/g, '');
  if (dsKey) {
    try {
      const res = await axios.post('https://api.deepseek.com/v1/chat/completions', {
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Responda apenas: OK_DEEPSEEK' }],
        max_tokens: 20
      }, {
        headers: { 'Authorization': `Bearer ${dsKey}`, 'Content-Type': 'application/json' },
        timeout: 10000
      });
      console.log(`  [DeepSeek Chat] ✅ Sucesso! Resposta: ${res.data?.choices?.[0]?.message?.content?.trim()}`);
    } catch (err) {
      console.error(`  [DeepSeek Chat] ❌ Falhou: HTTP ${err.response?.status} - ${err.response?.data?.error?.message || err.message}`);
    }
  }
}

testAll();
