const dotenv = require('dotenv');
dotenv.config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function findConversation() {
  const { data, error } = await sb
    .from('conversation_history')
    .select('*')
    .ilike('text', '%Luxemburgo%')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Found messages with Luxemburgo:');
  for (const m of data) {
    console.log(`\nCustomer Phone: ${m.customer_phone}, Org: ${m.org_id}`);
    // Get full history for this customer
    const { data: fullHist } = await sb
      .from('conversation_history')
      .select('*')
      .eq('org_id', m.org_id)
      .eq('customer_phone', m.customer_phone)
      .order('created_at', { ascending: true });
    
    console.log(`Total messages for this customer: ${fullHist.length}`);
    for (const h of fullHist) {
      console.log(`  [${h.created_at}] [${h.sender}] ${h.text.substring(0, 80)}`);
    }

    // Check contacts table
    const { data: contact } = await sb
      .from('contacts')
      .select('*')
      .eq('org_id', m.org_id)
      .eq('phone', m.customer_phone);
    console.log('Contact row:', contact);
    break;
  }
}

findConversation();
