import { supabaseAdmin } from '../config/supabase.js';

async function test() {
  try {
    const { data, error } = await supabaseAdmin.rpc('get_tables_list'); // checking if an RPC is defined
    
    // Fallback: Query pg_class or just information_schema.tables using a raw SQL if RPC not available.
    // Wait, in Supabase, we can't run arbitrary SQL unless we use a defined RPC function.
    // Let's check if we can run a simple RPC or query pg_class. Since pg_class isn't exposed as a table, it might fail.
    // But let's check what other tables are commonly there. Let's try doing a select on common names like:
    // 'contacts', 'leads', 'customers', 'opportunities'
    const candidates = ['contacts', 'leads', 'customers', 'clients', 'appointments', 'bookings'];
    for (const c of candidates) {
      const { data, error } = await supabaseAdmin.from(c).select('*').limit(1);
      if (error) {
        console.log(`Table "${c}": not found or error (${error.message})`);
      } else {
        console.log(`Table "${c}": EXISTS! Columns:`, data.length > 0 ? Object.keys(data[0]) : 'empty');
      }
    }
  } catch (err) {
    console.error('Script error:', err);
  }
}

test();
