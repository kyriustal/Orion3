import { supabaseAdmin } from '../config/supabase';

async function searchDeep() {
  // Let's do a direct count
  const { count } = await supabaseAdmin
    .from('conversation_history')
    .select('*', { count: 'exact', head: true });

  console.log(`Total rows in conversation_history: ${count}`);

  // Query specifically with ilike on the server side:
  // England / Reino Unido / Inglaterra / Londres / UK
  // Carta de chamada / recusado / negado
  const queries = [
    'visto negado',
    'negado',
    'recusado',
    'rejeitado',
    'carta de chamada',
    'inglaterra',
    'reino unido',
    'londres'
  ];

  for (const q of queries) {
    const { data, error } = await supabaseAdmin
      .from('conversation_history')
      .select('id, org_id, customer_phone, sender, text, created_at')
      .ilike('text', `%${q}%`);

    if (error) {
      console.error(`Error for "${q}":`, error.message);
    } else {
      console.log(`\nQuery "%${q}%": found ${data?.length || 0} messages.`);
      // Check if any mention Inglaterra or Reino Unido or Carta de chamada
      for (const item of data || []) {
        const t = (item.text || '').toLowerCase();
        if (
          (t.includes('inglat') || t.includes('reino unido') || t.includes('londres') || t.includes('uk')) &&
          (t.includes('chamada') || t.includes('recus') || t.includes('negad') || t.includes('famíl') || t.includes('famil'))
        ) {
          console.log(`>>> STRONG MATCH <<< [${item.customer_phone}] (${item.sender}): ${item.text}`);
        }
      }
    }
  }

  // Also check contacts table for any notes or fields
  const { data: contacts } = await supabaseAdmin
    .from('contacts')
    .select('*');

  console.log(`\nTotal contacts: ${contacts?.length || 0}`);
  for (const c of contacts || []) {
    const str = JSON.stringify(c).toLowerCase();
    if (str.includes('inglat') || str.includes('reino') || str.includes('chamada') || str.includes('negad') || str.includes('recus')) {
      console.log(`Contact match:`, c);
    }
  }
}

searchDeep().catch(console.error);
