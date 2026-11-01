process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const path = require('path');
const axios = require('axios');
const { supabaseAdmin } = require(path.resolve(__dirname, '../dist-server/config/supabase.js'));

async function testPhoneFormats() {
  const { data: waConfig } = await supabaseAdmin
    .from('whatsapp_config')
    .select('*')
    .eq('org_id', 'b4647d91-6352-4947-8988-0df409b245b3')
    .single();

  const url = `https://graph.facebook.com/v19.0/${waConfig.phone_number_id}/messages`;

  // Test sending to 940402546 (9 digits, missing 244)
  console.log('Testing 9-digit phone without country code (940402546)...');
  try {
    const res = await axios.post(url, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "940402546",
      type: "template",
      template: {
        name: "dv_lottery_suspenso",
        language: { code: "pt_BR" },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: "On Visa" }]
          }
        ]
      }
    }, {
      headers: {
        'Authorization': `Bearer ${waConfig.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('Success without country code:', res.data);
  } catch (err) {
    console.log('Error without country code:', err.response?.data || err.message);
  }
}

testPhoneFormats().catch(console.error);
