/**
 * ============================================================================
 * ORION — GOOGLE APPS SCRIPT DE INTEGRAÇÃO COM GOOGLE SHEETS
 * ============================================================================
 * Guarda automaticamente todos os números que enviam mensagem no WhatsApp,
 * Facebook e Instagram, os e-mails, nome, assunto e telefone para agendamento.
 * 
 * Abas automáticas criadas e formatadas:
 * 1. "📊 Agendamentos & Leads"
 *    - Data/Hora de Registo
 *    - Canal / Origem (WhatsApp, Facebook, Instagram, Live Chat)
 *    - Nome do Cliente
 *    - Telefone / WhatsApp
 *    - E-mail
 *    - Assunto / Serviço
 *    - Data Agendada
 *    - Hora Agendada
 *    - Status (Confirmado / Pendente / Atendido)
 *    - Observações / Notas
 * 
 * 2. "💬 Todos os Contactos & Mensagens"
 *    - Data do Primeiro Contacto
 *    - Plataforma (WhatsApp / Facebook / Instagram)
 *    - Número ou ID do Remetente
 *    - Nome do Remetente
 *    - E-mail
 *    - Última Mensagem / Assunto
 *    - Total de Interações
 *    - Última Interação (Data/Hora)
 * ============================================================================
 * COMO INSTALAR:
 * 1. Crie uma nova folha no Google Sheets (planilha).
 * 2. Vá a Extensões > Apps Script.
 * 3. Cole todo este código.
 * 4. Clique em Implementar (Deploy) > Nova implementação (New deployment).
 * 5. Tipo: "Aplicação Web" (Web app).
 * 6. Executar como: "Eu" (Me).
 * 7. Quem tem acesso: "Qualquer pessoa" (Anyone).
 * 8. Clique em "Implementar" e copie o URL da aplicação web.
 * 9. Cole o URL no Orion em Definições > Planilhas Google ou .env (GOOGLE_SCRIPT_WEBHOOK_URL).
 * ============================================================================
 */

const SHEET_NAME_LEADS = "📊 Agendamentos & Leads";
const SHEET_NAME_CONTACTS = "💬 Todos os Contactos & Mensagens";
const TIMEZONE_ANGOLA = "Africa/Luanda";

/**
 * Menu personalizado que aparece no Google Sheets
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("🚀 Orion Sistema")
    .addItem("⚙️ Inicializar / Formatar Folhas", "setupSheets")
    .addItem("📊 Gerar Resumo de Hoje (24H)", "generateDailySummaryDialog")
    .addItem("🧪 Inserir Linha de Teste", "insertTestData")
    .addToUi();
}

/**
 * Inicializa e formata as duas folhas com design profissional
 */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // ── Aba 1: Agendamentos & Leads ───────────────────────────────────────────
  let sheetLeads = ss.getSheetByName(SHEET_NAME_LEADS);
  if (!sheetLeads) {
    sheetLeads = ss.insertSheet(SHEET_NAME_LEADS);
  }
  
  const leadsHeaders = [
    "Data de Registo",
    "Canal / Origem",
    "Nome do Cliente",
    "Telefone / WhatsApp",
    "E-mail",
    "Assunto / Serviço",
    "Data Agendada",
    "Hora Agendada",
    "Status",
    "Notas / Observações"
  ];

  if (sheetLeads.getLastRow() === 0) {
    sheetLeads.appendRow(leadsHeaders);
  } else {
    sheetLeads.getRange(1, 1, 1, leadsHeaders.length).setValues([leadsHeaders]);
  }
  
  const leadsHeaderRange = sheetLeads.getRange(1, 1, 1, leadsHeaders.length);
  leadsHeaderRange.setBackground("#059669")
                  .setFontColor("#FFFFFF")
                  .setFontWeight("bold")
                  .setFontFamily("Segoe UI")
                  .setHorizontalAlignment("center")
                  .setVerticalAlignment("middle")
                  .setWrap(true);
  sheetLeads.setRowHeight(1, 38);
  sheetLeads.setFrozenRows(1);

  // ── Aba 2: Todos os Contactos & Mensagens ──────────────────────────────────
  let sheetContacts = ss.getSheetByName(SHEET_NAME_CONTACTS);
  if (!sheetContacts) {
    sheetContacts = ss.insertSheet(SHEET_NAME_CONTACTS);
  }

  const contactsHeaders = [
    "Data de Início",
    "Plataforma",
    "Número / ID",
    "Nome do Remetente",
    "E-mail",
    "Última Mensagem / Assunto",
    "Total Interações",
    "Última Interação"
  ];

  if (sheetContacts.getLastRow() === 0) {
    sheetContacts.appendRow(contactsHeaders);
  } else {
    sheetContacts.getRange(1, 1, 1, contactsHeaders.length).setValues([contactsHeaders]);
  }

  const contactsHeaderRange = sheetContacts.getRange(1, 1, 1, contactsHeaders.length);
  contactsHeaderRange.setBackground("#1E293B")
                      .setFontColor("#FFFFFF")
                      .setFontWeight("bold")
                      .setFontFamily("Segoe UI")
                      .setHorizontalAlignment("center")
                      .setVerticalAlignment("middle")
                      .setWrap(true);
  sheetContacts.setRowHeight(1, 38);
  sheetContacts.setFrozenRows(1);

  // Auto-dimensionar larguras
  for (let i = 1; i <= leadsHeaders.length; i++) {
    sheetLeads.autoResizeColumn(i);
  }
  for (let i = 1; i <= contactsHeaders.length; i++) {
    sheetContacts.autoResizeColumn(i);
  }

  return { status: "success", message: "Folhas Orion inicializadas com sucesso!" };
}

