const dotenv = require('dotenv');
dotenv.config();
const axios = require('axios');

async function testAllModelsForKeys() {
  const keys = [
    'AIzaSyDMl-y41UEJKzwZfR4F9hFsfq_Z8G4n6oQ',
    'AIzaSyDBgQddC--sTYzaLgmW_36fL-dpKrriFuw'
  ];

  for (const key of keys) {
    console.log(`\n=== Testing Key: ${key.slice(0, 10)}... ===`);
    try {
      const listRes = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      const models = listRes.data?.models || [];
      console.log(`Total models: ${models.length}`);

      for (const m of models) {
        const modelName = m.name.replace('models/', '');
        if (!m.supportedGenerationMethods?.includes('generateContent')) continue;
        try {
          const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`, {
            contents: [{ parts: [{ text: 'Hi' }] }]
          }, { timeout: 5000 });
          console.log(` SUCCESS with model: ${modelName}! Response:`, res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim());
          break; // Found working model!
        } catch (e) {
          // console.log(`  Fail ${modelName}:`, e.response?.status, e.response?.data?.error?.message || e.message);
        }
      }
    } catch (e) {
      console.log('List error:', e.response?.data || e.message);
    }
  }
}

testAllModelsForKeys();
