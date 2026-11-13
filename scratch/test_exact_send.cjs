process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const path = require('path');
const axios = require('axios');
const { supabaseAdmin } = require(path.resolve(__dirname, '../dist-server/config/supabase.js'));

async function testExactCampaignSend() {
  const { data: waConfig } = await supabaseAdmin
    .from('whatsapp_config')
    .select('*')
    .eq('org_id', 'b4647d91-6352-4947-8988-0df409b245b3')
    .single();

  const phoneId = waConfig.phone_number_id;
  const token = waConfig.access_token;
  const targetPhone = "244940402546";

  console.log('--- TEST 1: Sending dv_lottery_suspenso with variables ---');
  try {
    const res = await axios.post(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
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
            parameters: [
              { type: "text", text: "On Visa" }
            ]
          }
        ]
      }
    }, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('Result dv_lottery_suspenso:', JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
  }

  console.log('\n--- TEST 2: Sending vagas_de_emprego_na_europa_pt_lu_po_ with variables ---');
  try {
    const res2 = await axios.post(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: targetPhone,
      type: "template",
      template: {
        name: "vagas_de_emprego_na_europa_pt_lu_po_",
        language: { code: "pt_BR" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "On Visa" }
            ]
          }
        ]
      }
    }, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('Result vagas:', JSON.stringify(res2.data, null, 2));
  } catch (err) {
    console.error('Error vagas:', err.response?.data || err.message);
  }
}

testExactCampaignSend().catch(console.error);
