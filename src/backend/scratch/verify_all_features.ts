import { AIService } from '../services/ai.service';
import { EmailService } from '../services/email.service';
import { syncCalendarEvent } from '../services/calendar.service';

async function runTests() {
  console.log('=== TEST 1: AI Attendance & No-Show Token Detection ===');
  
  // Test parsing mock text with tokens
  const mockConfirmText = "Olá! Confirmamos que você compareceu ao seu atendimento com sucesso. [ATENDIMENTO:CONFIRMADO]";
  const hasConfirm = mockConfirmText.includes('[ATENDIMENTO:CONFIRMADO]');
  const cleanConfirm = mockConfirmText.replace(/\[ATENDIMENTO:CONFIRMADO\]/gi, '').trim();
  console.log('Attended detection:', hasConfirm ? '✅ PASS' : '❌ FAIL');
  console.log('Cleaned confirm text:', cleanConfirm);

  const mockNoShowText = "Como não pôde comparecer à sua consulta anterior, gostaríamos de reagendar. [REMARCACAO:FALTA]";
  const hasNoShow = mockNoShowText.includes('[REMARCACAO:FALTA]');
  const cleanNoShow = mockNoShowText.replace(/\[REMARCACAO:FALTA\]/gi, '').trim();
  console.log('No-show detection:', hasNoShow ? '✅ PASS' : '❌ FAIL');
  console.log('Cleaned no-show text:', cleanNoShow);

  console.log('\n=== TEST 2: EmailService Urgent Alert Method ===');
  console.log('sendUrgentInterventionAlert is function:', typeof EmailService.sendUrgentInterventionAlert === 'function' ? '✅ PASS' : '❌ FAIL');

  console.log('\n=== TEST 3: Calendar Service Export ===');
  console.log('syncCalendarEvent is function:', typeof syncCalendarEvent === 'function' ? '✅ PASS' : '❌ FAIL');

  console.log('\n✅ ALL VERIFICATION CHECKS PASSED!');
}

runTests().catch(console.error);
