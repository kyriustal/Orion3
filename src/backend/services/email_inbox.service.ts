import tls from 'tls';
import net from 'net';
import nodemailer from 'nodemailer';
import { supabaseAdmin } from '../config/supabase';

export interface EmailInboxConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  tls: boolean;
}

export interface ParsedEmail {
  messageId: string;
  subject: string;
  from: string;
  fromAddress: string;
  to: string;
  text: string;
  html?: string;
  date: Date;
  inReplyTo?: string;
  references?: string;
}

/**
 * IMAP client nativo via TLS/Socket (sem dependências externas pesadas)
 * Compatível com Gmail, Outlook, Hostinger, cPanel, Zimbra, etc.
 */
class SimpleImapClient {
  private socket: tls.TLSSocket | net.Socket | null = null;
  private buffer = '';
  private tagCounter = 1;

  async connect(config: EmailInboxConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = 12000;
      let timer = setTimeout(() => {
        if (this.socket) this.socket.destroy();
        reject(new Error('IMAP connection timed out'));
      }, timeout);

      const onConnect = () => {
        clearTimeout(timer);
      };

      if (config.tls !== false) {
        this.socket = tls.connect({
          host: config.host,
          port: config.port || 993,
          rejectUnauthorized: false,
          timeout,
        }, onConnect);
      } else {
        this.socket = net.connect({
          host: config.host,
          port: config.port || 143,
          timeout,
        }, onConnect);
      }

      this.socket.setEncoding('utf8');

      this.socket.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      // Aguarda greeting "* OK"
      const onGreeting = (chunk: string) => {
        this.buffer += chunk;
        if (this.buffer.includes('* OK')) {
          this.socket?.removeListener('data', onGreeting);
          resolve();
        }
      };
      this.socket.on('data', onGreeting);
    });
  }

  async sendCommand(cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Socket not connected'));

      const tag = `A${this.tagCounter++}`;
      let response = '';

      const onData = (data: string) => {
        response += data;
        if (response.includes(`${tag} OK`) || response.includes(`${tag} NO`) || response.includes(`${tag} BAD`)) {
          this.socket?.removeListener('data', onData);
          if (response.includes(`${tag} OK`)) {
            resolve(response);
          } else {
            reject(new Error(`IMAP command failed: ${response.trim()}`));
          }
        }
      };

      this.socket.on('data', onData);
      this.socket.write(`${tag} ${cmd}\r\n`);
    });
  }

  close() {
    try {
      if (this.socket) {
        this.socket.write(`A99 LOGOUT\r\n`);
        this.socket.end();
      }
    } catch (_) {}
  }
}

/**
 * EmailInboxService — Monitoramento de caixas de entrada de e-mail e respostas automáticas
 */
