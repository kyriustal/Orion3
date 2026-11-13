process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const path = require('path');
const axios = require('axios');
const { supabaseAdmin } = require(path.resolve(__dirname, '../dist-server/config/supabase.js'));

async function checkPayment() {
  const { data: waConfig } = await supabaseAdmin
    .from('whatsapp_config')
    .select('*')
    .eq('org_id', 'b4647d91-6352-4947-8988-0df409b245b3')
    .single();

  const token = waConfig.access_token;
  const wabaId = waConfig.waba_id;

  console.log('Checking WABA payment & credit status...');
  try {
    const res = await axios.get(`https://graph.facebook.com/v19.0/${wabaId}?fields=id,name,primary_funding_id,extended_credit_info,currency,timezone_id`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Payment & Credit response:', res.data);
  } catch (err) {
    console.error('Payment check error:', err.response?.data || err.message);
  }
}

checkPayment().catch(console.error);
