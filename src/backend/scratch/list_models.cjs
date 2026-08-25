const axios = require('axios');
require('dotenv').config();

async function listModels() {
  const geminiRaw = (process.env.GEMINI_API_KEY || '').trim();
  const keys = geminiRaw.split(',').map(k => k.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  const key = keys[0];
  console.log('Using key:', key.substring(0, 10) + '...');

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
    const res = await axios.get(url);
    const models = res.data?.models || [];
    console.log(`Found ${models.length} models:`);
    models.forEach(m => {
      if (m.supportedGenerationMethods?.includes('generateContent')) {
        console.log(` - ${m.name} (${m.displayName})`);
      }
    });
  } catch (err) {
    console.error('ListModels error:', err.response?.status, err.response?.data || err.message);
  }
}

listModels();
