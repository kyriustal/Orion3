import { supabaseAdmin } from '../config/supabase';

async function checkPhoneMessages() {
  const phone = '244936755882';
  
  const { data: contact } = await supabaseAdmin
    .from('contacts')
    .select('*')
    .eq('phone', phone)
    .single();

  console.log('Contact info:', contact);

  const { data: messages } = await supabaseAdmin
    .from('conversation_history')
    .select('*')
    .eq('customer_phone', phone)
    .order('created_at', { ascending: true });

  console.log(`Total messages for ${phone}: ${messages?.length || 0}`);
  for (const m of messages || []) {
    console.log(`[${m.created_at}] [${m.sender}]: ${m.text}`);
  }
}

checkPhoneMessages().catch(console.error);
