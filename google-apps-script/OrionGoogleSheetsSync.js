/**
 * ==============================================================================
 * ORION 2.0 - GOOGLE APPS SCRIPT DE SINCRONIZAÇÃO & RELATÓRIOS DIÁRIOS
 * ==============================================================================
 * 
 * Funcionalidades:
 * 1. Estrutura organizada com 3 abas formatadas:
 *    - "💬 Mensagens & Leads"  : Registo de mensagens de WhatsApp, Facebook e Instagram.
 *    - "📅 Agendamentos"       : Registo detalhado de agendamentos (Nome, Assunto, Telefone, Email, Data, Hora).
 *    - "🎯 Disparos WhatsApp"  : Base consolidada de números WhatsApp higienizados (E.164) para transmissões.
 * 
 * 2. doPost(e): Webhook para receber dados em tempo real da plataforma Orion.
 * 3. doGet(e) : API para filtragem e extração automática de números (24H, Semana, Mês, Sempre).
 * 4. Relatório Diário Automático (23:59 - Horário de Angola / WAT):
 *    - Agrupamento completo dos dados recolhidos nas últimas 24 horas.
 *    - Geração de relatório executivo em formato PDF.
 *    - Envio automático por email para a empresa e equipas com os números prontos para disparo.
 * 
 * 5. Menu personalizado no Google Sheets para controlo manual e testes com 1 clique.
 * ==============================================================================
 */

// ─── CONFIGURAÇÕES GLOBAIS ───────────────────────────────────────────────────
var CONFIG = {
  TIMEZONE: 'Africa/Luanda', // Fuso horário de Angola (WAT / UTC+1)
  COMPANY_NAME: 'Orion Platform',
  // Se desejar fixar emails de destino no script, insira abaixo separados por vírgula.
  // Caso deixe vazio, o script utilizará o email do proprietário da folha e os emails enviados no payload.
  REPORT_EMAILS: '', 
  SHEET_NAMES: {
    MESSAGES: '💬 Mensagens & Leads',
    BOOKINGS: '📅 Agendamentos',
    BROADCAST: '🎯 Disparos WhatsApp'
  }
};

/**
 * Menu Superior Automático ao abrir a Planilha
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('⚡ Orion 2.0')
    .addItem('🚀 1. Inicializar / Formatar Planilhas', 'setupSpreadsheet')
    .addItem('⏰ 2. Configurar Gatilho Diário (23:59 WAT)', 'createDailyReportTrigger')
    .addItem('📊 3. Gerar e Enviar Relatório Diário Agora (com PDF)', 'generateAndSendDailyReportNow')
    .addItem('🎯 4. Filtrar e Extrair Números para Disparos', 'showBroadcastExtractModal')
    .addSeparator()
    .addItem('ℹ️ Obter URL do Webhook para o Orion', 'showWebhookUrl')
    .addToUi();
}

/**
 * 1. Inicializa e formata profissionalmente as 3 abas da folha de cálculo.
 */
function setupSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Aba Mensagens & Leads
  var sheetMsgs = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.MESSAGES);
  var headersMsgs = [
    'Data/Hora (WAT)', 
    'Canal', 
    'Número / Identificador', 
    'Nome do Cliente', 
    'Email', 
    'Assunto / Mensagem', 
    'Total Interações', 
    'Status'
  ];
  setupHeaderRow(sheetMsgs, headersMsgs, '#0f766e'); // Emerald Dark

  // 2. Aba Agendamentos
  var sheetBookings = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.BOOKINGS);
  var headersBookings = [
    'Data Agendada', 
    'Hora', 
    'Nome Completo', 
    'Número de Telefone', 
    'E-mail', 
    'Assunto / Serviço', 
    'Canal Origem', 
    'Registado Em (WAT)', 
    'Status'
  ];
  setupHeaderRow(sheetBookings, headersBookings, '#1d4ed8'); // Blue Dark

  // 3. Aba Disparos WhatsApp
  var sheetBroadcast = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.BROADCAST);
  var headersBroadcast = [
    'Número WhatsApp (E.164 Limpo)', 
    'Nome', 
    'Canal Origem', 
    'Email', 
    'Assunto / Interesse', 
    'Última Interação (WAT)', 
    'Status Lead', 
    'Data ISO'
  ];
  setupHeaderRow(sheetBroadcast, headersBroadcast, '#047857'); // Green Dark

  SpreadsheetApp.getUi().alert(
    '✅ Estrutura Orion Inicializada com Sucesso!\n\n' +
    'As 3 abas organizadas foram configuradas:\n' +
    '1. ' + CONFIG.SHEET_NAMES.MESSAGES + '\n' +
    '2. ' + CONFIG.SHEET_NAMES.BOOKINGS + '\n' +
    '3. ' + CONFIG.SHEET_NAMES.BROADCAST + '\n\n' +
    'Pronto para receber dados do WhatsApp, Facebook e Instagram!'
  );
}

/**
 * Utilitário: Cria ou retorna aba existente
 */
function getOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

/**
 * Utilitário: Estiliza o cabeçalho de uma aba
 */
function setupHeaderRow(sheet, headers, bgHex) {
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground(bgHex)
             .setFontColor('#ffffff')
             .setFontWeight('bold')
             .setFontFamily('Arial')
             .setFontSize(10)
             .setHorizontalAlignment('center')
             .setVerticalAlignment('middle')
             .setWrap(true);
  sheet.setRowHeight(1, 35);
  sheet.setFrozenRows(1);
  for (var i = 1; i <= headers.length; i++) {
    sheet.autoResizeColumn(i);
  }
}

/**
 * Higieniza números de telefone para o padrão internacional de disparo WhatsApp (apenas dígitos).
 */
function sanitizePhoneNumber(phone) {
  if (!phone) return '';
  var cleaned = String(phone).replace(/\D/g, '');
  // Se começar com 00, substituir por vazio
  if (cleaned.indexOf('00') === 0) cleaned = cleaned.substring(2);
  // Se for número de Angola de 9 dígitos começando com 9, adicionar código 244
  if (cleaned.length === 9 && cleaned.charAt(0) === '9') {
    cleaned = '244' + cleaned;
  }
  return cleaned;
}

/**
 * Formata data/hora para fuso horário de Angola (WAT / UTC+1)
 */
