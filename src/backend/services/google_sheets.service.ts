import axios from 'axios';
import { supabaseAdmin } from '../config/supabase';

export interface SyncInteractionParams {
  orgId: string;
  channel: 'whatsapp' | 'facebook' | 'instagram' | 'livechat';
  phoneOrId: string;
  name?: string;
  text?: string;
  email?: string;
  subject?: string;
  status?: string;
}

export interface SyncBookingParams {
  orgId: string;
  name: string;
  subject: string;
  phone?: string;
  email?: string;
  date: string;
  time: string;
  channel?: string;
  status?: string;
}

export class GoogleSheetsService {
  /**
   * Obtém a URL do Webhook do Google Apps Script configurada para a organização
   */
  static async getWebhookUrl(orgId?: string): Promise<string | null> {
    if (orgId) {
      try {
        const { data: org } = await supabaseAdmin
          .from('organizations')
          .select('google_sheets_webhook_url')
          .eq('id', orgId)
          .maybeSingle();

        if (org?.google_sheets_webhook_url?.trim()) {
          return org.google_sheets_webhook_url.trim();
        }
      } catch (err: any) {
        // Se a coluna ainda não existir no schema do banco, silenciar e prosseguir para o fallback
      }
    }

    return process.env.GOOGLE_SCRIPT_WEBAPP_URL?.trim() || null;
  }

  /**
   * Salva a URL do Webhook do Google Apps Script para a organização
   */
  static async setWebhookUrl(orgId: string, url: string): Promise<boolean> {
    try {
      const { error } = await supabaseAdmin
        .from('organizations')
        .update({ google_sheets_webhook_url: url.trim() })
        .eq('id', orgId);

      if (error) {
        console.warn('[GoogleSheetsService] Coluna google_sheets_webhook_url não encontrada. Criando via fallback...');
        return false;
      }
      return true;
    } catch (err: any) {
      console.error('[GoogleSheetsService] Erro ao salvar webhook URL:', err.message);
      return false;
    }
  }

  /**
   * Sincroniza uma interação/mensagem (WhatsApp, Facebook, Instagram ou Live Chat)
   * Executa de forma assíncrona sem bloquear a resposta ao utilizador.
   */
  static async syncInteraction(params: SyncInteractionParams): Promise<void> {
    const webhookUrl = await this.getWebhookUrl(params.orgId);
    if (!webhookUrl) return;

    const payload = {
      type: 'message',
      channel: params.channel,
      phone: params.phoneOrId,
      customer_phone: params.phoneOrId,
      name: params.name || 'Cliente',
      email: params.email || '',
      message: params.text || params.subject || '',
      subject: params.subject || '',
      status: params.status || 'Ativo',
      timestamp: new Date().toISOString()
    };

    axios.post(webhookUrl, payload, { timeout: 8000 })
      .then(res => {
        if (res.data?.success) {
          console.log(`[GoogleSheetsSync] ✅ Interação (${params.channel.toUpperCase()}) enviada com sucesso para a folha Google!`);
        }
      })
      .catch(err => {
        console.warn(`[GoogleSheetsSync] ⚠️ Aviso ao sincronizar com Google Sheets: ${err.message}`);
      });
  }

  /**
   * Sincroniza um agendamento com a aba 'Agendamentos' e 'Disparos WhatsApp'
   */
  static async syncBooking(params: SyncBookingParams): Promise<void> {
    const webhookUrl = await this.getWebhookUrl(params.orgId);
    if (!webhookUrl) return;

    const payload = {
      type: 'booking',
      name: params.name,
      phone: params.phone || '',
      email: params.email || '',
      subject: params.subject,
      date: params.date,
      time: params.time,
      channel: params.channel || 'whatsapp',
      status: params.status || 'Confirmado',
      timestamp: new Date().toISOString()
    };

    axios.post(webhookUrl, payload, { timeout: 8000 })
      .then(res => {
        if (res.data?.success) {
          console.log(`[GoogleSheetsSync] 📅 Agendamento de ${params.name} enviado para Google Sheets!`);
        }
      })
      .catch(err => {
        console.warn(`[GoogleSheetsSync] ⚠️ Falha ao sincronizar agendamento no Sheets: ${err.message}`);
      });
  }

  /**
   * Testa a conectividade com o Webhook do Google Apps Script
   */
  static async testConnection(url: string): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      const response = await axios.post(url, {
        type: 'message',
        channel: 'WHATSAPP',
        phone: '244900000000',
        name: 'Teste de Conexão Orion',
        email: 'teste@orion.com',
        message: 'Teste de sincronização em tempo real realizado com sucesso!',
        status: 'Teste'
      }, { timeout: 10000 });

      if (response.data && response.data.success) {
        return {
          success: true,
          message: 'Conexão com Google Sheets bem-sucedida! Dados de teste inseridos na planilha.',
          details: response.data
        };
      }

      return {
        success: false,
        message: response.data?.error || 'A resposta do Google Apps Script não indicou sucesso.'
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Falha ao contactar o Google Apps Script: ${err.message}. Verifique se a implantação do Web App tem acesso concedido a 'Qualquer pessoa'.`
      };
    }
  }
}
