process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const path = require('path');
const axios = require('axios');
const { supabaseAdmin } = require(path.resolve(__dirname, '../dist-server/config/supabase.js'));

async function testSequence() {
  const { data: waConfig } = await supabaseAdmin
    .from('whatsapp_config')
    .select('*')
    .eq('org_id', 'b4647d91-6352-4947-8988-0df409b245b3')
    .single();

  const url = `https://graph.facebook.com/v19.0/${waConfig.phone_number_id}/messages`;
  // Test with another phone number from contacts, e.g. 244975158030 (Onli) who likely hasn't messaged in 24h
  const targetPhone = "244975158030";

  console.log(`Testing with target phone ${targetPhone}...`);

  // Step 1: Send approved template without header
  console.log('Step 1: Sending approved template...');
  try {
    const res1 = await axios.post(url, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: targetPhone,
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
    console.log('Step 1 Template Success:', res1.data);
  } catch (err) {
    console.log('Step 1 Template Error:', err.response?.data || err.message);
  }

  // Step 2: Send media message right after
  console.log('\nStep 2: Sending media message...');
  try {
    const res2 = await axios.post(url, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: targetPhone,
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
    console.log('Step 2 Media Success:', res2.data);
  } catch (err) {
    console.log('Step 2 Media Error:', err.response?.data || err.message);
  }
}

testSequence().catch(console.error);
