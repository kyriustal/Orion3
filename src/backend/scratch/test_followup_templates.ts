import { FOLLOWUP_MESSAGES, detectScenario } from '../services/followup.service';

console.log('=== TESTE DE TEMPLATES ON VISA ===');
console.log('Step 1:', FOLLOWUP_MESSAGES.step1('Maria'));
console.log('Step 2 (Doc):', FOLLOWUP_MESSAGES.step2('Maria', 1));
console.log('Step 2 (Valores):', FOLLOWUP_MESSAGES.step2('Maria', 2));
console.log('Step 2 (Agendamento):', FOLLOWUP_MESSAGES.step2('Maria', 3));
console.log('Step 2 (Geral):', FOLLOWUP_MESSAGES.step2('Maria', 4));
console.log('Step 3:', FOLLOWUP_MESSAGES.step3('Maria', 1));
console.log('Step 4:', FOLLOWUP_MESSAGES.step4('Maria', 1));
console.log('Step 5:', FOLLOWUP_MESSAGES.step5('Maria'));

console.log('\n=== TESTE DETECÇÃO DE CENÁRIOS ===');
console.log('Cenário Doc:', detectScenario([{ sender: 'user', text: 'Vou enviar o meu passaporte e registo criminal' }]));
console.log('Cenário Preço:', detectScenario([{ sender: 'user', text: 'Quanto custa a assessoria na modalidade pós-paga?' }]));
console.log('Cenário Agendamento:', detectScenario([{ sender: 'user', text: 'Quero marcar consultoria no vosso escritório' }]));
console.log('Cenário Geral:', detectScenario([{ sender: 'user', text: 'Olá bom dia' }]));
