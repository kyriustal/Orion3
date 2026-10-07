import { supabaseAdmin } from '../config/supabase';

async function scanAllUserMessages() {
  console.log('Fetching all user messages...');
  let allUserMsgs: any[] = [];
  let from = 0;
  const step = 1000;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('conversation_history')
      .select('id, customer_phone, text, created_at')
      .eq('sender', 'user')
      .range(from, from + step - 1);

    if (error) {
      console.error(error);
      break;
    }
    if (!data || data.length === 0) break;
    allUserMsgs.push(...data);
    if (data.length < step) break;
    from += step;
  }

  console.log(`Total user messages fetched: ${allUserMsgs.length}`);

  // Let's filter for anything related to carta, chamada, visto negado, inglaterra, uk, familia, recusa
  for (const m of allUserMsgs) {
    const t = (m.text || '').toLowerCase();
    
    // Interesting keywords
    const hasVisa = t.includes('visto') || t.includes('processo') || t.includes('embaixada') || t.includes('consulado');
    const hasRefusal = t.includes('negad') || t.includes('recus') || t.includes('chumb') || t.includes('rejeit') || t.includes('reprov');
    const hasLetter = t.includes('carta') || t.includes('chamada') || t.includes('convite') || t.includes('patroc');
    const hasEngland = t.includes('inglat') || t.includes('londres') || t.includes('reino') || t.includes('uk') || t.includes('britan');
    const hasFamily = t.includes('famil') || t.includes('irm') || t.includes('tio') || t.includes('tia') || t.includes('primo') || t.includes('parente');

    if (
      (hasLetter && hasEngland) ||
      (hasRefusal && hasEngland) ||
      (hasLetter && hasFamily) ||
      (hasRefusal && hasFamily) ||
      (hasRefusal && hasLetter) ||
      (hasRefusal && (t.includes('já') || t.includes('ja') || t.includes('tive') || t.includes('foi')))
    ) {
      console.log(`\n[Phone: ${m.customer_phone}] [Date: ${m.created_at}]:\n${m.text}`);
    }
  }
}

scanAllUserMessages().catch(console.error);
