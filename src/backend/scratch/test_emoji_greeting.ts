import { FOLLOWUP_MESSAGES, cleanGreetingName, formatGreeting, inferServiceAndBenefit } from '../services/followup.service';

console.log('=== TESTE DE NOME COM EMOJI/BANDEIRA ===');
console.log('cleanGreetingName("🇦🇴"):', JSON.stringify(cleanGreetingName('🇦🇴')));
console.log('cleanGreetingName("🇦🇴 João"):', JSON.stringify(cleanGreetingName('🇦🇴 João')));
console.log('formatGreeting("🇦🇴"):', JSON.stringify(formatGreeting('🇦🇴')));

console.log('\n=== TESTE STEP 3 COM BANDEIRA ===');
console.log('Step 3 (Doc):', FOLLOWUP_MESSAGES.step3('🇦🇴', 1, { service: 'pedido de visto' }));