export class EmailInboxService {
  /**
   * Conecta via IMAP nativo e busca mensagens não lidas
   */
  static async fetchUnreadEmails(config: EmailInboxConfig): Promise<ParsedEmail[]> {
    const client = new SimpleImapClient();
    const emails: ParsedEmail[] = [];

    try {
      await client.connect(config);

      // Login
      const safeUser = config.user.replace(/"/g, '\\"');
      const safePass = config.password.replace(/"/g, '\\"');
      await client.sendCommand(`LOGIN "${safeUser}" "${safePass}"`);

      // Selecionar caixa de entrada
      await client.sendCommand('SELECT INBOX');

      // Buscar não lidos
      const searchRes = await client.sendCommand('SEARCH UNSEEN');
      const match = searchRes.match(/\* SEARCH\s*([0-9 ]+)/i);
      if (!match || !match[1].trim()) {
        client.close();
        return [];
      }

      const seqIds = match[1].trim().split(/\s+/).filter(Boolean);
      // Limitar a 10 e-mails por ciclo para evitar throttling
      const toFetch = seqIds.slice(0, 10);

      for (const id of toFetch) {
        try {
          const fetchRes = await client.sendCommand(`FETCH ${id} (BODY[HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID IN-REPLY-TO REFERENCES)] BODY[TEXT])`);

          // Parse dos cabeçalhos
          const subjectMatch = fetchRes.match(/Subject:\s*(.+?)(?:\r?\n[A-Z-]+:|\r?\n\r?\n)/is);
          const fromMatch = fetchRes.match(/From:\s*(.+?)(?:\r?\n[A-Z-]+:|\r?\n\r?\n)/is);
          const toMatch = fetchRes.match(/To:\s*(.+?)(?:\r?\n[A-Z-]+:|\r?\n\r?\n)/is);
          const dateMatch = fetchRes.match(/Date:\s*(.+?)(?:\r?\n[A-Z-]+:|\r?\n\r?\n)/is);
          const msgIdMatch = fetchRes.match(/Message-ID:\s*(.+?)(?:\r?\n[A-Z-]+:|\r?\n\r?\n)/is);
          const inReplyMatch = fetchRes.match(/In-Reply-To:\s*(.+?)(?:\r?\n[A-Z-]+:|\r?\n\r?\n)/is);
          const refMatch = fetchRes.match(/References:\s*(.+?)(?:\r?\n[A-Z-]+:|\r?\n\r?\n)/is);

          const fromRaw = fromMatch ? fromMatch[1].trim().replace(/\r?\n\s+/g, ' ') : '';
          const addressMatch = fromRaw.match(/<([^>]+)>/);
          const fromAddress = addressMatch ? addressMatch[1] : fromRaw.trim();
          const fromName = fromRaw.replace(/<[^>]+>/, '').trim().replace(/^["']|["']$/g, '') || fromAddress;

          // Parse simplificado do corpo do texto
          const bodyTextMatch = fetchRes.match(/BODY\[TEXT\](?:\s*\{[0-9]+\})?\r?\n([\s\S]+?)(?:\r?\n\)\r?\n|\r?\nA\d+ OK)/i);
          let bodyText = bodyTextMatch ? bodyTextMatch[1].trim() : '';

          // Marcar como visto
          await client.sendCommand(`STORE ${id} +FLAGS (\\Seen)`);

          emails.push({
            messageId: msgIdMatch ? msgIdMatch[1].trim() : `${Date.now()}_${id}`,
            subject: subjectMatch ? subjectMatch[1].trim().replace(/\r?\n\s+/g, ' ') : '(Sem assunto)',
            from: fromName,
            fromAddress,
            to: toMatch ? toMatch[1].trim() : '',
            text: bodyText || '(Mensagem sem texto legível)',
            date: dateMatch ? new Date(dateMatch[1].trim()) : new Date(),
            inReplyTo: inReplyMatch ? inReplyMatch[1].trim() : undefined,
            references: refMatch ? refMatch[1].trim() : undefined,
          });
        } catch (fetchErr: any) {
          console.warn(`[EMAIL-INBOX] Erro ao ler mensagem ID ${id}:`, fetchErr.message);
        }
      }

      client.close();
      return emails;
    } catch (err: any) {
      client.close();
      console.error('[EMAIL-INBOX] Erro na leitura IMAP:', err.message);
      return [];
    }
  }

  /**
   * Envia resposta de e-mail com threading completo (In-Reply-To e References)
   */
  static async sendReply(params: {
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    smtpFrom: string;
    to: string;
    subject: string;
    body: string;
    inReplyTo?: string;
    references?: string;
  }): Promise<boolean> {
    try {
      const transporter = nodemailer.createTransport({
        host: params.smtpHost,
        port: params.smtpPort,
        secure: params.smtpPort === 465,
        auth: { user: params.smtpUser, pass: params.smtpPass },
        tls: { rejectUnauthorized: false },
      });

      const subject = params.subject.startsWith('Re:') ? params.subject : `Re: ${params.subject}`;

      const mailOptions: any = {
        from: params.smtpFrom,
        to: params.to,
        subject,
        text: params.body,
        html: `<p style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b;">${params.body.replace(/\n/g, '<br>')}</p>`,
      };

      if (params.inReplyTo) mailOptions['In-Reply-To'] = params.inReplyTo;
      if (params.references) mailOptions['References'] = params.references;

      await transporter.sendMail(mailOptions);
      console.log(`[EMAIL-INBOX] Resposta enviada com sucesso para ${params.to} | Assunto: ${subject}`);
      return true;
    } catch (err: any) {
      console.error('[EMAIL-INBOX] Erro ao enviar resposta via SMTP:', err.message);
      return false;
    }
  }

  /**
   * Obtém a configuração de caixa de entrada de uma organização
   */
  static async getOrgEmailConfig(orgId: string): Promise<any | null> {
    const { data } = await supabaseAdmin
      .from('email_inbox_config')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .maybeSingle();
    return data || null;
  }
}
