import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

async function searchMessagesTable() {
  console.log('Searching public.messages table...');

  const { data, error } = await sb
    .from('messages')
    .select('*')
    .or('content.ilike.%inglat%,content.ilike.%reino%,content.ilike.%londres%,content.ilike.%chamada%,content.ilike.%negad%,content.ilike.%recus%');

  console.log(`Matching rows in messages table: ${data?.length || 0}`);
  for (const m of data || []) {
    console.log(`\n[Session: ${m.session_id}] [Role: ${m.role}] [Date: ${m.created_at}]:\n${m.content}`);
  }
}

searchMessagesTable().catch(console.error);
