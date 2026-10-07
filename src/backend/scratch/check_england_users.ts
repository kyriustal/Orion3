import { supabaseAdmin } from '../config/supabase';

async function checkEnglandUserMessages() {
  const { data: msgs, error } = await supabaseAdmin
    .from('conversation_history')
    .select('id, customer_phone, sender, text, created_at')
    .or('text.ilike.%inglaterra%,text.ilike.%reino unido%,text.ilike.%londres%');

  if (error) {
    console.error(error);
    return;
  }

  console.log(`Found ${msgs?.length || 0} messages mentioning England/UK/London.`);

  // Group by phone
  const byPhone: Record<string, any[]> = {};
  for (const m of msgs || []) {
    if (!byPhone[m.customer_phone]) byPhone[m.customer_phone] = [];
    byPhone[m.customer_phone].push(m);
  }

  console.log(`Distinct phone numbers: ${Object.keys(byPhone).length}`);
  for (const [phone, list] of Object.entries(byPhone)) {
    const hasUser = list.some(x => x.sender === 'user');
    console.log(`\nPhone: ${phone} (Total msgs with term: ${list.length}, HasUserMsg: ${hasUser})`);
    for (const item of list) {
      if (item.sender === 'user') {
        console.log(`  [USER]: ${item.text}`);
      }
    }
  }
}

checkEnglandUserMessages().catch(console.error);
