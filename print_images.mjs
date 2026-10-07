import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

async function run() {
  const { data } = await sb.from('conversation_history').select('customer_phone, sender, text, created_at').ilike('text', '%[Imagem%');
  for (const d of data || []) {
    console.log(`\n=== PHONE: ${d.customer_phone} (${d.created_at}) ===`);
    console.log(d.text);
  }
}

run().catch(console.error);
