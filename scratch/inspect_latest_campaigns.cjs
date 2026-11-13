process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const path = require('path');
const { supabaseAdmin } = require(path.resolve(__dirname, '../dist-server/config/supabase.js'));

async function inspectLatest() {
  console.log('=== LATEST 5 CAMPAIGNS ===');
  const { data: camps, error: campErr } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (campErr) {
    console.error('Camp error:', campErr);
    return;
  }

  for (const c of camps) {
    console.log(`\nID: ${c.id}`);
    console.log(`Name: ${c.name}`);
    console.log(`Created: ${c.created_at} | Status: ${c.status} | Progress: ${c.progress}%`);
    console.log(`Template: ${c.template} | Sent: ${c.sent_count} | Failed: ${c.failed_count} | Total: ${c.total_contacts}`);
    console.log(`Audience: ${c.audience}`);
    console.log(`Filters:`, JSON.stringify(c.filters));
    
    // Check logs for this campaign
    const { data: logs } = await supabaseAdmin
      .from('campaign_logs')
      .select('*')
      .eq('campaign_id', c.id);
    
    console.log(`Logs count: ${logs?.length || 0}`);
    if (logs && logs.length > 0) {
      console.log('Sample logs:', logs.slice(0, 5));
    }
  }
}

inspectLatest().catch(console.error);