function formatWAT(date) {
  var d = date ? new Date(date) : new Date();
  return Utilities.formatDate(d, CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
}

/**
 * ==============================================================================
 * ENDPOINT WEBHOOK: doPost(e)
 * Recebe mensagens, contactos e agendamentos do Orion
 * ==============================================================================
 */
function doPost(e) {
  try {
    var raw = e.postData ? e.postData.contents : '';
    if (!raw) {
      return jsonResponse({ success: false, error: 'Corpo da requisição vazio' });
    }

    var data = JSON.parse(raw);
    var type = data.type || 'message'; // 'message' | 'booking' | 'contact' | 'batch_sync'
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (type === 'message' || type === 'contact') {
      handleIncomingMessage(ss, data);
    } else if (type === 'booking') {
      handleIncomingBooking(ss, data);
    } else if (type === 'batch_sync') {
      handleBatchSync(ss, data);
    }

    return jsonResponse({ success: true, message: 'Dados gravados com sucesso!', timestamp: new Date().toISOString() });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * Grava mensagem ou contacto nas abas "Mensagens & Leads" e "Disparos WhatsApp"
 */
function handleIncomingMessage(ss, data) {
  var sheetMsgs = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.MESSAGES);
  var sheetBroadcast = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.BROADCAST);

  var nowWat = formatWAT(new Date());
  var channel = (data.channel || 'whatsapp').toUpperCase();
  var rawPhone = data.phone || data.customer_phone || data.senderId || '';
  var cleanPhone = sanitizePhoneNumber(rawPhone);
  var identifier = cleanPhone || rawPhone || 'N/A';
  var name = data.name || data.customer_name || 'Desconhecido';
  var email = data.email || '';
  var subjectOrText = (data.text || data.message || data.subject || '').substring(0, 500);
  var status = data.status || 'Ativo';

  // 1. Inserir em Mensagens & Leads
  sheetMsgs.appendRow([
    nowWat,
    channel,
    identifier,
    name,
    email,
    subjectOrText,
    1,
    status
  ]);

  // 2. Se tiver número de telefone ou canal for WhatsApp, consolidar na aba Disparos WhatsApp
  if (cleanPhone || channel === 'WHATSAPP') {
    upsertBroadcastContact(sheetBroadcast, {
      phone: cleanPhone,
      name: name,
      channel: channel,
      email: email,
      subject: subjectOrText,
      nowWat: nowWat,
      isoDate: new Date().toISOString(),
      status: 'Apto para Disparo'
    });
  }
}

/**
 * Grava agendamento na aba "Agendamentos" e atualiza a aba "Disparos WhatsApp"
 */
function handleIncomingBooking(ss, data) {
  var sheetBookings = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.BOOKINGS);
  var sheetBroadcast = getOrCreateSheet(ss, CONFIG.SHEET_NAMES.BROADCAST);

  var nowWat = formatWAT(new Date());
  var appointmentDate = data.date || data.appointment_date || '';
  var appointmentTime = data.time || data.appointment_time || '';
  var name = data.name || data.customer_name || 'Cliente';
  var phone = data.phone || data.customer_phone || '';
  var cleanPhone = sanitizePhoneNumber(phone);
  var email = data.email || data.customer_email || '';
  var subject = data.subject || data.service || 'Agendamento';
  var channel = (data.channel || 'whatsapp').toUpperCase();
  var status = data.status || 'Confirmado';

  sheetBookings.appendRow([
    appointmentDate,
    appointmentTime,
    name,
    phone,
    email,
    subject,
    channel,
    nowWat,
    status
  ]);

  if (cleanPhone) {
    upsertBroadcastContact(sheetBroadcast, {
      phone: cleanPhone,
      name: name,
      channel: channel,
      email: email,
      subject: 'Agendamento: ' + subject,
      nowWat: nowWat,
      isoDate: new Date().toISOString(),
      status: 'Cliente Agendado'
    });
  }
}

/**
 * Sincronização em massa (Batch Sync)
 */
function handleBatchSync(ss, data) {
  if (data.contacts && data.contacts.length) {
    for (var i = 0; i < data.contacts.length; i++) {
      handleIncomingMessage(ss, data.contacts[i]);
    }
  }
  if (data.bookings && data.bookings.length) {
    for (var j = 0; j < data.bookings.length; j++) {
      handleIncomingBooking(ss, data.bookings[j]);
    }
  }
}

/**
 * Atualiza ou insere contacto único na aba Disparos WhatsApp (sem duplicar número)
 */
function upsertBroadcastContact(sheet, contact) {
  var data = sheet.getDataRange().getValues();
  var targetPhone = contact.phone;
  if (!targetPhone) return;

  var rowIndex = -1;
  for (var r = 1; r < data.length; r++) {
    var rowPhone = sanitizePhoneNumber(data[r][0]);
    if (rowPhone === targetPhone) {
      rowIndex = r + 1; // 1-indexed
      break;
    }
  }

  if (rowIndex > 0) {
    // Atualizar dados existentes
    if (contact.name && contact.name !== 'Desconhecido') {
      sheet.getRange(rowIndex, 2).setValue(contact.name);
    }
    if (contact.email) {
      sheet.getRange(rowIndex, 4).setValue(contact.email);
    }
    if (contact.subject) {
      sheet.getRange(rowIndex, 5).setValue(contact.subject);
    }
    sheet.getRange(rowIndex, 6).setValue(contact.nowWat); // Última interação
    sheet.getRange(rowIndex, 7).setValue(contact.status || 'Apto para Disparo');
    sheet.getRange(rowIndex, 8).setValue(contact.isoDate);
  } else {
    // Novo contacto
    sheet.appendRow([
      targetPhone,
      contact.name,
      contact.channel,
      contact.email,
      contact.subject,
      contact.nowWat,
      contact.status || 'Apto para Disparo',
      contact.isoDate
    ]);
  }
}

