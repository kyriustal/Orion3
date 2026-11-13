process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const path = require('path');
const { supabaseAdmin } = require(path.resolve(__dirname, '../dist-server/config/supabase.js'));

async function checkInbound() {
  console.log('--- CHECKING INBOUND MESSAGES ---');
  const { data: inbounds, error } = await supabaseAdmin
    .from('conversation_history')
    .select('*')
    .eq('sender', 'user')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) console.error('Error:', error);
  else {
    console.log(`Found ${inbounds?.length} recent user messages:`);
    for (const msg of inbounds || []) {
      console.log(`[${msg.created_at}] From: ${msg.customer_phone} | Text: ${msg.text?.substring(0, 60)}`);
    }
  }

  // Also check sender: 'client'
  const { data: clients } = await supabaseAdmin
    .from('conversation_history')
    .select('*')
    .eq('sender', 'client')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log(`Found ${clients?.length} recent client messages:`);
  for (const msg of clients || []) {
    console.log(`[${msg.created_at}] From: ${msg.customer_phone} | Text: ${msg.text?.substring(0, 60)}`);
  }
}

checkInbound().catch(console.error);
