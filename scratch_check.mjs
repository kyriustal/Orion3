import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

async function checkFollowups() {
  try {
    console.log('--- ALL ROWS IN FOLLOWUP SCHEDULES ---');
    const { data: schedules } = await supabaseAdmin
      .from('followup_schedules')
      .select('*');
    console.log(JSON.stringify(schedules, null, 2));

    const today = new Date().toISOString().split('T')[0];
    const { data: history } = await supabaseAdmin
      .from('conversation_history')
      .select('customer_phone, sender, text, created_at')
      .gte('created_at', today)
      .order('created_at', { ascending: true });

    console.log(`\n--- MENSAGENS DE HOJE (${today}) ---`);
    console.log(`Total de mensagens hoje: ${history?.length || 0}`);
    history?.forEach(h => {
      console.log(`[${h.created_at}] [${h.customer_phone}] ${h.sender}: ${h.text?.substring(0, 100)}`);
    });
  } catch (e) {
    console.error('Exception:', e);
  }
}

checkFollowups();
