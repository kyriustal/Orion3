const dotenv = require('dotenv');
dotenv.config();
const axios = require('axios');

async function testOpenAI() {
  console.log('\n--- Testando OpenAI ---');
  try {
    const res = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Diga OK' }]
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('OpenAI OK:', res.data?.choices?.[0]?.message?.content);
  } catch (err) {
    console.error('OpenAI Falhou:', err.response?.status, err.response?.data?.error?.message || err.message);
  }
}

testOpenAI();
