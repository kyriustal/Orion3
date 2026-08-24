const axios = require('axios');
async function t() {
  try {
    const res = await axios.post('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=AIzaSyDMl-y41UEJKzwZfR4F9hFsfq_Z8G4n6oQ', {
      contents: [{ parts: [{ text: 'Hello' }] }]
    });
    console.log(res.data);
  } catch (e) {
    console.log('Status:', e.response?.status);
    console.log('Error Data:', JSON.stringify(e.response?.data));
  }
}
t();
