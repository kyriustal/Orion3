process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const path = require('path');
const { supabaseAdmin } = require(path.resolve(__dirname, '../dist-server/config/supabase.js'));
const { WhatsAppService } = require(path.resolve(__dirname, '../dist-server/services/whatsapp.service.js'));

async function testUserMedia() {
  const { data: waConfig } = await supabaseAdmin
    .from('whatsapp_config')
    .select('*')
    .eq('org_id', 'b4647d91-6352-4947-8988-0df409b245b3')
    .single();

  const phoneId = waConfig.phone_number_id;
  const token = waConfig.access_token;
  const targetPhone = "244940402546";
  const mediaUrl = "https://iinubqqhkmopwyndjbja.supabase.co/storage/v1/object/public/assets/b4647d91-6352-4947-8988-0df409b245b3/campaigns/1793555662193_IMG_5650.jpeg";

  console.log('Testing sendMediaByUrl with IMG_5650.jpeg...');
  const res = await WhatsAppService.sendMediaByUrl(
    targetPhone,
    mediaUrl,
    'image/jpeg',
    'IMG_5650.jpeg',
    phoneId,
    token
  );
  console.log('Result sendMediaByUrl:', res);
}

testUserMedia().catch(console.error);
