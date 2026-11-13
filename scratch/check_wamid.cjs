process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const path = require('path');
const axios = require('axios');
const { supabaseAdmin } = require(path.resolve(__dirname, '../dist-server/config/supabase.js'));

async function checkWamid() {
  const { data: waConfig } = await supabaseAdmin
    .from('whatsapp_config')
    .select('*')
    .eq('org_id', 'b4647d91-6352-4947-8988-0df409b245b3')
    .single();

  const token = waConfig.access_token;
  const wamid = 'wamid.HBgMMjQ0OTQwNDAyNTQ2FQIAERgSRTk0RDMyQTZGN0FGNzY1QUVBAA==';

  console.log(`Checking wamid ${wamid}...`);
  try {
    const res = await axios.get(`https://graph.facebook.com/v19.0/${wamid}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Wamid response:', res.data);
  } catch (err) {
    console.log('Wamid error:', err.response?.data || err.message);
  }
}

checkWamid().catch(console.error);
