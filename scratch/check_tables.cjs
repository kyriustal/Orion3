process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const path = require('path');
const { supabaseAdmin } = require(path.resolve(__dirname, '../dist-server/config/supabase.js'));

async function checkTables() {
  const tables = ['conversation_history', 'campaign_logs', 'campaigns'];
  for (const t of tables) {
    const { count, error } = await supabaseAdmin.from(t).select('*', { count: 'exact', head: true });
    console.log(`Table ${t}: ${count} rows (err: ${error?.message || 'none'})`);
  }
}

checkTables().catch(console.error);
