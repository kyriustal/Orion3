process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const path = require('path');
const { supabaseAdmin } = require(path.resolve(__dirname, '../dist-server/config/supabase.js'));

async function inspect() {
  console.log('--- RECENT CAMPAIGNS ---');
  const { data: camps, error: campErr } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (campErr) console.error('Camp error:', campErr);
  else {
    for (const c of camps) {
      console.log(`\nCampaign ID: ${c.id}`);
      console.log(`Name: ${c.name} | Template: ${c.template} | Status: ${c.status} | Sent: ${c.sent_count} | Failed: ${c.failed_count}`);
      console.log(`Media URL: ${c.media_url || c.filters?.media_url || c.filters?.media?.url || 'none'}`);
      console.log(`Media details:`, JSON.stringify(c.filters?.media || null));
      
      // logs
      const { data: logs } = await supabaseAdmin
        .from('campaign_logs')
        .select('*')
        .eq('campaign_id', c.id)
        .limit(5);
      console.log(`Sample logs:`, logs);
    }
  }

  console.log('\n--- TEMPLATES ---');
  const { data: tmpls, error: tmplErr } = await supabaseAdmin
    .from('templates')
    .select('*')
    .limit(10);
  if (tmplErr) console.error('Tmpl error:', tmplErr);
  else {
    for (const t of tmpls) {
      console.log(`Template: ${t.name} (${t.status}) | Category: ${t.category} | Lang: ${t.language}`);
      console.log(`Components:`, JSON.stringify(t.components || null));
      console.log(`Content:`, t.content?.substring(0, 80));
    }
  }
}

inspect().catch(console.error);
