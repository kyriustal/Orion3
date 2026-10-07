import { supabaseAdmin } from '../config/supabase';

async function searchHistory() {
  console.log('Searching conversation_history...');
  
  // 1. Get sample row to see schema
  const { data: sample, error: sampleErr } = await supabaseAdmin
    .from('conversation_history')
    .select('*')
    .limit(1);

  if (sampleErr) {
    console.error('Error fetching sample from conversation_history:', sampleErr);
  } else {
    console.log('conversation_history columns:', Object.keys(sample?.[0] || {}));
  }

  // 2. Search conversation_history for keywords
  const keywords = ['inglaterra', 'visto', 'chamada', 'reino unido', 'recusado', 'negado', 'londres', 'embaixada'];
  for (const kw of keywords) {
    const { data: matches, error: matchErr } = await supabaseAdmin
      .from('conversation_history')
      .select('*')
      .or(`content.ilike.%${kw}%,text.ilike.%${kw}%,message.ilike.%${kw}%`)
      .limit(10);

    if (!matchErr && matches && matches.length > 0) {
      console.log(`\n=== Found ${matches.length} matches for keyword: "${kw}" ===`);
      for (const m of matches) {
        console.log({
          id: m.id,
          org_id: m.org_id,
          phone: m.customer_phone || m.phone || m.user_id,
          name: m.customer_name || m.name,
          role: m.role || m.sender,
          text: (m.content || m.text || m.message || '').substring(0, 300)
        });
      }
    }
  }

  // 3. Also search without text/content/message if those column names differ
  // Let's do a search on whatever text columns exist in sample
}

searchHistory().catch(console.error);
