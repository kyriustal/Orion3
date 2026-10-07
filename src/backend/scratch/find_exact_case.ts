import { supabaseAdmin } from '../config/supabase';

async function findExactCase() {
  console.log('Searching for England + (refused OR family OR invitation)...');

  // Let's fetch all messages containing inglat, reino unido, or londres
  // We can page through them or use ilike
  const terms = ['inglat', 'reino unido', 'londres'];
  const matchedMsgs: any[] = [];

  for (const t of terms) {
    let from = 0;
    const step = 1000;
    while (true) {
      const { data, error } = await supabaseAdmin
        .from('conversation_history')
        .select('*')
        .ilike('text', `%${t}%`)
        .range(from, from + step - 1);

      if (error) {
        console.error('Error:', error);
        break;
      }
      if (!data || data.length === 0) break;
      matchedMsgs.push(...data);
      if (data.length < step) break;
      from += step;
    }
  }

  console.log(`Total messages mentioning England/UK/London: ${matchedMsgs.length}`);

  // Deduplicate by message ID
  const map = new Map<any, any>();
  for (const m of matchedMsgs) {
    map.set(m.id, m);
  }
  const uniqueMsgs = Array.from(map.values());
  console.log(`Unique messages: ${uniqueMsgs.length}`);

  // Now inspect phones of these messages
  const phones = Array.from(new Set(uniqueMsgs.map(m => m.customer_phone)));
  console.log(`Phones to investigate: ${phones.length}`);

  for (const phone of phones) {
    // Get ALL messages for this phone to read full conversation context
    const { data: conv } = await supabaseAdmin
      .from('conversation_history')
      .select('customer_phone, sender, text, created_at')
      .eq('customer_phone', phone)
      .order('created_at', { ascending: true });

    const fullText = (conv || []).map(m => m.text).join(' ').toLowerCase();

    // Condition: mentions England/UK AND (negad/recus/chumb/rejeit) AND (chamad/convit/famíl/famil)
    const hasUK = fullText.includes('inglat') || fullText.includes('reino unido') || fullText.includes('londres');
    const hasRefusal = fullText.includes('negad') || fullText.includes('recus') || fullText.includes('chumb') || fullText.includes('rejeit') || fullText.includes('não deram') || fullText.includes('nao deram');
    const hasFamilyOrCall = fullText.includes('chamad') || fullText.includes('convit') || fullText.includes('famíl') || fullText.includes('famil') || fullText.includes('irmã') || fullText.includes('irma') || fullText.includes('irmão') || fullText.includes('irmao') || fullText.includes('parente');

    if (hasUK && (hasRefusal || hasFamilyOrCall)) {
      console.log(`\n======================================================`);
      console.log(`MATCHED CONVERSATION: Phone ${phone}`);
      console.log(`======================================================`);
      for (const m of conv || []) {
        console.log(`[${m.created_at}] [${m.sender}]: ${m.text}`);
      }
    }
  }
}

findExactCase().catch(console.error);
