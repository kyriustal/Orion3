import nodemailer from 'nodemailer';
import { supabaseAdmin } from '../config/supabase';

export interface SendTeamInvitationParams {
  email: string;
  name: string;
  password: string;
  role: string;
  orgName: string;
}

export class EmailService {
  /**
   * Envia um email de convite com as credenciais de acesso para um novo membro da equipa.
   */
  static async sendTeamInvitation(params: SendTeamInvitationParams): Promise<boolean> {
    const { email, name, password, role, orgName } = params;

    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM || 'Orion Platform <no-reply@orion.com>';

    console.log(`[EmailService] A preparar envio de convite para ${email} (Org: ${orgName})...`);

    // Tradução legível da role para o email
    const roleTranslated = 
      role === 'OWNER' ? 'Proprietário' :
      role === 'ADMIN' ? 'Administrador' :
      role === 'AGENT' ? 'Agente de Atendimento' : 'Visualizador';

    // Link do Painel Orion (ajustar caso haja variável de ambiente correspondente)
    const dashboardUrl = process.env.VITE_APP_URL || 'http://localhost:3000/login';

    // 1. Caso as credenciais SMTP não estejam preenchidas, realizamos um fallback seguro
    if (!user || !pass) {
      console.warn(
        `[EmailService] ⚠️ SMTP_USER ou SMTP_PASS não configurados no ficheiro .env!\n` +
        `---------------- CREDENCIAIS CONVITE ----------------\n` +
        `Para: ${name} (${email})\n` +
        `Organização: ${orgName}\n` +
        `Cargo: ${roleTranslated}\n` +
        `Password configurada: ${password}\n` +
        `Link de acesso: ${dashboardUrl}\n` +
        `-----------------------------------------------------`
      );
      return true; // Retorna true para simular sucesso no fluxo sem quebrar a API
    }

    try {
      // 2. Configurar o transportador do Nodemailer
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465, // true para 465, false para outras portas (como 587)
        auth: {
          user,
          pass,
        },
      });

