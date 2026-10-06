const dotenv = require('dotenv');
dotenv.config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  const orgId = 'b4647d91-6352-4947-8988-0df409b245b3';
  
  // Total messages for this org
  const { count: orgMsgs } = await sb.from('conversation_history').select('*', { count: 'exact', head: true }).eq('org_id', orgId);
  console.log('Total messages for On Visa (b4647d91):', orgMsgs);

  // Total contacts
  const { count: contactsCount } = await sb.from('contacts').select('*', { count: 'exact', head: true }).eq('org_id', orgId);
  console.log('Total contacts in contacts table:', contactsCount);

  // Check distinct phones
  const { data: phonesSample } = await sb.rpc('get_distinct_chats', { p_org_id: orgId }).catch(() => ({ data: null }));
  console.log('RPC get_distinct_chats exists?:', !!phonesSample);
}
test();
