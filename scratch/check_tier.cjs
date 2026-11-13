process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const path = require('path');
const axios = require('axios');
const { supabaseAdmin } = require(path.resolve(__dirname, '../dist-server/config/supabase.js'));

async function checkTier() {
  const { data: waConfig } = await supabaseAdmin
    .from('whatsapp_config')
    .select('*')
    .eq('org_id', 'b4647d91-6352-4947-8988-0df409b245b3')
    .single();

  const phoneId = waConfig.phone_number_id;
  const token = waConfig.access_token;

  console.log('Querying phone number limit & status...');
  try {
    const res = await axios.get(`https://graph.facebook.com/v19.0/${phoneId}?fields=display_phone_number,messaging_limit_tier,quality_rating,status,throughput,is_official_business_account`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Phone details:', res.data);
  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
  }

  // Also query WABA messaging limit
  try {
    const res2 = await axios.get(`https://graph.facebook.com/v19.0/${waConfig.waba_id}?fields=id,name,account_review_status,ownership_type,purchase_order_number`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('WABA details:', res2.data);
  } catch (err) {
    console.error('WABA error:', err.response?.data || err.message);
  }
}

checkTier().catch(console.error);
