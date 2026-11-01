process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const path = require('path');
const { supabaseAdmin } = require(path.resolve(__dirname, '../dist-server/config/supabase.js'));

async function inspectSchema() {
  const { data, error } = await supabaseAdmin.from('templates').select('*').limit(1);
  if (error) console.error('Error:', error);
  else {
    console.log('Columns in templates:', Object.keys(data[0] || {}));
  }
}

inspectSchema().catch(console.error);
