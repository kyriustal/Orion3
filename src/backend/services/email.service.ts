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
  static async sendAlertNotification(orgId: string, type: 'handover' | 'booking', customerPhone: string, customerName: string = 'Cliente', messageText: string = ''): Promise<void> {
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

      const title = type === 'handover' ? '🚨 Pedido de Atendimento Humano' : '📅 Novo Pedido de Agendamento';
      const description = type === 'handover' 
        ? 'A Inteligência Artificial detetou que um cliente solicitou falar com um assistente humano.'
        : 'Um cliente demonstrou interesse em agendar um serviço ou consulta.';

      const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
          .header { background: ${type === 'handover' ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'}; padding: 30px 20px; text-align: center; color: #ffffff; }
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
              <div class="row"><span class="label">Contacto do Cliente:</span> ${customerPhone}</div>
              ${messageText ? '<div class="row"><span class="label">Última Mensagem:</span> "' + messageText + '"</div>' : ''}
            </div>
            <p>Aceda ao painel do Live Chat da Orion para dar seguimento ao contacto.</p>
            <div style="text-align: center;">
              <a href="${process.env.VITE_APP_URL || 'https://orionboot.com'}/dashboard/live-chat" class="btn">Abrir Live Chat</a>
            </div>
          </div>
        </div>
      </body>
      </html>
      `;

      const emails = teamMembers.map(m => m.email).join(', ');

      await transporter.sendMail({
        from,
        to: emails,
        subject: `Orion AI | ${title} - ${customerPhone}`,
        html: htmlContent,
      });

      console.log(`[EmailService] ✅ Alerta (${type}) enviado para a equipa da org ${orgId}`);
    } catch (err: any) {
      console.error(`[EmailService] ❌ Erro ao enviar alerta (${type}):`, err.message);
    }
  }
}
