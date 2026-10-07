import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

async function run() {
  const { data: contacts } = await sb.from('contacts').select('*');
  console.log(`Checking all ${contacts?.length} contacts...`);

  for (const c of contacts || []) {
    const { data: msgs } = await sb
      .from('conversation_history')
      .select('sender, text, created_at')
      .eq('customer_phone', c.phone)
      .order('created_at', { ascending: true });

    const allText = (msgs || []).map(m => m.text).join(' ').toLowerCase();

    // Look for refusal, letter, family, England, etc.
    const hasUK = allText.includes('inglat') || allText.includes('reino') || allText.includes('londres') || allText.includes('uk');
    const hasLetter = allText.includes('chamad') || allText.includes('convit') || allText.includes('patroc');
    const hasRefusal = allText.includes('negad') || allText.includes('recus') || allText.includes('chumb');
    const hasFamily = allText.includes('famil') || allText.includes('irm') || allText.includes('tia') || allText.includes('tio') || allText.includes('parente');

    let score = 0;
    if (hasUK) score += 2;
    if (hasLetter) score += 2;
    if (hasRefusal) score += 2;
    if (hasFamily) score += 1;

    if (score >= 3) {
      console.log(`\n======================================================`);
      console.log(`SCORE ${score}: ${c.name} (${c.phone}) - Email: ${c.email}`);
      console.log(`======================================================`);
      for (const m of msgs || []) {
        console.log(`[${m.sender} @ ${m.created_at}]: ${m.text}`);
      }
    }
  }
}

run().catch(console.error);
