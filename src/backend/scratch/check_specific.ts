import { supabaseAdmin } from '../config/supabase';

async function checkSpecific() {
  console.log('=== Checking messages with negado, recusado, carta de chamada ===');

  // Let's get all messages from USER that contain negad, recus, chamada
  const { data: userMsgs, error } = await supabaseAdmin
    .from('conversation_history')
    .select('id, customer_phone, sender, text, created_at')
    .eq('sender', 'user')
    .or('text.ilike.%negad%,text.ilike.%recusad%,text.ilike.%chamada%');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${userMsgs?.length || 0} user messages:`);
  for (const m of userMsgs || []) {
    console.log(`\n[${m.customer_phone}] (${m.created_at}):\n${m.text}`);
  }
}

checkSpecific().catch(console.error);
