import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

async function run() {
  console.log('Searching all phone numbers where user mentions England/UK/Visa...');
  
  // Let's query messages from user that mention:
  // "inglat", "reino", "londres", "carta", "chamada", "negad", "recus"
  const { data: msgs } = await sb
    .from('conversation_history')
    .select('customer_phone, sender, text, created_at')
    .eq('sender', 'user')
    .or('text.ilike.%inglat%,text.ilike.%reino%,text.ilike.%londres%,text.ilike.%carta%,text.ilike.%chamada%,text.ilike.%negad%,text.ilike.%recus%');

  console.log(`Found ${msgs?.length} matching user messages.`);

  // Group by phone
  const byPhone = {};
  for (const m of msgs || []) {
    if (!byPhone[m.customer_phone]) byPhone[m.customer_phone] = [];
    byPhone[m.customer_phone].push(m);
  }

  for (const [phone, list] of Object.entries(byPhone)) {
    const combined = list.map(x => x.text).join(' ').toLowerCase();
    // Check if mentions England or letter or refusal
    const hasUK = combined.includes('inglat') || combined.includes('reino') || combined.includes('londres');
    const hasLetter = combined.includes('chamad') || combined.includes('convit') || combined.includes('carta');
    const hasRefusal = combined.includes('negad') || combined.includes('recus');
    const hasFamily = combined.includes('famil') || combined.includes('irm') || combined.includes('tia') || combined.includes('tio');

    if ((hasUK && hasLetter) || (hasUK && hasRefusal) || (hasUK && hasFamily) || (hasLetter && hasRefusal)) {
      console.log(`\n>>> CANDIDATE PHONE: ${phone} <<<`);
      for (const item of list) {
        console.log(`  [USER @ ${item.created_at}]: ${item.text}`);
      }
    }
  }
}

run().catch(console.error);
