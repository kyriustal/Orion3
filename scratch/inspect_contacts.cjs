process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const path = require('path');
const { supabaseAdmin } = require(path.resolve(__dirname, '../dist-server/config/supabase.js'));

async function inspectContacts() {
  const { data: contacts, error } = await supabaseAdmin
    .from('contacts')
    .select('id, name, phone, source')
    .eq('org_id', 'b4647d91-6352-4947-8988-0df409b245b3')
    .limit(20);

  if (error) console.error('Error:', error);
  else {
    console.log(`Sample of 20 contacts:`);
    for (const c of contacts) {
      console.log(`ID: ${c.id} | Phone: "${c.phone}" | Name: "${c.name}"`);
    }
  }
}

inspectContacts().catch(console.error);
