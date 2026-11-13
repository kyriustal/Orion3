process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const path = require('path');
const { supabaseAdmin } = require(path.resolve(__dirname, '../dist-server/config/supabase.js'));

async function checkRecentEvents() {
  console.log('--- RECENT CONVERSATION HISTORY ---');
  const { data: convs, error: convErr } = await supabaseAdmin
    .from('conversation_history')
    .select('*')
    .eq('customer_phone', '244940402546')
    .order('created_at', { ascending: false })
    .limit(10);

  if (convErr) console.error('Conv error:', convErr);
  else {
    for (const c of convs) {
      console.log(`[${c.created_at}] Sender: ${c.sender} | Text: ${c.text?.substring(0, 60)} | Metadata:`, JSON.stringify(c.metadata));
    }
  }

  // Check if there are any other recent entries in conversation_history
  console.log('\n--- LATEST 5 OVERALL CONVERSATION HISTORY ---');
  const { data: latestConvs } = await supabaseAdmin
    .from('conversation_history')
    .select('id, customer_phone, sender, text, created_at, metadata')
    .order('created_at', { ascending: false })
    .limit(5);

  for (const c of latestConvs || []) {
    console.log(`[${c.created_at}] To/From: ${c.customer_phone} | Sender: ${c.sender} | Text: ${c.text?.substring(0, 50)}`);
  }
}

checkRecentEvents().catch(console.error);
