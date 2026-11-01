process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const path = require('path');
const axios = require('axios');
const { supabaseAdmin } = require(path.resolve(__dirname, '../dist-server/config/supabase.js'));

async function testCreateMediaTemplate() {
  const { data: waConfig } = await supabaseAdmin
    .from('whatsapp_config')
    .select('*')
    .eq('org_id', 'b4647d91-6352-4947-8988-0df409b245b3')
    .single();

  const url = `https://graph.facebook.com/v19.0/${waConfig.waba_id}/message_templates`;

  console.log('Testing create template with HEADER: IMAGE on Meta...');
  try {
    const res = await axios.post(url, {
      name: "teste_template_imagem_orion",
      category: "MARKETING",
      language: "pt_BR",
      components: [
        {
          type: "HEADER",
          format: "IMAGE"
        },
        {
          type: "BODY",
          text: "Este é um teste de template com imagem no cabeçalho."
        }
      ]
    }, {
      headers: {
        'Authorization': `Bearer ${waConfig.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('Create success:', res.data);
  } catch (err) {
    console.log('Create error:', err.response?.data || err.message);
  }
}

testCreateMediaTemplate().catch(console.error);
