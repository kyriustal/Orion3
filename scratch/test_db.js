process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { supabaseAdmin } = require('./dist-server/config/supabase.js');

async function test() {
  const { data, error } = await supabaseAdmin.from('knowledge_docs').select('*').limit(3);
  console.log('Error:', error);
  if (data && data[0]) {
    console.log('Columns:', Object.keys(data[0]));
    console.log('Sample row:', {
      id: data[0].id,
      filename: data[0].filename,
      mime_type: data[0].mime_type,
      file_size: data[0].file_size,
      has_file_url: 'file_url' in data[0],
      has_storage_path: 'storage_path' in data[0]
    });
  } else {
    console.log('No data found, table empty or error');
  }
}

test().catch(console.error);
