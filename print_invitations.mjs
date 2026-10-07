import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });
const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

async function check() {
  const { data } = await sb
    .from('conversation_history')
    .select('customer_phone, sender, text, created_at')
    .eq('sender', 'user')
    .or('text.ilike.%chamada%,text.ilike.%convite%');

  console.log(`Found ${data?.length} messages:`);
  for (const d of data || []) {
    console.log(`--- [${d.customer_phone}] [${d.created_at}] ---`);
    console.log(d.text);
  }
}

check().catch(console.error);
