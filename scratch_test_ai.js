require('dotenv').config();
const axios = require('axios');

async function testAll() {
  console.log('--- TEST DEEPSEEK ---');
  try {
    const res = await axios.post('https://api.deepseek.com/v1/chat/completions', {
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'Oi' }],
      max_tokens: 10
    }, {
      headers: { 'Authorization': 'Bearer ' + process.env.DEEPSEEK_API_KEY },
      timeout: 8000
    });
    console.log('DeepSeek OK:', res.data?.choices?.[0]?.message?.content);
  } catch (err) {
    console.log('DeepSeek Fail:', err.message, err.response?.status, JSON.stringify(err.response?.data));
  }

  console.log('--- TEST GEMINI ---');
  const geminiKeys = (process.env.GEMINI_API_KEY || '').split(',').map(s => s.trim().replace(/['"]/g, ''));
  for (const k of geminiKeys) {
    console.log('Testing Gemini key prefix:', k.substring(0, 10));
    try {
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + k;
      const res = await axios.post(url, { contents: [{ parts: [{ text: 'Oi' }] }] }, { timeout: 8000 });
      console.log('Gemini 1.5 OK:', res.data?.candidates?.[0]?.content?.parts?.[0]?.text);
    } catch (err) {
      console.log('Gemini 1.5 Fail:', err.message, err.response?.status, JSON.stringify(err.response?.data?.error?.message));
    }
  }

  console.log('--- TEST OPENAI ---');
  try {
    const res = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Oi' }],
      max_tokens: 10
    }, {
      headers: { 'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY },
      timeout: 8000
    });
    console.log('OpenAI OK:', res.data?.choices?.[0]?.message?.content);
  } catch (err) {
    console.log('OpenAI Fail:', err.message, err.response?.status, JSON.stringify(err.response?.data?.error?.message));
  }
}
testAll();
