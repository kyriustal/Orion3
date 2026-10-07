import { supabaseAdmin } from '../config/supabase';

async function searchRefusalDocs() {
  console.log('Searching for UK refusal docs / keywords...');
  
  const terms = [
    'ukvi',
    'home office',
    'entry clearance',
    'refusal of entry',
    'refused',
    'sponsor',
    'sponsor licence',
    'carta de chamada',
    'carta convite',
    'visto negado',
    'inglaterra',
    'uk',
    'reino unido'
  ];

  for (const t of terms) {
    const { data } = await supabaseAdmin
      .from('conversation_history')
      .select('id, customer_phone, sender, text, created_at')
      .ilike('text', `%${t}%`);

    if (data && data.length > 0) {
      console.log(`\n=== Keyword "${t}": ${data.length} matches ===`);
      for (const row of data) {
        // Only print if there is indication of refusal, family, letter, or UK
        const txt = (row.text || '').toLowerCase();
        if (
          txt.includes('famíl') || txt.includes('famil') ||
          txt.includes('irm') || txt.includes('tio') || txt.includes('tia') ||
          txt.includes('chamada') || txt.includes('convite') ||
          txt.includes('negad') || txt.includes('recus') || txt.includes('refus') ||
          txt.includes('inglat') || txt.includes('reino')
        ) {
          console.log(`[${row.customer_phone}] (${row.sender} @ ${row.created_at}): ${row.text.substring(0, 300)}...`);
        }
      }
    }
  }
}

searchRefusalDocs().catch(console.error);
