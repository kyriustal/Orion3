import { supabaseAdmin } from '../config/supabase';

async function searchClient() {
  console.log('Searching for client...');
  
  // 1. Check messages table
  try {
    const { data: messages, error: msgError } = await supabaseAdmin
      .from('messages')
      .select('*')
      .or('text.ilike.%inglaterra%,text.ilike.%visto%,text.ilike.%carta de chamada%,text.ilike.%reino unido%,text.ilike.%negado%,text.ilike.%recusado%')
      .limit(50);

    if (msgError) {
      console.log('Error querying messages:', msgError.message);
    } else {
      console.log(`Found ${messages?.length || 0} matching messages:`);
      for (const m of messages || []) {
        console.log(`[Msg] ID: ${m.id}, ConvID: ${m.conversation_id}, Sender: ${m.sender || m.sender_type || m.from}, Text: ${m.text || m.content}`);
      }
    }
  } catch (e: any) {
    console.log('Messages query failed:', e.message);
  }

  // 2. Check contacts table
  try {
    const { data: contacts, error: contactError } = await supabaseAdmin
      .from('contacts')
      .select('*')
      .limit(50);

    if (contactError) {
      console.log('Error querying contacts:', contactError.message);
    } else {
      console.log(`Total contacts: ${contacts?.length || 0}`);
      for (const c of contacts || []) {
        console.log(`[Contact] ${c.id}: ${c.name} (${c.phone || c.email}) - notes: ${c.notes || c.observation || ''}`);
      }
    }
  } catch (e: any) {
    console.log('Contacts query failed:', e.message);
  }

  // 3. Check conversations table
  try {
    const { data: convs, error: convError } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .limit(50);

    if (convError) {
      console.log('Error querying conversations:', convError.message);
    } else {
      console.log(`Total conversations: ${convs?.length || 0}`);
      for (const c of convs || []) {
        console.log(`[Conv] ID: ${c.id}, Customer: ${c.customer_name || c.contact_name || c.phone || c.id}, Channel: ${c.channel}`);
      }
    }
  } catch (e: any) {
    console.log('Conversations query failed:', e.message);
  }
}

searchClient().catch(console.error);
