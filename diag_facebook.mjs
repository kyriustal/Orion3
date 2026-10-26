import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.from('facebook_config').select('*');
  if (error) {
    console.error('Supabase error:', error);
    return;
  }
  console.log('Facebook configs count:', data ? data.length : 0);

  for (const cfg of data || []) {
    const pageId = cfg.page_id;
    const token = cfg.page_access_token || cfg.access_token;
    console.log(`\nTesting Page ID: ${pageId} | Name: ${cfg.display_name}`);

    // 1. /me
    try {
      const meRes = await axios.get('https://graph.facebook.com/v19.0/me', {
        params: { access_token: token, fields: 'id,name' }
      });
      console.log('1. /me result:', meRes.data);
    } catch (e) {
      console.error('1. /me error:', e.response?.data || e.message);
    }

    // 2. /me/permissions
    try {
      const permRes = await axios.get('https://graph.facebook.com/v19.0/me/permissions', {
        params: { access_token: token }
      });
      console.log('2. /me/permissions:', permRes.data?.data?.map((p) => `${p.permission}: ${p.status}`));
    } catch (e) {
      console.error('2. /me/permissions error:', e.response?.data || e.message);
    }

    // 3. GET /{pageId}/subscribed_apps
    try {
      const subGetRes = await axios.get(`https://graph.facebook.com/v19.0/${pageId}/subscribed_apps`, {
        params: { access_token: token }
      });
      console.log('3. GET /subscribed_apps:', JSON.stringify(subGetRes.data));
    } catch (e) {
      console.error('3. GET /subscribed_apps error:', e.response?.data || e.message);
    }

    // 4. POST /{pageId}/subscribed_apps
    try {
      const subPostRes = await axios.post(`https://graph.facebook.com/v19.0/${pageId}/subscribed_apps`, {
        subscribed_fields: ['messages', 'messaging_postbacks']
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('4. POST /subscribed_apps (messages, messaging_postbacks):', subPostRes.data);
    } catch (e) {
      console.error('4. POST /subscribed_apps error:', e.response?.data || e.message);
    }

    // 5. POST /{pageId}/subscribed_apps empty body
    try {
      const subPostRes2 = await axios.post(`https://graph.facebook.com/v19.0/${pageId}/subscribed_apps`, {}, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('5. POST /subscribed_apps (empty body):', subPostRes2.data);
    } catch (e) {
      console.error('5. POST /subscribed_apps (empty body) error:', e.response?.data || e.message);
    }
  }
}

check();