/**
 * Webhook Receptor (POST) chamado pelo backend Orion
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "Nenhum dado recebido no payload POST."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const payload = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    setupSheets();

    const action = payload.action || "sync_lead";
    const now = new Date();
    const formattedNow = Utilities.formatDate(now, TIMEZONE_ANGOLA, "yyyy-MM-dd HH:mm:ss");

    // ── 1. Mensagem recebida (WhatsApp, Facebook, Instagram) ─────────────────
    if (action === "incoming_message" || action === "contact") {
      const platform = (payload.platform || "WhatsApp").toUpperCase();
      const senderId = String(payload.senderId || payload.phone || "").trim();
      const senderName = payload.senderName || payload.name || "Cliente";
      const text = payload.text || payload.message || "(Interação)";
      const email = payload.email || "";

      logOrUpdateContact(ss, {
        registeredAt: formattedNow,
        platform: platform,
        senderId: senderId,
        senderName: senderName,
        email: email,
        lastMessage: text,
        lastInteraction: formattedNow
      });

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        action: "contact_logged",
        platform: platform,
        senderId: senderId
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ── 2. Agendamento / Lead com estrutura completa ─────────────────────────
    if (action === "booking" || action === "sync_lead" || action === "live_chat_start") {
      const sheetLeads = ss.getSheetByName(SHEET_NAME_LEADS);
      const platform = (payload.platform || "WhatsApp").toUpperCase();
      const name = payload.name || payload.customer_name || "Cliente";
      const phone = String(payload.phone || payload.customer_phone || "").trim();
      const email = payload.email || payload.customer_email || "";
      const subject = payload.subject || payload.service || "Atendimento / Geral";
      const appointmentDate = payload.date || payload.appointmentDate || payload.appointment_date || "-";
      const appointmentTime = payload.time || payload.appointmentTime || payload.appointment_time || "-";
      const status = payload.status || (appointmentDate !== "-" ? "Confirmado" : "Interessado");
      const notes = payload.notes || payload.initialMessage || "";

      sheetLeads.appendRow([
        formattedNow,
        platform,
        name,
        phone,
        email,
        subject,
        appointmentDate,
        appointmentTime,
        status,
        notes
      ]);

      const lastRow = sheetLeads.getLastRow();
      const range = sheetLeads.getRange(lastRow, 1, 1, 10);
      range.setFontFamily("Segoe UI").setFontSize(10).setVerticalAlignment("middle");
      if (lastRow % 2 === 0) {
        range.setBackground("#F8FAFC");
      }

      // Registar também na folha de contactos
      if (phone) {
        logOrUpdateContact(ss, {
          registeredAt: formattedNow,
          platform: platform,
          senderId: phone,
          senderName: name,
          email: email,
          lastMessage: `[${subject}] Agendamento: ${appointmentDate} ${appointmentTime}`,
          lastInteraction: formattedNow
        });
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        action: "lead_recorded",
        row: lastRow,
        customer: name,
        phone: phone
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Ping / Teste
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Webhook Google Apps Script Orion ativo!",
      timestamp: formattedNow
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Atualiza ou insere contacto na aba de contactos
 */
