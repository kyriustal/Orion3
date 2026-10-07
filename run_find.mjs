import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Searching all messages...');

  // Search conversation_history for any text mentioning "inglat"
  const { data: inglat } = await supabaseAdmin
    .from('conversation_history')
    .select('id, customer_phone, sender, text, created_at')
    .ilike('text', '%inglat%');

  console.log(`Inglaterra messages count: ${inglat?.length || 0}`);

  // Group by phone and check what the user said
  const phones = [...new Set((inglat || []).map(m => m.customer_phone))];
  for (const phone of phones) {
    const { data: conv } = await supabaseAdmin
      .from('conversation_history')
      .select('customer_phone, sender, text, created_at')
      .eq('customer_phone', phone)
      .order('created_at', { ascending: true });

    const userMsgs = (conv || []).filter(c => c.sender === 'user').map(c => c.text).join('\n');
    const uLower = userMsgs.toLowerCase();

    // Check if user mentions refusal, family, or invitation letter
    if (
      uLower.includes('visto') ||
      uLower.includes('negad') ||
      uLower.includes('recus') ||
      uLower.includes('chamad') ||
      uLower.includes('famil') ||
      uLower.includes('irm') ||
      uLower.includes('inglat') ||
      uLower.includes('londres')
    ) {
      console.log(`\n=================== PHONE: ${phone} ===================`);
      // Get contact info
      const { data: contact } = await supabaseAdmin
        .from('contacts')
        .select('*')
        .eq('phone', phone)
        .maybeSingle();
      console.log(`Contact: ${contact?.name || 'Sem Nome'} | Email: ${contact?.email || 'N/A'}`);
      
      for (const msg of conv || []) {
        if (msg.sender === 'user' || msg.text?.toLowerCase().includes('inglat') || msg.text?.toLowerCase().includes('chamad') || msg.text?.toLowerCase().includes('negad')) {
          console.log(`  [${msg.sender}]: ${msg.text}`);
        }
      }
    }
  }
}

run().catch(console.error);