/**
 * ==============================================================================
 * ENDPOINT GET: doGet(e)
 * Permite filtrar números para disparos e ler dados pela API
 * ==============================================================================
 */
function doGet(e) {
  try {
    var params = e.parameter || {};
    var action = params.action || 'filter_numbers';
    var period = params.period || '24h'; // '24h' | 'week' | 'month' | 'year' | 'all'
    var channel = (params.channel || 'all').toLowerCase(); // 'whatsapp' | 'facebook' | 'instagram' | 'all'

    if (action === 'filter_numbers') {
      var result = extractBroadcastNumbers(period, channel);
      return jsonResponse({
        success: true,
        period: period,
        channel: channel,
        total: result.numbers.length,
        numbers: result.numbers,
        contacts: result.contacts,
        numbersCommaSeparated: result.numbers.join(', ')
      });
    }

    if (action === 'health') {
      return jsonResponse({
        status: 'online',
        service: 'Orion Google Sheets Sync',
        timezone: CONFIG.TIMEZONE,
        timeWat: formatWAT(new Date())
      });
    }

    return jsonResponse({ success: false, error: 'Ação não reconhecida: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * Extrai números higienizados filtrados por período e canal
 */
function extractBroadcastNumbers(period, channelFilter) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.BROADCAST);
  if (!sheet) return { numbers: [], contacts: [] };

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { numbers: [], contacts: [] };

  var now = new Date().getTime();
  var cutoff = 0;

  if (period === '24h') {
    cutoff = now - (24 * 60 * 60 * 1000);
  } else if (period === 'week') {
    cutoff = now - (7 * 24 * 60 * 60 * 1000);
  } else if (period === 'month') {
    cutoff = now - (30 * 24 * 60 * 60 * 1000);
  } else if (period === 'year') {
    cutoff = now - (365 * 24 * 60 * 60 * 1000);
  } else {
    cutoff = 0; // 'all' / 'sempre'
  }

  var filteredNumbers = [];
  var filteredContacts = [];
  var seenNumbers = {};

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var phone = sanitizePhoneNumber(row[0]);
    var name = row[1] || 'Contacto';
    var channel = String(row[2] || '').toLowerCase();
    var email = row[3] || '';
    var subject = row[4] || '';
    var dateWat = row[5] || '';
    var isoStr = row[7] || '';

    // Filtrar canal
    if (channelFilter !== 'all' && channel !== channelFilter) {
      continue;
    }

    // Filtrar período se houver data ISO
    if (cutoff > 0 && isoStr) {
      var itemTime = new Date(isoStr).getTime();
      if (!isNaN(itemTime) && itemTime < cutoff) {
        continue;
      }
    }

    if (phone && !seenNumbers[phone]) {
      seenNumbers[phone] = true;
      filteredNumbers.push(phone);
      filteredContacts.push({
        phone: phone,
        name: name,
        channel: channel.toUpperCase(),
        email: email,
        subject: subject,
        lastInteractionWat: dateWat
      });
    }
  }

  return { numbers: filteredNumbers, contacts: filteredContacts };
}

/**
 * ==============================================================================
 * GATILHO AUTOMÁTICO DAS 23:59 (WAT / HORÁRIO DE ANGOLA)
 * ==============================================================================
 */
function createDailyReportTrigger() {
  // Remover gatilhos antigos para não duplicar
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'dailyReportTriggerWAT') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // Criar gatilho diário programado para as 23 horas (janela entre 23:00 e 23:59 WAT)
  ScriptApp.newTrigger('dailyReportTriggerWAT')
    .timeBased()
    .atHour(23)
    .everyDays(1)
    .inTimezone(CONFIG.TIMEZONE)
    .create();

  SpreadsheetApp.getUi().alert(
    '⏰ Gatilho Diário Configurado!\n\n' +
    'O relatório diário com dados recolhidos das últimas 24H será gerado automaticamente todos os dias às 23:59 (Horário de Angola / WAT).\n' +
    'O relatório executivo em PDF será enviado diretamente para os emails cadastrados.'
  );
}

