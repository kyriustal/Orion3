import { supabaseAdmin } from '../config/supabase';

async function inspectSchema() {
  // Query 1 row from messages
  const { data: msgSample, error: msgErr } = await supabaseAdmin
    .from('messages')
    .select('*')
    .limit(1);

  if (msgErr) {
    console.error('Error fetching message sample:', msgErr);
  } else {
    console.log('Messages columns:', Object.keys(msgSample?.[0] || {}));
    console.log('Sample message:', msgSample?.[0]);
  }

  // Let's check chats / tickets / appointments / interactions
  const tables = ['chat_messages', 'chats', 'interactions', 'leads', 'customers', 'appointments', 'bookings', 'followup_schedules'];
  for (const t of tables) {
    const { data, error } = await supabaseAdmin.from(t).select('*').limit(1);
    if (!error) {
      console.log(`Table '${t}' exists! Columns:`, Object.keys(data?.[0] || {}));
    }
  }
}

inspectSchema().catch(console.error);
