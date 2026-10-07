import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

async function run() {
  const { data: contacts } = await sb.from('contacts').select('*');
  console.log(`Total contacts: ${contacts?.length}`);
  for (const c of contacts || []) {
    console.log(JSON.stringify(c));
  }
}

run().catch(console.error);
