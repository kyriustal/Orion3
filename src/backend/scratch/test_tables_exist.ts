import { supabaseAdmin } from '../config/supabase';

async function test() {
  console.log('--- Inspecting followup_schedules columns ---');
  // Attempt to select specific columns to check if they exist
  const { data, error } = await supabaseAdmin
    .from('followup_schedules')
    .select('id, followup_step, context_snapshot, customer_name')
    .limit(1);

  if (error) {
    console.error('Error selecting followup columns:', error.message);
  } else {
    console.log('Columns followup_step, context_snapshot, customer_name EXIST in followup_schedules! Data:', data);
  }
}
test();
