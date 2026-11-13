process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const path = require('path');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { supabaseAdmin } = require(path.resolve(__dirname, '../dist-server/config/supabase.js'));
const { processCampaign } = require(path.resolve(__dirname, '../dist-server/api/campaigns.routes.js'));

async function testSimulate() {
  const orgId = 'b4647d91-6352-4947-8988-0df409b245b3';

  console.log('Testing campaigns query for this org...');
  const { data: camps, error: campErr } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(3);

  console.log('Latest 3 camps:', camps.map(c => ({ id: c.id, name: c.name, status: c.status, sent: c.sent_count, failed: c.failed_count })));

  // Test calling resolveCampaignAudience
  const { data: orgData } = await supabaseAdmin.from('organizations').select('*').eq('id', orgId).single();
  console.log('Org name:', orgData?.name);
}

testSimulate().catch(console.error);
