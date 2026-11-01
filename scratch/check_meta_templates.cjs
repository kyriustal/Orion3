process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const path = require('path');
const axios = require('axios');
const { supabaseAdmin } = require(path.resolve(__dirname, '../dist-server/config/supabase.js'));

async function checkMeta() {
  const { data: waConfig } = await supabaseAdmin
    .from('whatsapp_config')
    .select('*')
    .eq('org_id', 'b4647d91-6352-4947-8988-0df409b245b3')
    .single();

  console.log('WA Config:', {
    phone_number_id: waConfig?.phone_number_id,
    waba_id: waConfig?.waba_id,
    has_token: !!waConfig?.access_token
  });

  if (!waConfig?.waba_id || !waConfig?.access_token) return;

  const url = `https://graph.facebook.com/v19.0/${waConfig.waba_id}/message_templates`;
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${waConfig.access_token}` }
  });

  console.log(`Found ${res.data?.data?.length} templates on Meta:`);
  for (const t of res.data?.data || []) {
    console.log(`\nName: ${t.name} | Status: ${t.status} | Category: ${t.category}`);
    console.log(`Components:`, JSON.stringify(t.components, null, 2));
  }
}

checkMeta().catch(console.error);
