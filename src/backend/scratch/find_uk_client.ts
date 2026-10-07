import { supabaseAdmin } from '../config/supabase';

async function searchUserMessages() {
  console.log('Searching USER messages specifically...');
  
  // 1. Inglaterra
  const { data: d1 } = await supabaseAdmin
    .from('conversation_history')
    .select('id, org_id, customer_phone, sender, text, created_at')
    .ilike('text', '%inglaterra%')
    .eq('sender', 'user');

  console.log(`User messages with 'inglaterra': ${d1?.length || 0}`);
  for (const r of d1 || []) {
    console.log(`[USER ${r.customer_phone} @ ${r.created_at}]: ${r.text}`);
  }

  // 2. Chamada
  const { data: d2 } = await supabaseAdmin
    .from('conversation_history')
    .select('id, org_id, customer_phone, sender, text, created_at')
    .ilike('text', '%chamada%')
    .eq('sender', 'user');

  console.log(`User messages with 'chamada': ${d2?.length || 0}`);
  for (const r of d2 || []) {
    console.log(`[USER ${r.customer_phone} @ ${r.created_at}]: ${r.text}`);
  }

  // 3. Negado / Recusado
  const { data: d3 } = await supabaseAdmin
    .from('conversation_history')
    .select('id, org_id, customer_phone, sender, text, created_at')
    .or('text.ilike.%negad%,text.ilike.%recusad%')
    .eq('sender', 'user');

  console.log(`User messages with negad/recusad: ${d3?.length || 0}`);
  for (const r of d3 || []) {
    console.log(`[USER ${r.customer_phone} @ ${r.created_at}]: ${r.text}`);
  }

  // 4. Reino Unido / Londres
  const { data: d4 } = await supabaseAdmin
    .from('conversation_history')
    .select('id, org_id, customer_phone, sender, text, created_at')
    .or('text.ilike.%reino unido%,text.ilike.%londres%')
    .eq('sender', 'user');

  console.log(`User messages with reino unido/londres: ${d4?.length || 0}`);
  for (const r of d4 || []) {
    console.log(`[USER ${r.customer_phone} @ ${r.created_at}]: ${r.text}`);
  }
}

searchUserMessages().catch(console.error);
