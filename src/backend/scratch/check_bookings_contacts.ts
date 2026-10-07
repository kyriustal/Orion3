import { supabaseAdmin } from '../config/supabase';

async function checkBookingsAndOtherTables() {
  console.log('=== Checking bookings table ===');
  const { data: bookings, error: bErr } = await supabaseAdmin
    .from('bookings')
    .select('*');

  console.log(`Total bookings: ${bookings?.length || 0}`);
  for (const b of bookings || []) {
    console.log(`Booking: [${b.first_name} ${b.last_name}] Phone: ${b.phone} Service: ${b.service} Date: ${b.appointment_date} Status: ${b.status}`);
  }

  console.log('\n=== Checking contacts with notes or specific fields ===');
  const { data: contacts } = await supabaseAdmin
    .from('contacts')
    .select('*');

  for (const c of contacts || []) {
    if (c.notes || c.tags || c.custom_fields) {
      console.log(`Contact: ${c.name} (${c.phone}): notes=${c.notes}, tags=${JSON.stringify(c.tags)}`);
    }
  }

  console.log('\n=== Checking audio transcription or document text in messages ===');
  // Check if any message text has "recusa" or "negad" or "famíl" anywhere
  const { data: recusaMsgs } = await supabaseAdmin
    .from('conversation_history')
    .select('id, customer_phone, sender, text, created_at')
    .or('text.ilike.%recusa%,text.ilike.%visto negado%,text.ilike.%negado%');

  console.log(`Messages with recusa/negado: ${recusaMsgs?.length || 0}`);
  for (const rm of recusaMsgs || []) {
    console.log(`[${rm.sender}] [${rm.customer_phone}]: ${rm.text?.substring(0, 200)}`);
  }
}

checkBookingsAndOtherTables().catch(console.error);
