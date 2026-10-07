import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });
const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

async function searchMedia() {
  console.log('Searching media / audio / image / document messages...');
  
  // Audio messages
  const { data: audios } = await sb
    .from('conversation_history')
    .select('customer_phone, sender, text, created_at')
    .ilike('text', '%[Mensagem de Áudio]%');

  console.log(`Audio messages: ${audios?.length || 0}`);
  for (const a of audios || []) {
    const t = a.text.toLowerCase();
    if (t.includes('inglat') || t.includes('reino') || t.includes('visto') || t.includes('recus') || t.includes('negad') || t.includes('chamad') || t.includes('londres') || t.includes('famil')) {
      console.log(`\nAUDIO MATCH [${a.customer_phone}]: ${a.text}`);
    }
  }

  // Image messages
  const { data: images } = await sb
    .from('conversation_history')
    .select('customer_phone, sender, text, created_at')
    .ilike('text', '%[Imagem%');

  console.log(`Image messages: ${images?.length || 0}`);
  for (const img of images || []) {
    const t = img.text.toLowerCase();
    if (t.includes('inglat') || t.includes('reino') || t.includes('refus') || t.includes('negad') || t.includes('recus') || t.includes('chamad') || t.includes('londres') || t.includes('famil')) {
      console.log(`\nIMAGE MATCH [${img.customer_phone}]: ${img.text.substring(0, 300)}`);
    }
  }

  // Document messages
  const { data: docs } = await sb
    .from('conversation_history')
    .select('customer_phone, sender, text, created_at')
    .ilike('text', '%[Documento%');

  console.log(`Document messages: ${docs?.length || 0}`);
  for (const doc of docs || []) {
    const t = doc.text.toLowerCase();
    if (t.includes('inglat') || t.includes('reino') || t.includes('refus') || t.includes('negad') || t.includes('recus') || t.includes('chamad') || t.includes('londres') || t.includes('famil')) {
      console.log(`\nDOCUMENT MATCH [${doc.customer_phone}]: ${doc.text.substring(0, 300)}`);
    }
  }
}

searchMedia().catch(console.error);
