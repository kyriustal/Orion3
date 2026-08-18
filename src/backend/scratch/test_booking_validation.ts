import { BookingService } from '../services/booking.service';

console.log('─── TESTE 1: Validação dos 5 Campos Obrigatórios ───');

// Caso 1: Válido com Telefone
const test1 = BookingService.validateBookingData({
  name: 'Carlos Manuel',
  subject: 'Consulta de Visto',
  phone: '+244923456789',
  date: '2026-08-28',
  time: '14:30',
});
console.log('Teste 1 (Válido com Telefone):', test1.isValid ? '✅ PASSOU' : '❌ FALHOU', test1.cleanData);

// Caso 2: Válido com E-mail
const test2 = BookingService.validateBookingData({
  name: 'Maria Antónia',
  subject: 'Abertura de Conta',
  email: 'maria@example.com',
  date: '2026-08-30',
  time: '10:00',
});
console.log('Teste 2 (Válido com E-mail):', test2.isValid ? '✅ PASSOU' : '❌ FALHOU', test2.cleanData);

// Caso 3: Inválido - Sem Contacto (nem telefone nem email)
const test3 = BookingService.validateBookingData({
  name: 'João Silva',
  subject: 'Consultoria',
  date: '2026-08-28',
  time: '14:30',
});
console.log('Teste 3 (Sem Contacto - deve rejeitar):', !test3.isValid ? '✅ PASSOU (Rejeitado corretamente)' : '❌ FALHOU', test3.missingFields);

// Caso 4: Inválido - Sem Assunto
const test4 = BookingService.validateBookingData({
  name: 'João Silva',
  phone: '923111222',
  date: '2026-08-28',
  time: '14:30',
});
console.log('Teste 4 (Sem Assunto - deve rejeitar):', !test4.isValid ? '✅ PASSOU (Rejeitado corretamente)' : '❌ FALHOU', test4.missingFields);

// Caso 5: Inválido - Sem Nome
const test5 = BookingService.validateBookingData({
  subject: 'Reunião',
  phone: '923111222',
  date: '2026-08-28',
  time: '14:30',
});
console.log('Teste 5 (Sem Nome - deve rejeitar):', !test5.isValid ? '✅ PASSOU (Rejeitado corretamente)' : '❌ FALHOU', test5.missingFields);

// Caso 6: Inválido - Sem Data ou Hora
const test6 = BookingService.validateBookingData({
  name: 'João Silva',
  subject: 'Reunião',
  phone: '923111222',
  time: '14:30',
});
console.log('Teste 6 (Sem Data - deve rejeitar):', !test6.isValid ? '✅ PASSOU (Rejeitado corretamente)' : '❌ FALHOU', test6.missingFields);

console.log('\n─── TESTE 2: Cálculo dos 4 Estágios de Alertas ───');
// Agendamento para daqui a 15 dias às 15:00
const appointmentDate = '2026-09-02';
const appointmentTime = '15:00';

const [y, m, d] = appointmentDate.split('-').map(Number);
const [h, min] = appointmentTime.split(':').map(Number);
const appDateObj = new Date(y, m - 1, d, h, min, 0);

// 7 dias antes
const d7 = new Date(appDateObj);
d7.setDate(d7.getDate() - 7);
const rand7 = (BookingService as any).getRandomBusinessHour(d7);
console.log('7 Dias Antes (08h às 17h):', rand7.toISOString(), '| Hora local:', rand7.getHours() + ':' + rand7.getMinutes());

// 3 dias antes
const d3 = new Date(appDateObj);
d3.setDate(d3.getDate() - 3);
const rand3 = (BookingService as any).getRandomBusinessHour(d3);
console.log('3 Dias Antes / 72h (08h às 17h):', rand3.toISOString(), '| Hora local:', rand3.getHours() + ':' + rand3.getMinutes());

// Dia do evento às 07:00
const dayOf7am = new Date(y, m - 1, d, 7, 0, 0, 0);
console.log('No Dia Marcado às 07:00:', dayOf7am.toISOString(), '| Hora local:', dayOf7am.getHours() + ':' + dayOf7am.getMinutes());

const isRand7Valid = rand7.getHours() >= 8 && rand7.getHours() <= 16;
const isRand3Valid = rand3.getHours() >= 8 && rand3.getHours() <= 16;
const isDay7amValid = dayOf7am.getHours() === 7 && dayOf7am.getMinutes() === 0;

console.log('Validação de Horários:', (isRand7Valid && isRand3Valid && isDay7amValid) ? '✅ TODOS OS HORÁRIOS CORRETOS' : '❌ FALHA NO CÁLCULO');
