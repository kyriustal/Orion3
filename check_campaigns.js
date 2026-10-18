import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { data: camps, error: campErr } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('--- RECENT CAMPAIGNS ---');
  console.log(JSON.stringify(camps, null, 2));

  const { data: logs, error: logErr } = await supabaseAdmin
    .from('campaign_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('--- RECENT LOGS ---');
  console.log(JSON.stringify(logs, null, 2));

  const { data: contacts, error: contErr } = await supabaseAdmin
    .from('contacts')
    .select('*')
    .limit(10);

  console.log('--- CONTACTS SAMPLE ---');
  console.log(JSON.stringify(contacts, null, 2));
}

main().catch(console.error);
