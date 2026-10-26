import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data } = await supabase.from('facebook_config').select('*');
  const cfg = data[0];
  const userToken = cfg.page_access_token;
  console.log('Fetching accounts with user token...');
  try {
    const res = await axios.get('https://graph.facebook.com/v19.0/me/accounts', {
      params: { access_token: userToken }
    });
    console.log('Accounts found:', res.data.data.map(a => ({ id: a.id, name: a.name, hasToken: !!a.access_token })));
    const onVisa = res.data.data.find(a => a.id === cfg.page_id || a.name.includes('Visa'));
    if (onVisa) {
      console.log('Found page token for On Visa!');
      const pageToken = onVisa.access_token;
      console.log('Testing subscribe with On Visa page token...');
      const subRes = await axios.post(`https://graph.facebook.com/v19.0/${onVisa.id}/subscribed_apps`, {
        subscribed_fields: ['messages', 'messaging_postbacks']
      }, {
        headers: { 'Authorization': `Bearer ${pageToken}` }
      });
      console.log('Subscribe result with Page Token:', subRes.data);

      const checkSub = await axios.get(`https://graph.facebook.com/v19.0/${onVisa.id}/subscribed_apps`, {
        params: { access_token: pageToken }
      });
      console.log('Check Subscribed Apps:', checkSub.data);
    }
  } catch (e) {
    console.error('Error:', e.response?.data || e.message);
  }
}

check();
