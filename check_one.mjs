import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

const phone = process.argv[2] || '244957939018';

async function check() {
  const { data } = await sb.from('conversation_history').select('*').eq('customer_phone', phone).order('created_at', { ascending: true });
  const { data: contact } = await sb.from('contacts').select('*').eq('phone', phone).maybeSingle();
  console.log('=== CONTACT ===', contact);
  console.log(`=== ${data?.length} MESSAGES FOR ${phone} ===`);
  for (const m of data || []) {
    if (m.sender === 'user' || m.text?.toLowerCase().includes('inglat') || m.text?.toLowerCase().includes('visto') || m.text?.toLowerCase().includes('famíl') || m.text?.toLowerCase().includes('negad') || m.text?.toLowerCase().includes('recus') || m.text?.toLowerCase().includes('carta')) {
      console.log(`[${m.sender} @ ${m.created_at}]: ${m.text}`);
    }
  }
}

check().catch(console.error);