      // 3. Template HTML Premium e Responsivo (Estilo Orion)
      const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Bem-vindo à equipa Orion</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f3f4f6;
            margin: 0;
            padding: 0;
            -webkit-font-smoothing: antialiased;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background: #ffffff;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
          }
          .header {
            background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
            padding: 40px 20px;
            text-align: center;
            color: #ffffff;
          }
          .header h1 {
            margin: 0;
            font-size: 26px;
            font-weight: 700;
            letter-spacing: -0.5px;
          }
          .header p {
            margin: 10px 0 0 0;
            font-size: 16px;
            opacity: 0.9;
          }
          .content {
            padding: 40px 30px;
            color: #1f2937;
          }
          .content p {
            font-size: 15px;
            line-height: 1.6;
            margin: 0 0 20px 0;
          }
          .card {
            background-color: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            padding: 24px;
            margin: 25px 0;
          }
          .card-title {
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #6b7280;
            margin-bottom: 12px;
            font-weight: 600;
          }
          .credential-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            font-size: 15px;
            border-bottom: 1px dashed #f3f4f6;
            padding-bottom: 8px;
          }
          .credential-row:last-child {
            margin-bottom: 0;
            border-bottom: none;
            padding-bottom: 0;
          }
          .label {
            color: #4b5563;
            font-weight: 500;
          }
          .value {
            color: #1f2937;
            font-weight: 600;
            font-family: monospace;
          }
          .btn-container {
            text-align: center;
            margin: 35px 0 15px 0;
          }
          .btn {
            background-color: #4f46e5;
            color: #ffffff !important;
            padding: 14px 32px;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 15px;
            display: inline-block;
            box-shadow: 0 4px 6px rgba(79, 70, 229, 0.15);
            transition: background-color 0.2s;
          }
          .footer {
            background-color: #f9fafb;
            padding: 20px;
            text-align: center;
            font-size: 13px;
            color: #9ca3af;
            border-top: 1px solid #e5e7eb;
          }
          .footer a {
            color: #4f46e5;
            text-decoration: none;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Orion AI</h1>
            <p>A tua nova conta de atendimento está pronta</p>
          </div>
          <div class="content">
            <p>Olá <strong>${name}</strong>,</p>
            <p>Foste adicionado com sucesso por um administrador à equipa da organização <strong>${orgName}</strong> na plataforma Orion.</p>
            
            <p>Abaixo encontras os teus detalhes de acesso configurados. Por questões de segurança, recomendamos que alteres a tua password assim que iniciares sessão.</p>
            
            <div class="card">
              <div class="card-title">Credenciais de Acesso</div>
              <div class="credential-row">
                <span class="label">Email de Acesso:</span>
                <span class="value" style="font-family: inherit;">${email}</span>
              </div>
              <div class="credential-row">
                <span class="label">Palavra-passe:</span>
                <span class="value">${password}</span>
              </div>
              <div class="credential-row">
                <span class="label">Função / Cargo:</span>
                <span class="value" style="font-family: inherit; font-weight: normal; color: #4f46e5;">${roleTranslated}</span>
              </div>
            </div>
            
            <div class="btn-container">
              <a href="${dashboardUrl}" class="btn" target="_blank">Aceder ao Painel Orion</a>
            </div>
          </div>
          <div class="footer">
            <p>Orion - Plataforma Inteligente de Atendimento ao Cliente via WhatsApp.</p>
            <p>&copy; ${new Date().getFullYear()} Orion AI. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
      </html>
      `;

      // 4. Disparar email
      await transporter.sendMail({
        from,
        to: email,
        subject: `🔑 A tua nova conta na equipa da ${orgName} está pronta!`,
        text: `Olá ${name},\n\nFoste adicionado à equipa da organização ${orgName} no Orion.\n\nDetalhes de acesso:\n- Link de acesso: ${dashboardUrl}\n- Email: ${email}\n- Cargo: ${roleTranslated}\n- Password: ${password}\n\nPor favor, inicia sessão e altera a tua password por segurança.`,
        html: htmlContent,
      });

      console.log(`[EmailService] ✅ Email de convite enviado com sucesso para ${email}`);
      return true;
    } catch (err: any) {
      console.error(`[EmailService] ❌ Erro ao enviar email de convite para ${email}:`, err.message);
      throw err;
    }
  }

  /**
   * Envia um alerta de handover ou agendamento para os administradores da organização.
   */
  static async sendAlertNotification(orgId: string, type: 'handover' | 'booking' | 'proposal' | 'confirmation', customerPhone: string, customerName: string = 'Cliente', messageText: string = ''): Promise<void> {
    try {
      // Obter nome da organização e e-mails dos admins/owners
      const { data: orgData } = await supabaseAdmin
        .from('organizations')
        .select('name')
        .eq('id', orgId)
        .maybeSingle();
 
      const { data: teamMembers } = await supabaseAdmin
        .from('team_members')
        .select('email, name, role')
        .eq('org_id', orgId)
        .in('role', ['OWNER', 'ADMIN', 'AGENT']);
 
      if (!teamMembers || teamMembers.length === 0) {
        console.warn(`[EmailService] Nenhum membro da equipa encontrado para notificar na org ${orgId}`);
        return;
      }
 
      const orgName = orgData?.name || 'sua organização';
      const host = process.env.SMTP_HOST;
      const port = parseInt(process.env.SMTP_PORT || '587', 10);
      const user = process.env.SMTP_USER;
      const pass = process.env.SMTP_PASS;
      const from = process.env.SMTP_FROM || 'Orion Platform <no-reply@orion.com>';
 
      if (!user || !pass) {
        console.warn(`[EmailService] SMTP não configurado. Simulação de envio de alerta de ${type} para org ${orgId}.`);
        return;
      }
 
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
 
      const title = type === 'handover' 
        ? '🚨 Pedido de Atendimento Humano' 
        : type === 'booking'
        ? '📅 Novo Pedido de Agendamento'
        : type === 'proposal'
        ? '📎 Proposta Comercial Recebida'
        : '⚠️ A CONFIRMAR INFORMAÇÃO';
      const description = type === 'handover' 
        ? 'A Inteligência Artificial detetou que um cliente solicitou falar com um assistente humano.'
        : type === 'booking'
        ? 'Um cliente demonstrou interesse em agendar um serviço ou consulta.'
        : type === 'proposal'
        ? 'A Inteligência Artificial detetou que o cliente enviou uma proposta comercial (serviço, parceria ou produto).'
        : 'A Inteligência Artificial detetou uma pergunta sem dados na base de conhecimento e informou que confirmará as informações.';

      const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
          .header { background: ${type === 'handover' ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : type === 'booking' ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : type === 'proposal' ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'}; padding: 30px 20px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 24px; }
          .content { padding: 30px; color: #1f2937; }
          .card { background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .row { margin-bottom: 10px; font-size: 15px; }
          .label { font-weight: 600; color: #4b5563; }
          .btn { background-color: #10b981; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; margin-top: 15px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${title}</h1>
          </div>
          <div class="content">
            <p>Olá equipa da <strong>${orgName}</strong>,</p>
            <p>${description}</p>
            <div class="card">
              <div class="row"><span class="label">Contacto:</span> ${customerPhone}</div>
              <div class="row"><span class="label">Nome:</span> ${customerName}</div>
              ${messageText ? `<div class="row"><span class="label">Mensagem do Cliente:</span> <em>"${messageText}"</em></div>` : ''}
            </div>
            <p>Por favor, aceda ao Live Chat para dar seguimento:</p>
            <a href="${process.env.VITE_APP_URL || 'http://localhost:3000'}/dashboard/live-chat" class="btn">Abrir Live Chat</a>
          </div>
        </div>
      </body>
      </html>
      `;

      // Enviar para todos os membros elegíveis
      const recipients = teamMembers.map(m => m.email).filter(Boolean);
      if (recipients.length > 0) {
        await transporter.sendMail({
          from,
          to: recipients,
          subject: `${title} - ${orgName} (${customerPhone})`,
          html: htmlContent,
        });
        console.log(`[EmailService] ✅ Alerta de ${type} enviado com sucesso para ${recipients.length} destinatários.`);
      }
    } catch (err: any) {
      console.error(`[EmailService] ❌ Erro ao enviar alerta de ${type}:`, err.message);
    }
  }

  /**
   * Envia um Email de URGÊNCIA MÁXIMA para intervenção imediata da empresa quando as 3 tentativas da IA falham.
   */
  static async sendUrgentInterventionAlert(params: {
    orgId: string;
    customerPhone: string;
    customerName?: string;
    errorMessage: string;
    customerMessage?: string;
    platform?: string;
  }): Promise<boolean> {
    const { orgId, customerPhone, customerName = 'Cliente', errorMessage, customerMessage = '', platform = 'WhatsApp' } = params;

    try {
      const { data: orgData } = await supabaseAdmin
        .from('organizations')
        .select('name')
        .eq('id', orgId)
        .maybeSingle();

      const { data: teamMembers } = await supabaseAdmin
        .from('team_members')
        .select('email, role')
        .eq('org_id', orgId)
        .in('role', ['OWNER', 'ADMIN', 'AGENT']);

      const orgName = orgData?.name || 'sua organização';
      const host = process.env.SMTP_HOST;
      const port = parseInt(process.env.SMTP_PORT || '587', 10);
      const user = process.env.SMTP_USER;
      const pass = process.env.SMTP_PASS;
      const from = process.env.SMTP_FROM || 'Orion Platform <urgencias@orion.com>';

      // Lista consolidada de destinatários (Equipa + VIPs)
      const teamEmails = (teamMembers || []).map(m => m.email).filter(Boolean);
      const vipEmails = (process.env.VIP_EMAILS || '')
        .split(',')
        .map(e => e.trim())
        .filter(e => e.includes('@'));

      const allRecipients = Array.from(new Set([...teamEmails, ...vipEmails]));

      if (allRecipients.length === 0) {
        console.warn(`[EmailService] Nenhum destinatário para email de urgência na org ${orgId}`);
        return false;
      }

      if (!user || !pass) {
        console.warn(`[EmailService] ⚠️ SMTP não configurado. Simulação de email de URGÊNCIA para ${allRecipients.join(', ')}.`);
        return true;
      }

      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });

      const liveChatUrl = `${process.env.VITE_APP_URL || 'http://localhost:3000'}/dashboard/live-chat`;

      const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #fef2f2; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(239,68,68,0.15); border: 1px solid #fee2e2; }
          .header { background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 35px 20px; text-align: center; color: #ffffff; }
          .badge { display: inline-block; background-color: rgba(255,255,255,0.25); padding: 5px 14px; border-radius: 9999px; font-size: 12px; font-weight: 800; letter-spacing: 0.8px; margin-bottom: 10px; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 800; }
          .content { padding: 30px; color: #1f2937; }
          .alert-box { background-color: #fef2f2; border-left: 4px solid #ef4444; border-radius: 6px; padding: 16px; margin: 20px 0; color: #991b1b; }
          .card { background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .row { margin-bottom: 10px; font-size: 15px; }
          .label { font-weight: 700; color: #374151; }
          .btn { background-color: #dc2626; color: #ffffff !important; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; display: inline-block; margin-top: 20px; text-align: center; box-shadow: 0 4px 10px rgba(220,38,38,0.3); }
          .footer { background-color: #f9fafb; padding: 20px; text-align: center; font-size: 13px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <span class="badge">⚠️ INTERVENÇÃO URGENTE NECESSÁRIA</span>
            <h1>Falha de Envio de Mensagem</h1>
            <p style="margin: 8px 0 0 0; opacity: 0.95;">Organização: ${orgName}</p>
          </div>
          <div class="content">
            <div class="alert-box">
              <strong>ATENÇÃO:</strong> A Inteligência Artificial tentou resolver o problema e repetiu 3 tentativas de resposta, mas o envio não foi concluído com sucesso. A conversa foi destacada a <strong>VERMELHO</strong> no Live Chat para atendimento humano imediato.
            </div>
            <p>O cliente está aguardando uma resposta e <strong>nenhuma mensagem técnica de erro foi enviada a ele</strong>.</p>
            <div class="card">
              <div class="row"><span class="label">📱 Plataforma:</span> ${platform.toUpperCase()}</div>
              <div class="row"><span class="label">📞 Contacto do Cliente:</span> ${customerPhone}</div>
              <div class="row"><span class="label">👤 Nome:</span> ${customerName}</div>
              ${customerMessage ? `<div class="row"><span class="label">💬 Última Mensagem Recebida:</span> <em>"${customerMessage}"</em></div>` : ''}
              <div class="row"><span class="label">⚙️ Diagnóstico do Erro:</span> <code style="color:#b91c1c; font-size:12px;">${errorMessage}</code></div>
            </div>
            <div style="text-align: center;">
              <a href="${liveChatUrl}" class="btn">🚨 Assumir Conversa no Live Chat Agora</a>
            </div>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Orion AI. Alerta de Segurança e Qualidade de Atendimento.</p>
          </div>
        </div>
      </body>
      </html>
      `;

      await transporter.sendMail({
        from,
        to: allRecipients,
        subject: `🚨 URGENTE: Intervenção necessária no atendimento a ${customerName} (${customerPhone}) - ${orgName}`,
        html: htmlContent,
      });

      console.log(`[EmailService] 🚨 Email de intervenção de urgência enviado com sucesso para: ${allRecipients.join(', ')}`);
      return true;
    } catch (err: any) {
      console.error('[EmailService] ❌ Erro ao enviar email de intervenção urgente:', err.message);
      return false;
    }
  }

  /**
   * Envia email de confirmação de agendamento diretamente para o cliente com o nome da empresa e link do Google Maps.
   */
  static async sendBookingConfirmationToCustomer(params: {
    customerEmail: string;
    customerName: string;
    date: string;
    time: string;
    subject: string;
    companyName: string;
    companyPhone?: string;
    companyAddress?: string;
    mapsLink?: string;
  }): Promise<boolean> {
    const { customerEmail, customerName, date, time, subject, companyName, companyPhone, companyAddress, mapsLink } = params;

    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    // Remetente usa sempre o nome da empresa registada como nome de exibição
    const smtpUser = user || 'no-reply@orion.com';
    const from = `${companyName} <${smtpUser}>`;

    if (!user || !pass) {
      console.warn(`[EmailService] ⚠️ SMTP não configurado. Simulação de email de confirmação para ${customerEmail}`);
      return true;
    }

    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });

      const mapsLinkHtml = mapsLink
        ? `<div style="margin-top: 15px; padding: 12px 16px; background-color: #eff6ff; border-radius: 8px; border: 1px solid #bfdbfe;">
             📍 <strong>Como chegar:</strong> 
             <a href="${mapsLink}" target="_blank" style="color: #1d4ed8; text-decoration: underline; font-weight: 600; margin-left: 6px;">
               Localizar no Google Maps
             </a>
           </div>`
        : '';

      const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
          .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 35px 20px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 700; }
          .content { padding: 30px; color: #1f2937; }
          .card { background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .row { margin-bottom: 10px; font-size: 15px; }
          .label { font-weight: 600; color: #4b5563; }
          .footer { background-color: #f9fafb; padding: 20px; text-align: center; font-size: 13px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Marcação Confirmada!</h1>
            <p style="margin: 8px 0 0 0; opacity: 0.95;">${companyName}</p>
          </div>
          <div class="content">
            <p>Olá <strong>${customerName}</strong>,</p>
            <p>A sua marcação com a <strong>${companyName}</strong> foi confirmada com sucesso!</p>
            <div class="card">
              <div class="row"><span class="label">📅 Data:</span> ${date}</div>
              <div class="row"><span class="label">⏰ Hora:</span> ${time}</div>
              <div class="row"><span class="label">📋 Assunto:</span> ${subject}</div>
              ${companyPhone ? `<div class="row"><span class="label">📞 Telefone de Contacto:</span> ${companyPhone}</div>` : ''}
              ${companyAddress ? `<div class="row"><span class="label">🏢 Endereço:</span> ${companyAddress}</div>` : ''}
              ${mapsLinkHtml}
            </div>
            <p style="font-size: 14px; color: #6b7280;">Também receberá um convite na sua agenda Google com os detalhes da sessão.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${companyName}. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
      </html>
      `;

      await transporter.sendMail({
        from,
        to: customerEmail,
        subject: `✅ Confirmação de Agendamento - ${companyName} (${date} às ${time})`,
        html: htmlContent,
      });

      console.log(`[EmailService] ✅ Email de confirmação enviado para o cliente ${customerEmail} (Empresa: ${companyName})`);
      return true;
    } catch (err: any) {
      console.error(`[EmailService] ❌ Erro ao enviar email de confirmação para ${customerEmail}:`, err.message);
      return false;
    }
  }

  /**
   * Envia e-mails de lembrete programados para o cliente (7 dias antes, 72h antes e no dia marcado às 07:00).
   */
  static async sendBookingReminderToCustomer(params: {
    customerEmail: string;
    customerName: string;
    date: string;
    time: string;
    subject: string;
    reminderStage: '7_days_before' | '3_days_before' | 'day_of_7am';
    companyName: string;
    companyPhone?: string;
    companyAddress?: string;
    mapsLink?: string;
  }): Promise<boolean> {
    const { customerEmail, customerName, date, time, subject, reminderStage, companyName, companyPhone, companyAddress, mapsLink } = params;

    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const smtpUser = user || 'no-reply@orion.com';
    const from = `${companyName} <${smtpUser}>`;

    if (!user || !pass) {
      console.warn(`[EmailService] ⚠️ SMTP não configurado. Simulação de lembrete (${reminderStage}) para ${customerEmail}`);
      return true;
    }

    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });

      const mapsLinkHtml = mapsLink
        ? `<div style="margin-top: 15px; padding: 12px 16px; background-color: #eff6ff; border-radius: 8px; border: 1px solid #bfdbfe;">
             📍 <strong>Como chegar:</strong> 
             <a href="${mapsLink}" target="_blank" style="color: #1d4ed8; text-decoration: underline; font-weight: 600; margin-left: 6px;">
               Localizar no Google Maps
             </a>
           </div>`
        : '';

      const stageInfo = reminderStage === '7_days_before'
        ? {
            title: 'Lembrete: A sua marcação é na próxima semana!',
            subTitle: 'Faltam 7 dias para o seu agendamento',
            badge: '1 SEMANA ANTES',
            color: '#3b82f6',
            mailSubject: `🔔 Lembrete: A sua marcação com ${companyName} é em 7 dias (${date} às ${time})`
          }
        : reminderStage === '3_days_before'
        ? {
            title: 'Lembrete: Faltam 72 Horas para o seu agendamento!',
            subTitle: 'A sua marcação está próxima',
            badge: '72 HORAS ANTES',
            color: '#8b5cf6',
            mailSubject: `⏰ Lembrete: Faltam 3 dias para a sua marcação com ${companyName} (${date} às ${time})`
          }
        : {
            title: 'Bom dia! O seu agendamento é hoje!',
            subTitle: `Esperamos por si hoje às ${time}`,
            badge: 'HOJE',
            color: '#10b981',
            mailSubject: `☀️ Hoje! Lembrete do seu agendamento com ${companyName} às ${time}`
          };

      const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
          .header { background: linear-gradient(135deg, ${stageInfo.color} 0%, #1e293b 100%); padding: 35px 20px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 22px; font-weight: 700; }
          .content { padding: 30px; color: #1f2937; }
          .badge { display: inline-block; background-color: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 8px; }
          .card { background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .row { margin-bottom: 10px; font-size: 15px; }
          .label { font-weight: 600; color: #4b5563; }
          .footer { background-color: #f9fafb; padding: 20px; text-align: center; font-size: 13px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <span class="badge">${stageInfo.badge}</span>
            <h1>${stageInfo.title}</h1>
            <p style="margin: 8px 0 0 0; opacity: 0.95;">${companyName}</p>
          </div>
          <div class="content">
            <p>Olá <strong>${customerName}</strong>,</p>
            <p>Este é um lembrete amigável sobre o seu compromisso agendado com a <strong>${companyName}</strong>:</p>
            <div class="card">
              <div class="row"><span class="label">📅 Data:</span> ${date}</div>
              <div class="row"><span class="label">⏰ Hora:</span> ${time}</div>
              <div class="row"><span class="label">📋 Assunto:</span> ${subject}</div>
              ${companyPhone ? `<div class="row"><span class="label">📞 Contacto:</span> ${companyPhone}</div>` : ''}
              ${companyAddress ? `<div class="row"><span class="label">🏢 Endereço:</span> ${companyAddress}</div>` : ''}
              ${mapsLinkHtml}
            </div>
            <p style="font-size: 14px; color: #6b7280;">Caso necessite reagendar ou tenha alguma dúvida, responda a esta mensagem ou contacte a nossa equipa.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${companyName}. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
      </html>
      `;

      await transporter.sendMail({
        from,
        to: customerEmail,
        subject: stageInfo.mailSubject,
        html: htmlContent,
      });

      console.log(`[EmailService] ✅ Email de lembrete (${reminderStage}) enviado para ${customerEmail}`);
      return true;
    } catch (err: any) {
      console.error(`[EmailService] ❌ Erro ao enviar email de lembrete (${reminderStage}) para ${customerEmail}:`, err.message);
      return false;
    }
  }

  /**
   * Envia e-mail de pesquisa de satisfação e avaliação pós-atendimento.
   */
  static async sendPostAppointmentReviewToCustomer(params: {
    customerEmail: string;
    customerName: string;
    date: string;
    time: string;
    subject: string;
    companyName: string;
    companyPhone?: string;
  }): Promise<boolean> {
    const { customerEmail, customerName, date, time, subject, companyName, companyPhone } = params;

    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const smtpUser = user || 'no-reply@orion.com';
    const from = `${companyName} <${smtpUser}>`;

    if (!user || !pass) {
      console.warn(`[EmailService] ⚠️ SMTP não configurado. Simulação de email de avaliação pós-atendimento para ${customerEmail}`);
      return true;
    }

    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });

      const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
          .header { background: linear-gradient(135deg, #4f46e5 0%, #1e1b4b 100%); padding: 35px 20px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 22px; font-weight: 700; }
          .content { padding: 30px; color: #1f2937; line-height: 1.6; }
          .badge { display: inline-block; background-color: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 8px; }
          .card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
          .stars { font-size: 24px; color: #fbbf24; margin: 10px 0; }
          .footer { background-color: #f9fafb; padding: 20px; text-align: center; font-size: 13px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <span class="badge">AVALIAÇÃO DE ATENDIMENTO</span>
            <h1>Como foi a sua experiência?</h1>
            <p style="margin: 8px 0 0 0; opacity: 0.95;">${companyName}</p>
          </div>
          <div class="content">
            <p>Olá <strong>${customerName}</strong>,</p>
            <p>Esperamos que tenha corrido tudo bem com a sua consultoria sobre <strong>${subject}</strong> realizada em ${date}.</p>
            <div class="card">
              <p style="margin: 0; font-size: 16px; font-weight: 600; color: #334155;">A sua opinião é fundamental para melhorarmos continuamente!</p>
              <div class="stars">⭐⭐⭐⭐⭐</div>
              <p style="font-size: 14px; color: #64748b; margin: 0;">Como avalia o atendimento e esclarecimento prestado pela nossa equipa?</p>
            </div>
            <p>Basta responder a este e-mail ou enviar uma mensagem para o nosso WhatsApp (${companyPhone || 'o nosso contacto'}) partilhando os seus comentários ou sugestões.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${companyName}. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
      </html>
      `;

      await transporter.sendMail({
        from,
        to: customerEmail,
        subject: `⭐ Como foi o seu atendimento com a ${companyName}?`,
        html: htmlContent,
      });

      console.log(`[EmailService] ✉️ Email de avaliação pós-atendimento enviado para ${customerEmail}`);
      return true;
    } catch (err: any) {
      console.error(`[EmailService] ❌ Erro ao enviar email de avaliação pós-atendimento para ${customerEmail}:`, err.message);
      return false;
    }
  }

  /**
   * Envia email de notificação à empresa registrada quando um novo agendamento for confirmado ou remarcado.
   */
  static async sendBookingNotificationToCompany(params: {
    orgId: string;
    customerName: string;
    customerPhone?: string;
    customerEmail?: string;
    date: string;
    time: string;
    subject: string;
    companyName?: string;
    channelOrigin?: string;
    isReschedule?: boolean;
  }): Promise<boolean> {
    const { orgId, customerName, customerPhone, customerEmail, date, time, subject, companyName, channelOrigin, isReschedule } = params;

    try {
      const { data: teamMembers } = await supabaseAdmin
        .from('team_members')
        .select('email, role')
        .eq('org_id', orgId)
        .in('role', ['OWNER', 'ADMIN', 'AGENT']);

      const { data: orgData } = await supabaseAdmin
        .from('organizations')
        .select('name, email')
        .eq('id', orgId)
        .maybeSingle();

      const resolvedOrgName = companyName || orgData?.name || 'sua organização';
      const teamEmails = (teamMembers || []).map(m => m.email).filter(Boolean);
      const orgEmail = orgData?.email ? [orgData.email] : [];
      const vipEmails = (process.env.VIP_EMAILS || '')
        .split(',')
        .map(e => e.trim())
        .filter(e => e.includes('@'));

      const allRecipients = Array.from(new Set([...teamEmails, ...orgEmail, ...vipEmails]));

      if (allRecipients.length === 0) {
        console.warn(`[EmailService] ⚠️ Nenhum destinatário para email de novo agendamento na org ${orgId}`);
        return false;
      }

      const host = process.env.SMTP_HOST;
      const port = parseInt(process.env.SMTP_PORT || '587', 10);
      const user = process.env.SMTP_USER;
      const pass = process.env.SMTP_PASS;
      const from = `${resolvedOrgName} <${user || 'no-reply@orion.com'}>`;

      if (!user || !pass) {
        console.warn(`[EmailService] ⚠️ SMTP não configurado. Simulação de email de agendamento à empresa para ${allRecipients.join(', ')}.`);
        return true;
      }

      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });

      const actionTitle = isReschedule ? 'Agendamento Remarcado' : 'Novo Agendamento Confirmado';
      const badgeText = isReschedule ? '🔄 REMARCAÇÃO DE CONSULTA' : '📅 NOVO AGENDAMENTO';
      const liveChatUrl = `${process.env.VITE_APP_URL || 'http://localhost:3000'}/dashboard/live-chat`;

      const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; }
          .header { background: linear-gradient(135deg, #059669 0%, #064e3b 100%); padding: 32px 20px; text-align: center; color: #ffffff; }
          .badge { display: inline-block; background-color: rgba(255,255,255,0.2); padding: 5px 14px; border-radius: 9999px; font-size: 12px; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 10px; }
          .header h1 { margin: 0; font-size: 22px; font-weight: 800; }
          .content { padding: 30px; color: #1e293b; line-height: 1.6; }
          .card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin: 20px 0; }
          .row { margin-bottom: 12px; font-size: 15px; }
          .label { font-weight: 700; color: #475569; }
          .value { font-weight: 600; color: #0f172a; }
          .btn { background-color: #059669; color: #ffffff !important; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 700; display: inline-block; margin-top: 15px; text-align: center; }
          .footer { background-color: #f8fafc; padding: 20px; text-align: center; font-size: 13px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <span class="badge">${badgeText}</span>
            <h1>${actionTitle}</h1>
            <p style="margin: 6px 0 0 0; opacity: 0.95;">Organização: ${resolvedOrgName}</p>
          </div>
          <div class="content">
            <p>Olá equipa <strong>${resolvedOrgName}</strong>,</p>
            <p>Foi ${isReschedule ? 'remarcada' : 'registada'} com sucesso uma nova marcação de atendimento via <strong>${channelOrigin || 'Chatbot IA'}</strong>.</p>
            <div class="card">
              <div class="row"><span class="label">👤 Cliente:</span> <span class="value">${customerName}</span></div>
              <div class="row"><span class="label">📅 Data:</span> <span class="value">${date}</span></div>
              <div class="row"><span class="label">⏰ Horário:</span> <span class="value">${time}</span></div>
              <div class="row"><span class="label">📋 Assunto / Serviço:</span> <span class="value">${subject}</span></div>
              ${customerPhone ? `<div class="row"><span class="label">📞 Telefone / WhatsApp:</span> <span class="value">${customerPhone}</span></div>` : ''}
              ${customerEmail ? `<div class="row"><span class="label">✉️ E-mail:</span> <span class="value">${customerEmail}</span></div>` : ''}
              <div class="row"><span class="label">🌐 Canal de Origem:</span> <span class="value">${channelOrigin || 'Chatbot Orion'}</span></div>
            </div>
            <div style="text-align: center;">
              <a href="${liveChatUrl}" class="btn">Visualizar Conversa no Live Chat</a>
            </div>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Orion AI Platform. Notificação automática de agendamento.</p>
          </div>
        </div>
      </body>
      </html>
      `;

      await transporter.sendMail({
        from,
        to: allRecipients,
        subject: `📅 ${actionTitle}: ${customerName} - ${date} às ${time} (${resolvedOrgName})`,
        html: htmlContent,
      });

      console.log(`[EmailService] ✅ Email de notificação de agendamento enviado para a empresa (${allRecipients.join(', ')})`);
      return true;
    } catch (err: any) {
      console.error('[EmailService] ❌ Erro ao enviar email de notificação à empresa:', err.message);
      return false;
    }
  }
}
