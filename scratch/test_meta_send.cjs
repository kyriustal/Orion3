process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const path = require('path');
const axios = require('axios');
const { supabaseAdmin } = require(path.resolve(__dirname, '../dist-server/config/supabase.js'));

async function testSend() {
  const { data: waConfig } = await supabaseAdmin
    .from('whatsapp_config')
    .select('*')
    .eq('org_id', 'b4647d91-6352-4947-8988-0df409b245b3')
    .single();

  const url = `https://graph.facebook.com/v19.0/${waConfig.phone_number_id}/messages`;

  // Test 1: Send template dv_lottery_suspenso WITH header parameter
  console.log('--- TEST 1: Template with header parameter on a template that has no header ---');
  try {
    const res1 = await axios.post(url, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "244940402546",
      type: "template",
      template: {
        name: "dv_lottery_suspenso",
        language: { code: "pt_BR" },
        components: [
          {
            type: "header",
            parameters: [
              {
                type: "image",
                image: { link: "https://iinubqqhkmopwyndjbja.supabase.co/storage/v1/object/public/assets/b4647d91-6352-4947-8988-0df409b245b3/campaigns/1793543352167_DV-Lottery_continua_suspenso.png" }
              }
            ]
          },
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
    console.log('Test 1 Success:', res1.data);
  } catch (err) {
    console.log('Test 1 Error:', err.response?.data || err.message);
  }

  // Test 2: Send direct media via sendMediaByUrl
  console.log('\n--- TEST 2: Direct media message ---');
  try {
    const res2 = await axios.post(url, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "244940402546",
      type: "image",
      image: {
        link: "https://iinubqqhkmopwyndjbja.supabase.co/storage/v1/object/public/assets/b4647d91-6352-4947-8988-0df409b245b3/campaigns/1793543352167_DV-Lottery_continua_suspenso.png"
      }
    }, {
      headers: {
        'Authorization': `Bearer ${waConfig.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('Test 2 Success:', res2.data);
  } catch (err) {
    console.log('Test 2 Error:', err.response?.data || err.message);
  }

  // Test 3: Send template dv_lottery_suspenso WITHOUT header parameter
  console.log('\n--- TEST 3: Template WITHOUT header parameter ---');
  try {
    const res3 = await axios.post(url, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "244940402546",
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
    console.log('Test 3 Success:', res3.data);
  } catch (err) {
    console.log('Test 3 Error:', err.response?.data || err.message);
  }
}

testSend().catch(console.error);
