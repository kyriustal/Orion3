import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fix() {
  const { data } = await supabase.from('facebook_config').select('*');
  const cfg = data[0];
  const userToken = cfg.page_access_token;
  
  const res = await axios.get('https://graph.facebook.com/v19.0/me/accounts', {
    params: { access_token: userToken }
  });
  
  const onVisa = res.data.data.find(a => a.id === cfg.page_id);
  if (onVisa && onVisa.access_token) {
    console.log('Updating DB with real Page Access Token for On Visa...');
    const { error } = await supabase
      .from('facebook_config')
      .update({
        page_access_token: onVisa.access_token,
        access_token: onVisa.access_token,
        display_name: onVisa.name
      })
      .eq('id', cfg.id);
      
    if (error) {
      console.error('Update error:', error);
    } else {
      console.log('Successfully updated facebook_config with Page Access Token!');
    }
  }
}

fix();
