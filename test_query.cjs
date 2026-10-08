process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const url = process.env.SUPABASE_URL || 'https://iinubqqhkmopwyndjbja.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const headers = {
  'apikey': key,
  'Authorization': `Bearer ${key}`
};

async function queryTable(tableName) {
  try {
    const res = await axios.get(`${url}/rest/v1/${tableName}?select=*`, { headers });
    console.log(`\n=== TABELA: ${tableName} (${res.data.length} registros) ===`);
    if (res.data.length > 0) {
      console.log(JSON.stringify(res.data.slice(0, 5), null, 2));
    }
    return res.data;
  } catch (err) {
    console.error(`Erro ao consultar ${tableName}:`, err.response?.data || err.message);
    return [];
  }
}

async function run() {
  await queryTable('contacts');
  await queryTable('conversation_history');
  await queryTable('followup_schedules');
  await queryTable('bookings');
  await queryTable('campaigns');
  await queryTable('campaign_logs');
}

run();
