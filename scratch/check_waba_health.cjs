process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const path = require('path');
const axios = require('axios');
const { supabaseAdmin } = require(path.resolve(__dirname, '../dist-server/config/supabase.js'));

async function checkHealth() {
  const { data: waConfig } = await supabaseAdmin
    .from('whatsapp_config')
    .select('*')
    .eq('org_id', 'b4647d91-6352-4947-8988-0df409b245b3')
    .single();

  console.log('WA Config in DB:', {
    phone_number_id: waConfig?.phone_number_id,
    waba_id: waConfig?.waba_id,
    app_id: waConfig?.app_id
  });

  const token = waConfig.access_token;
  const phoneId = waConfig.phone_number_id;
  const wabaId = waConfig.waba_id;

  // 1. Check Phone Number details
  console.log('\n--- 1. PHONE NUMBER DETAILS ---');
  try {
    const res = await axios.get(`https://graph.facebook.com/v19.0/${phoneId}?fields=display_phone_number,verified_name,code_verification_status,quality_rating,status,throughput,account_mode`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Phone details:', res.data);
  } catch (err) {
    console.error('Phone details error:', err.response?.data || err.message);
  }

  // 2. Check WABA details
  console.log('\n--- 2. WABA DETAILS ---');
  try {
    const res = await axios.get(`https://graph.facebook.com/v19.0/${wabaId}?fields=id,name,currency,timezone_id,message_template_namespace,account_review_status`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('WABA details:', res.data);
  } catch (err) {
    console.error('WABA details error:', err.response?.data || err.message);
  }

  // 3. Test sending a direct message to a test number right now
  console.log('\n--- 3. TEST SEND TEMPLATE NOW ---');
  try {
    const res = await axios.post(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "244940402546",
      type: "template",
      template: {
        name: "hello_world",
        language: { code: "en_US" }
      }
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('Hello World Test Result:', res.data);
  } catch (err) {
    console.error('Hello World Test Error:', err.response?.data || err.message);
  }
}

checkHealth().catch(console.error);
