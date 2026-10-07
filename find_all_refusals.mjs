import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('--- FINDING CLIENT WITH REFUSED VISA / UK / INVITATION LETTER ---');
  
  // 1. Search messages where text contains "chamada" or "convite"
  const { data: chamadaMsgs } = await supabaseAdmin
    .from('conversation_history')
    .select('customer_phone, sender, text, created_at')
    .or('text.ilike.%chamada%,text.ilike.%convite%')
    .eq('sender', 'user');

  console.log(`User messages with chamada/convite: ${chamadaMsgs?.length || 0}`);
  for (const m of chamadaMsgs || []) {
    console.log(`[${m.customer_phone}]: ${m.text}`);
  }

  // 2. Search messages where text contains "negad" or "recus" or "chumb" from USER
  const { data: refusalMsgs } = await supabaseAdmin
    .from('conversation_history')
    .select('customer_phone, sender, text, created_at')
    .or('text.ilike.%negad%,text.ilike.%recus%,text.ilike.%chumb%')
    .eq('sender', 'user');

  console.log(`\nUser messages with refusal: ${refusalMsgs?.length || 0}`);
  for (const m of refusalMsgs || []) {
    console.log(`[${m.customer_phone}]: ${m.text}`);
  }

  // 3. Search contacts table for any notes or fields
  const { data: contacts } = await supabaseAdmin.from('contacts').select('*');
  console.log(`\nContacts total: ${contacts?.length || 0}`);
  for (const c of contacts || []) {
    const s = JSON.stringify(c).toLowerCase();
    if (s.includes('inglat') || s.includes('reino') || s.includes('chamada') || s.includes('negad') || s.includes('recus') || s.includes('uk')) {
      console.log('MATCHED CONTACT:', c);
    }
  }
}

main().catch(console.error);
