import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const appId = process.env.META_APP_ID;
const appSecret = process.env.META_APP_SECRET;
const appToken = `${appId}|${appSecret}`;

import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  const { data } = await supabase.from('facebook_config').select('*');
  const pageToken = data[0].page_access_token;

  try {
    const debugRes = await axios.get('https://graph.facebook.com/v19.0/debug_token', {
      params: {
        input_token: pageToken,
        access_token: appToken
      }
    });
    console.log('Debug Token Result:', JSON.stringify(debugRes.data, null, 2));
  } catch (e) {
    console.error('Debug Token Error:', e.response?.data || e.message);
  }
}

test();
