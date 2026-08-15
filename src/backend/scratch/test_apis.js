const dotenv = require('dotenv');
dotenv.config();
const axios = require('axios');

async function testDeepSeek() {
  console.log('--- Testando DeepSeek ---');
  try {
    const res = await axios.post('https://api.deepseek.com/v1/chat/completions', {
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'Olá, teste!' }],
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    console.log('DeepSeek OK:', res.data?.choices?.[0]?.message?.content);
  } catch (err) {
    console.error('DeepSeek Error:', err.response?.status, err.response?.data || err.message);
  }
}

async function testGemini() {
  console.log('--- Testando Gemini ---');
  const rawKey = process.env.GEMINI_API_KEY || '';
  const cleanStr = rawKey.trim().replace(/^["']|["']$/g, '');
  const keys = cleanStr.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(k => k.length > 10);
  
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    try {
      const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
        contents: [{ role: 'user', parts: [{ text: 'Olá, teste!' }] }]
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
      console.log(`Gemini Key ${i} (${key.slice(0, 6)}...${key.slice(-4)}) OK:`, res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.slice(0, 50));
    } catch (err) {
      console.error(`Gemini Key ${i} (${key.slice(0, 6)}...${key.slice(-4)}) Error:`, err.response?.status, err.response?.data?.error?.message || err.message);
    }
  }
}

async function testOpenAI() {
  console.log('--- Testando OpenAI ---');
  if (!process.env.OPENAI_API_KEY) {
    console.log('OpenAI não configurada');
    return;
  }
  try {
    const res = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Olá, teste!' }]
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    console.log('OpenAI OK:', res.data?.choices?.[0]?.message?.content);
  } catch (err) {
    console.error('OpenAI Error:', err.response?.status, err.response?.data || err.message);
  }
}

(async () => {
  await testDeepSeek();
  await testGemini();
  await testOpenAI();
})();
