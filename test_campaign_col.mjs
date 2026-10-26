import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkCols() {
  const { data, error } = await supabase.from('campaigns').select('*').limit(1);
  console.log('Campaign sample row keys:', data && data[0] ? Object.keys(data[0]) : data);
  if (error) console.error('Error:', error);

  // Test inserting or updating scheduled_at
  if (data && data[0]) {
    const testUpdate = await supabase.from('campaigns').update({ scheduled_at: null }).eq('id', data[0].id);
    console.log('Test update scheduled_at result:', testUpdate.error ? testUpdate.error.message : 'SUCCESS! Column exists!');
  }
}

checkCols();
