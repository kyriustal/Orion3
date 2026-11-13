process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const axios = require('axios');

async function checkProductionWebhookStatus() {
  try {
    const res = await axios.get('https://orionboot.com/api/whatsapp/webhook-status?token=orion_secure_token_123');
    console.log('Webhook Status on Production:', JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.log(`Failed: ${err.response?.status || err.message}`);
  }
}

checkProductionWebhookStatus().catch(console.error);