/**
 * Função executada automaticamente pelo gatilho diário às 23:59 WAT
 */
function dailyReportTriggerWAT() {
  generateAndSendDailyReport('24h');
}

/**
 * Disparo manual do relatório diário pelo menu
 */
function generateAndSendDailyReportNow() {
  var result = generateAndSendDailyReport('24h');
  if (result.success) {
    SpreadsheetApp.getUi().alert(
      '✅ Relatório Diário Enviado com Sucesso!\n\n' +
      'Destinatários: ' + result.recipients + '\n' +
      'Números WhatsApp Extraídos: ' + result.whatsappNumbersCount + '\n' +
      'Agendamentos: ' + result.bookingsCount + '\n\n' +
      'O documento PDF executivo foi anexado ao e-mail.'
    );
  } else {
    SpreadsheetApp.getUi().alert('❌ Erro ao enviar relatório: ' + result.error);
  }
}

/**
 * Gera os dados, monta o HTML, converte em PDF e envia aos e-mails.
 */
function generateAndSendDailyReport(period) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var periodLabel = period === '24h' ? 'Últimas 24 Horas' : (period === 'week' ? 'Última Semana' : 'Último Mês');
    var nowWat = formatWAT(new Date());

    // 1. Extrair estatísticas das abas
    var msgsSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.MESSAGES);
    var bookingsSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.BOOKINGS);
    var broadcastSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.BROADCAST);

    var msgsData = msgsSheet ? msgsSheet.getDataRange().getValues() : [];
    var bookingsData = bookingsSheet ? bookingsSheet.getDataRange().getValues() : [];
    var broadcastData = broadcastSheet ? broadcastSheet.getDataRange().getValues() : [];

    var totalMsgs = Math.max(0, msgsData.length - 1);
    var waCount = 0;
    var fbCount = 0;
    var igCount = 0;

    for (var m = 1; m < msgsData.length; m++) {
      var ch = String(msgsData[m][1] || '').toUpperCase();
      if (ch.indexOf('WHATSAPP') !== -1) waCount++;
      else if (ch.indexOf('FACEBOOK') !== -1) fbCount++;
      else if (ch.indexOf('INSTAGRAM') !== -1) igCount++;
    }

    var bookingsList = [];
    for (var b = 1; b < bookingsData.length; b++) {
      bookingsList.push({
        date: bookingsData[b][0],
        time: bookingsData[b][1],
        name: bookingsData[b][2],
        phone: bookingsData[b][3],
        email: bookingsData[b][4],
        subject: bookingsData[b][5],
        channel: bookingsData[b][6],
        status: bookingsData[b][8]
      });
    }

    // 2. Extrair números para disparos do período
    var broadcastExtract = extractBroadcastNumbers(period, 'all');
    var numbersList = broadcastExtract.numbers;
    var contactsList = broadcastExtract.contacts;

    // 3. Montar Template HTML do Relatório
    var htmlContent = buildReportHtml({
      periodLabel: periodLabel,
      generatedAt: nowWat,
      totalMessages: totalMsgs,
      whatsappCount: waCount,
      facebookCount: fbCount,
      instagramCount: igCount,
      bookingsCount: bookingsList.length,
      bookingsList: bookingsList,
      whatsappNumbersCount: numbersList.length,
      numbersComma: numbersList.slice(0, 50).join(', ') + (numbersList.length > 50 ? ' ... e mais ' + (numbersList.length - 50) + ' números' : ''),
      contactsList: contactsList.slice(0, 30)
    });

    // 4. Gerar Anexo PDF Executivo
    var pdfBlob = Utilities.newBlob(htmlContent, 'text/html', 'Relatorio_Orion_' + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyyMMdd_HHmm') + '.html')
                           .getAs('application/pdf')
                           .setName('Relatorio_Orion_Diario_WAT.pdf');

    // 5. Determinar Destinatários de Email
    var recipients = CONFIG.REPORT_EMAILS.trim();
    if (!recipients) {
      recipients = Session.getActiveUser().getEmail() || ss.getOwner().getEmail();
    }

    // Assunto do E-mail
    var subject = '📊 Relatório Diário Orion (' + periodLabel + ') - ' + nowWat + ' [WAT Angola]';

    // Enviar E-mail via Google Apps Script MailApp
    MailApp.sendEmail({
      to: recipients,
      subject: subject,
      htmlBody: htmlContent,
      attachments: [pdfBlob]
    });

    return {
      success: true,
      recipients: recipients,
      whatsappNumbersCount: numbersList.length,
      bookingsCount: bookingsList.length
    };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/**
 * Monta o HTML com Design Executivo e Responsivo do Relatório
 */
function buildReportHtml(d) {
  var bookingsRows = '';
  if (d.bookingsList && d.bookingsList.length > 0) {
    for (var i = 0; i < d.bookingsList.length; i++) {
      var bk = d.bookingsList[i];
      bookingsRows += '<tr style="border-bottom: 1px solid #e2e8f0;">' +
        '<td style="padding: 10px; font-weight: bold; color: #1e293b;">' + bk.date + ' ' + bk.time + '</td>' +
        '<td style="padding: 10px;">' + bk.name + '</td>' +
        '<td style="padding: 10px; color: #0284c7;">' + bk.phone + '</td>' +
        '<td style="padding: 10px;">' + (bk.email || '---') + '</td>' +
        '<td style="padding: 10px;">' + bk.subject + '</td>' +
        '<td style="padding: 10px; font-size: 11px; color: #64748b;">' + bk.channel + '</td>' +
        '<td style="padding: 10px;"><span style="background: #ecfdf5; color: #059669; padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: bold;">' + bk.status + '</span></td>' +
      '</tr>';
    }
  } else {
    bookingsRows = '<tr><td colspan="7" style="padding: 20px; text-align: center; color: #94a3b8;">Nenhum agendamento registado no período.</td></tr>';
  }

  var contactsRows = '';
  if (d.contactsList && d.contactsList.length > 0) {
    for (var j = 0; j < d.contactsList.length; j++) {
      var ct = d.contactsList[j];
      contactsRows += '<tr style="border-bottom: 1px solid #e2e8f0;">' +
        '<td style="padding: 8px 10px; font-family: monospace; font-weight: bold; color: #047857;">' + ct.phone + '</td>' +
        '<td style="padding: 8px 10px;">' + ct.name + '</td>' +
        '<td style="padding: 8px 10px;"><span style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 11px;">' + ct.channel + '</span></td>' +
        '<td style="padding: 8px 10px; font-size: 12px; color: #64748b;">' + (ct.email || '---') + '</td>' +
        '<td style="padding: 8px 10px; font-size: 12px;">' + ct.subject + '</td>' +
        '<td style="padding: 8px 10px; font-size: 11px; color: #64748b;">' + ct.lastInteractionWat + '</td>' +
      '</tr>';
    }
  }

  return '<!DOCTYPE html>' +
  '<html><head><meta charset="utf-8">' +
  '<style>' +
    'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; color: #1e293b; margin: 0; padding: 20px; }' +
    '.card { background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 24px; margin-bottom: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }' +
    '.grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 20px 0; }' +
    '.stat-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; text-align: center; }' +
    '.stat-num { font-size: 28px; font-weight: 800; color: #0f172a; margin-top: 4px; }' +
    '.stat-label { font-size: 12px; font-weight: 600; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; }' +
    'table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }' +
    'th { background: #f1f5f9; padding: 10px; font-weight: 600; color: #475569; border-bottom: 2px solid #cbd5e1; }' +
  '</style>' +
  '</head><body>' +
  '<div class="card" style="border-top: 5px solid #0f766e;">' +
    '<div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 16px;">' +
      '<div>' +
        '<h1 style="margin: 0; font-size: 24px; color: #0f172a;">📊 Relatório Diário de Atendimento & Disparos</h1>' +
        '<p style="margin: 4px 0 0 0; color: #64748b; font-size: 14px;">Orion Intelligence Platform &bull; Horário de Angola (WAT: UTC+1)</p>' +
      '</div>' +
      '<div style="text-align: right;">' +
        '<span style="background: #ccfbf1; color: #0f766e; padding: 4px 12px; border-radius: 999px; font-weight: bold; font-size: 12px;">' + d.periodLabel + '</span>' +
        '<p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">Gerado em: ' + d.generatedAt + '</p>' +
      '</div>' +
    '</div>' +

    '<div style="margin-top: 20px;">' +
      '<h3 style="font-size: 15px; margin: 0 0 10px 0; color: #334155;">📈 Métricas Consolidadas do Período</h3>' +
      '<table style="margin-bottom: 20px;">' +
        '<tr>' +
          '<td class="stat-box"><div class="stat-label">Total Mensagens</div><div class="stat-num">' + d.totalMessages + '</div></td>' +
          '<td class="stat-box"><div class="stat-label">WhatsApp</div><div class="stat-num" style="color: #059669;">' + d.whatsappCount + '</div></td>' +
          '<td class="stat-box"><div class="stat-label">Facebook</div><div class="stat-num" style="color: #2563eb;">' + d.facebookCount + '</div></td>' +
          '<td class="stat-box"><div class="stat-label">Instagram</div><div class="stat-num" style="color: #c026d3;">' + d.instagramCount + '</div></td>' +
        '</tr>' +
      '</table>' +
    '</div>' +

    '<div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">' +
      '<h3 style="margin: 0 0 8px 0; color: #166534; font-size: 15px;">🎯 Extração para Disparos WhatsApp (' + d.whatsappNumbersCount + ' números recolhidos)</h3>' +
      '<p style="margin: 0 0 8px 0; font-size: 12px; color: #15803d;">Estes números enviaram mensagem nas ' + d.periodLabel + ' e estão prontos para envio de campanhas sem digitação manual:</p>' +
      '<div style="background: #ffffff; border: 1px solid #86efac; border-radius: 6px; padding: 10px; font-family: monospace; font-size: 12px; color: #166534; word-break: break-all;">' +
        (d.numbersComma || 'Nenhum número identificado no período.') +
      '</div>' +
    '</div>' +

    '<div style="margin-bottom: 24px;">' +
      '<h3 style="margin: 0 0 12px 0; font-size: 15px; color: #1e293b;">📅 Agendamentos Marcados no Período (' + d.bookingsCount + ')</h3>' +
      '<table>' +
        '<thead><tr>' +
          '<th>Data / Hora</th><th>Nome</th><th>Telefone</th><th>Email</th><th>Assunto / Serviço</th><th>Canal</th><th>Status</th>' +
        '</tr></thead>' +
        '<tbody>' + bookingsRows + '</tbody>' +
      '</table>' +
    '</div>' +

    '<div>' +
      '<h3 style="margin: 0 0 12px 0; font-size: 15px; color: #1e293b;">👥 Contactos & Contas Recentes</h3>' +
      '<table>' +
        '<thead><tr>' +
          '<th>Número / Identificador</th><th>Nome</th><th>Canal</th><th>Email</th><th>Assunto</th><th>Última Interação</th>' +
        '</tr></thead>' +
        '<tbody>' + contactsRows + '</tbody>' +
      '</table>' +
    '</div>' +

    '<div style="margin-top: 30px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8;">' +
      'Orion Intelligence Platform &bull; Sincronização Automática com Google Sheets &bull; Luanda, Angola' +
    '</div>' +
  '</div>' +
  '</body></html>';
}

/**
 * Modal de Extração Rápida de Números para Disparos dentro do Google Sheets
 */
function showBroadcastExtractModal() {
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family: Arial, sans-serif; padding: 15px;">' +
      '<h3>🎯 Extrair Números WhatsApp para Disparos</h3>' +
      '<p style="font-size: 13px; color: #64748b;">Selecione o período de interesse:</p>' +
      '<select id="period" style="width: 100%; padding: 8px; margin-bottom: 12px; border-radius: 4px; border: 1px solid #cbd5e1;">' +
        '<option value="24h">Últimas 24 Horas</option>' +
        '<option value="week">Última Semana (7 dias)</option>' +
        '<option value="month">Último Mês (30 dias)</option>' +
        '<option value="all">Todo o Histórico (Sempre)</option>' +
      '</select>' +
      '<button onclick="extract()" style="background: #047857; color: white; padding: 10px 16px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; width: 100%;">Filtrar Números</button>' +
      '<div id="output" style="margin-top: 15px; display: none;">' +
        '<p style="font-size: 12px; font-weight: bold; color: #047857;" id="countLabel"></p>' +
        '<textarea id="resultText" style="width: 100%; height: 120px; font-family: monospace; font-size: 11px; padding: 6px; border: 1px solid #86efac; border-radius: 4px;" readonly></textarea>' +
        '<button onclick="copyToClipboard()" style="margin-top: 8px; background: #0284c7; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">📋 Copiar para Área de Transferência</button>' +
      '</div>' +
      '<script>' +
        'function extract() {' +
          'var p = document.getElementById("period").value;' +
          'google.script.run.withSuccessHandler(function(res) {' +
            'document.getElementById("output").style.display = "block";' +
            'document.getElementById("countLabel").innerText = "✅ " + res.total + " números WhatsApp encontrados no período (" + p + "):";' +
            'document.getElementById("resultText").value = res.numbers.join(", ");' +
          '}).extractBroadcastNumbers(p, "all");' +
        '}' +
        'function copyToClipboard() {' +
          'var copyText = document.getElementById("resultText");' +
          'copyText.select();' +
          'document.execCommand("copy");' +
          'alert("Números copiados com sucesso!");' +
        '}' +
      '</script>' +
    '</div>'
  ).setWidth(420).setHeight(380);

  SpreadsheetApp.getUi().showModalDialog(html, 'Extrator de Disparos Orion');
}

/**
 * Mostra a URL de Webhook para configurar no Orion
 */
function showWebhookUrl() {
  SpreadsheetApp.getUi().alert(
    '🔗 Como Conectar ao Orion 2.0:\n\n' +
    '1. Clique em "Implantar" (Deploy) > "Nova Implantação" no topo direito.\n' +
    '2. Tipo: "App da Web" (Web App).\n' +
    '3. Executar como: "Eu" (Seu email).\n' +
    '4. Quem tem acesso: "Qualquer pessoa" (Anyone).\n' +
    '5. Copie a URL do App da Web gerada e cole no Dashboard do Orion em Configurações > Google Sheets.\n\n' +
    'Pronto! Todas as mensagens de WhatsApp, Facebook, Instagram e agendamentos serão salvos em tempo real.'
  );
}

/**
 * Utilitário: Helper para retornar JSON
 */
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