function logOrUpdateContact(ss, data) {
  const sheet = ss.getSheetByName(SHEET_NAME_CONTACTS);
  if (!sheet) return;

  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  let foundRow = -1;

  for (let r = 1; r < values.length; r++) {
    const existingSender = String(values[r][2]).trim();
    if (existingSender && existingSender === String(data.senderId).trim()) {
      foundRow = r + 1;
      break;
    }
  }

  if (foundRow > 1) {
    const currentCount = parseInt(values[foundRow - 1][6], 10) || 1;
    const existingName = values[foundRow - 1][3];

    sheet.getRange(foundRow, 4).setValue(data.senderName && data.senderName !== "Cliente" ? data.senderName : (existingName || "Cliente"));
    if (data.email) sheet.getRange(foundRow, 5).setValue(data.email);
    sheet.getRange(foundRow, 6).setValue(data.lastMessage || "");
    sheet.getRange(foundRow, 7).setValue(currentCount + 1);
    sheet.getRange(foundRow, 8).setValue(data.lastInteraction);
  } else {
    sheet.appendRow([
      data.registeredAt,
      data.platform,
      data.senderId,
      data.senderName,
      data.email || "",
      data.lastMessage || "",
      1,
      data.lastInteraction
    ]);

    const newRow = sheet.getLastRow();
    const rowRange = sheet.getRange(newRow, 1, 1, 8);
    rowRange.setFontFamily("Segoe UI").setFontSize(10).setVerticalAlignment("middle");
    if (newRow % 2 === 0) {
      rowRange.setBackground("#F8FAFC");
    }
  }
}

/**
 * Endpoint GET para teste visual no navegador
 */
function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const leadsCount = Math.max(0, (ss.getSheetByName(SHEET_NAME_LEADS)?.getLastRow() || 1) - 1);
  const contactsCount = Math.max(0, (ss.getSheetByName(SHEET_NAME_CONTACTS)?.getLastRow() || 1) - 1);

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Orion — Webhook Google Sheets</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #0F172A; color: #F8FAFC; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
          .card { background: #1E293B; border: 1px solid #334155; border-radius: 16px; padding: 32px; max-width: 520px; width: 90%; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
          .badge { display: inline-block; background: #059669; color: white; padding: 6px 16px; border-radius: 9999px; font-weight: bold; font-size: 13px; margin-bottom: 16px; }
          h1 { margin: 0 0 8px 0; font-size: 22px; color: #F1F5F9; }
          p { color: #94A3B8; font-size: 14px; line-height: 1.6; }
          .stats { display: flex; gap: 12px; margin-top: 24px; justify-content: center; }
          .stat-box { background: #0F172A; border: 1px solid #334155; padding: 12px 20px; border-radius: 10px; flex: 1; }
          .stat-num { font-size: 22px; font-weight: bold; color: #34D399; }
          .stat-label { font-size: 11px; color: #64748B; margin-top: 4px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">● Webhook Operacional & Conectado</div>
          <h1>Integração Orion ↔ Planilha Google</h1>
          <p>O Google Apps Script está a receber dados automaticamente de WhatsApp, Facebook, Instagram e Agendamentos.</p>
          <div class="stats">
            <div class="stat-box">
              <div class="stat-num">${leadsCount}</div>
              <div class="stat-label">Agendamentos / Leads</div>
            </div>
            <div class="stat-box">
              <div class="stat-num">${contactsCount}</div>
              <div class="stat-label">Contactos Únicos</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
  return HtmlService.createHtmlOutput(html).setTitle("Orion — Webhook Google Sheets");
}

/**
 * Resumo diário em modal dentro da Planilha
 */
function generateDailySummaryDialog() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const leadsSheet = ss.getSheetByName(SHEET_NAME_LEADS);
  const contactsSheet = ss.getSheetByName(SHEET_NAME_CONTACTS);

  const leadsTotal = Math.max(0, (leadsSheet?.getLastRow() || 1) - 1);
  const contactsTotal = Math.max(0, (contactsSheet?.getLastRow() || 1) - 1);

  const msg = `📊 RESUMO ORION\n\nTotal de Agendamentos e Leads: ${leadsTotal}\nTotal de Contactos Registados: ${contactsTotal}\n\nO relatório detalhado de 24H é enviado automaticamente às 23:59 (Horário de Luanda) pelo sistema Orion para os e-mails da empresa e da equipa.`;
  SpreadsheetApp.getUi().alert(msg);
}

/**
 * Teste rápido inserindo dados exemplo
 */
function insertTestData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  setupSheets();
  const mockPayload = {
    action: "booking",
    platform: "WhatsApp",
    name: "Dra. Maria Fernandes (Teste)",
    phone: "+244923112233",
    email: "maria.fernandes@exemplo.com",
    subject: "Consulta e Avaliação Geral",
    date: "2026-10-10",
    time: "10:30",
    status: "Confirmado",
    notes: "Lead e agendamento de teste gerados no Google Sheets."
  };
  doPost({ postData: { contents: JSON.stringify(mockPayload) } });
  SpreadsheetApp.getUi().alert("✅ Linha de teste inserida com sucesso!");
}
