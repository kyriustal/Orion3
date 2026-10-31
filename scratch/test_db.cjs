process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const path = require('path');
const { supabaseAdmin } = require(path.resolve(__dirname, '../dist-server/config/supabase.js'));

async function test() {
  const testBuffer = Buffer.from('Test file content for knowledge download', 'utf-8');
  const path = 'knowledge/test_doc_123/teste.txt';
  const { data, error } = await supabaseAdmin.storage.from('assets').upload(path, testBuffer, {
    contentType: 'text/plain',
    upsert: true
  });
  console.log('Upload result:', { data, error });

  const { data: downData, error: downErr } = await supabaseAdmin.storage.from('assets').download(path);
  console.log('Download result:', { size: downData ? downData.size : null, downErr });

  // Cleanup
  await supabaseAdmin.storage.from('assets').remove([path]);
  console.log('Cleaned up test file.');
}

test().catch(console.error);
