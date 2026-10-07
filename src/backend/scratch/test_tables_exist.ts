import { supabaseAdmin } from '../config/supabase';

async function test() {
  console.log('--- Inspecting bookings columns ---');
  const { data: bData, error: bErr } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .limit(1);
  if (bErr) {
    console.error('Error selecting bookings:', bErr.message);
  } else {
    console.log('Bookings columns:', bData && bData[0] ? Object.keys(bData[0]) : 'no rows, testing appointment_date vs date');
  }

  const { error: colDateErr } = await supabaseAdmin.from('bookings').select('date').limit(1);
  console.log('Column "date" exists?', !colDateErr, colDateErr?.message);
  const { error: colAppDateErr } = await supabaseAdmin.from('bookings').select('appointment_date').limit(1);
  console.log('Column "appointment_date" exists?', !colAppDateErr, colAppDateErr?.message);
  const { error: colStatusErr } = await supabaseAdmin.from('bookings').select('status').limit(1);
  console.log('Column "status" exists?', !colStatusErr, colStatusErr?.message);
  process.exit(0);
}
test();
