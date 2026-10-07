import { supabaseAdmin } from '../config/supabase';

async function search() {
  const terms = ['inglaterra', 'visto', 'chamada', 'reino unido', 'inglês', 'uk', 'londres', 'recus', 'negad', 'famíl'];
  
  for (const term of terms) {
    const { data, error } = await supabaseAdmin
      .from('conversation_history')
      .select('id, org_id, customer_phone, sender, text, created_at')
      .ilike('text', `%${term}%`)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error(`Error querying "${term}":`, error.message);
    } else {
      console.log(`\n=== Keyword "${term}" found ${data?.length || 0} rows ===`);
      for (const row of data || []) {
        console.log(`[${row.created_at}] [Phone: ${row.customer_phone}] [Sender: ${row.sender}] Text: ${row.text}`);
      }
    }
  }
}

search().catch(console.error);
