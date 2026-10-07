import { supabaseAdmin } from '../config/supabase';

async function searchAll() {
  console.log('--- Searching all messages in conversation_history for England/UK/Visa refusal ---');

  // Let's get all messages from conversation_history that contain 'negad' or 'recus' or 'inglat' or 'reino' or 'carta'
  const { data: msgs, error } = await supabaseAdmin
    .from('conversation_history')
    .select('id, org_id, customer_phone, sender, text, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Total messages in conversation_history: ${msgs?.length || 0}`);

  const matchingPhones = new Set<string>();

  for (const m of msgs || []) {
    const txt = (m.text || '').toLowerCase();
    const hasEngland = txt.includes('inglat') || txt.includes('reino unido') || txt.includes('londres') || txt.includes('uk') || txt.includes('british') || txt.includes('inglês') || txt.includes('ingles');
    const hasRefusal = txt.includes('negad') || txt.includes('recus') || txt.includes('chumb') || txt.includes('rejeit');
    const hasLetter = txt.includes('carta') || txt.includes('chamada') || txt.includes('convite') || txt.includes('patrocin');
    const hasFamily = txt.includes('famíl') || txt.includes('famil') || txt.includes('irmã') || txt.includes('irma') || txt.includes('tio') || txt.includes('tia') || txt.includes('primo') || txt.includes('prima') || txt.includes('pai') || txt.includes('mãe') || txt.includes('mae') || txt.includes('espos') || txt.includes('marid');

    if ((hasEngland && hasRefusal) || (hasEngland && hasLetter) || (hasRefusal && hasLetter) || (hasEngland && hasFamily)) {
      matchingPhones.add(m.customer_phone);
    }
  }

  console.log(`Found ${matchingPhones.size} candidate phones:`, Array.from(matchingPhones));

  for (const phone of matchingPhones) {
    console.log(`\n================ PHONE: ${phone} ================`);
    const userMsgs = (msgs || []).filter(m => m.customer_phone === phone);
    // Find contact info
    const { data: contact } = await supabaseAdmin
      .from('contacts')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();

    console.log(`Contact: ${contact?.name || 'Unknown'} (Email: ${contact?.email || 'N/A'}, Notes: ${contact?.notes || 'N/A'})`);
    
    // Print all messages for this phone chronologically
    const sorted = [...userMsgs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    for (const sm of sorted) {
      if (sm.sender === 'user' || (sm.text && (sm.text.toLowerCase().includes('inglat') || sm.text.toLowerCase().includes('negad') || sm.text.toLowerCase().includes('recus') || sm.text.toLowerCase().includes('carta')))) {
        console.log(`  [${sm.created_at}] [${sm.sender}]: ${sm.text}`);
      }
    }
  }
}

searchAll().catch(console.error);
