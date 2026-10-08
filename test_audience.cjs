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

async function testAudience() {
  const orgId = "b4647d91-6352-4947-8988-0df409b245b3";
  const contactMap = new Map();

  const normalizePhone = (p) => {
    if (!p) return '';
    return p.replace(/[^\d]/g, '');
  };

  const addContact = (rawPhone, rawName) => {
    const phone = normalizePhone(rawPhone);
    if (!phone || phone.length < 8) return;
    const existing = contactMap.get(phone);
    const name = (rawName && rawName.trim() !== 'Sem nome') ? rawName.trim() : (existing ? existing.name : 'Cliente');
    contactMap.set(phone, { phone, name });
  };

  // 1. Contacts
  const res1 = await axios.get(`${url}/rest/v1/contacts?select=phone,name&org_id=eq.${orgId}`, { headers });
  (res1.data || []).forEach(c => addContact(c.phone, c.name));

  // 2. Conversation history
  const res2 = await axios.get(`${url}/rest/v1/conversation_history?select=customer_phone&org_id=eq.${orgId}`, { headers });
  (res2.data || []).forEach(c => addContact(c.customer_phone));

  // 3. Followup schedules
  const res3 = await axios.get(`${url}/rest/v1/followup_schedules?select=customer_phone,customer_name&org_id=eq.${orgId}`, { headers });
  (res3.data || []).forEach(c => addContact(c.customer_phone, c.customer_name));

  // 4. Bookings
  const res4 = await axios.get(`${url}/rest/v1/bookings?select=phone,first_name,last_name&org_id=eq.${orgId}`, { headers });
  (res4.data || []).forEach(c => addContact(c.phone, `${c.first_name || ''} ${c.last_name || ''}`));

  const allContacts = Array.from(contactMap.values());
  console.log(`\n✅ TOTAL DE CONTATOS ÚNICOS ENCONTRADOS PARA ORG ${orgId}:`, allContacts.length);
  console.log('Amostra dos primeiros 10 contatos:');
  console.log(JSON.stringify(allContacts.slice(0, 10), null, 2));
}

testAudience();
