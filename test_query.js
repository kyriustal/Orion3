const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log('--- TESTANDO QUERY DE CONTATOS NA BASE DE DADOS ---');
  
  const { data: contacts, error: err1 } = await supabase.from('contacts').select('*');
  console.log('1. Tabela contacts:', contacts ? contacts.length : 0, 'registros', err1 ? err1.message : '');
  if (contacts && contacts.length > 0) {
    console.log('Amostra de contacts:', contacts.slice(0, 5));
  }

  const { data: history, error: err2 } = await supabase.from('conversation_history').select('customer_phone, customer_name, org_id');
  console.log('\n2. Tabela conversation_history:', history ? history.length : 0, 'registros', err2 ? err2.message : '');
  if (history && history.length > 0) {
    console.log('Amostra de conversation_history:', history.slice(0, 5));
  }

  const { data: followups, error: err3 } = await supabase.from('followup_schedules').select('customer_phone, customer_name, org_id');
  console.log('\n3. Tabela followup_schedules:', followups ? followups.length : 0, 'registros', err3 ? err3.message : '');
  if (followups && followups.length > 0) {
    console.log('Amostra de followup_schedules:', followups.slice(0, 5));
  }

  const { data: bookings, error: err4 } = await supabase.from('bookings').select('phone, first_name, org_id');
  console.log('\n4. Tabela bookings:', bookings ? bookings.length : 0, 'registros', err4 ? err4.message : '');
  if (bookings && bookings.length > 0) {
    console.log('Amostra de bookings:', bookings.slice(0, 5));
  }
}

test();
