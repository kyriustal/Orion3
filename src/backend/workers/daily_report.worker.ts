import fs from 'fs';
import path from 'path';
import { supabaseAdmin } from '../config/supabase';
import { ReportService } from '../services/report.service';

/**
 * Worker Autónomo para Envio Automático do Relatório a cada 7 dias às 23:59 (Horário de Angola / WAT)
 * Funciona de forma 100% autónoma, sem necessidade de intervenção ou clique em botões.
 * Fuso horário: Africa/Luanda (UTC+1)
 */
export class DailyReportWorker {
  private static ANGOLA_TZ = 'Africa/Luanda';
  private static lastTriggeredDate = '';
  private static intervalHandle: any = null;
  private static STATE_FILE = path.resolve(process.cwd(), 'data', 'periodic_reports_state.json');
  // Cache de memória para registo da data do último envio por organização
  private static orgLastSentMap = new Map<string, number>();

  private static loadState() {
    try {
      if (fs.existsSync(this.STATE_FILE)) {
        const raw = fs.readFileSync(this.STATE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object' && parsed !== null) {
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === 'number') this.orgLastSentMap.set(k, v);
          }
        }
      }
    } catch (_) {}
  }

  private static saveState() {
    try {
      const dir = path.dirname(this.STATE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const obj: Record<string, number> = {};
      for (const [k, v] of this.orgLastSentMap.entries()) {
        obj[k] = v;
      }
      fs.writeFileSync(this.STATE_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (_) {}
  }

  static start() {
    this.loadState();
    console.log('⏰ [PERIODIC-REPORT-WORKER] Worker de Relatórios Periódicos (7 Dias) iniciado. Monitorando ciclo automático (WAT / Angola)...');

    // Verificar a cada 30 segundos se é hora de disparo automático
    this.intervalHandle = setInterval(() => {
      this.checkAndTriggerWeeklyReport();
    }, 30 * 1000);

    // Verificação inicial após 10 segundos do arranque
    setTimeout(() => {
      this.checkAndTriggerWeeklyReport();
    }, 10 * 1000);
  }

  static stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * Avalia o ciclo de 7 dias e dispara automaticamente o relatório
   */
  private static async checkAndTriggerWeeklyReport() {
    try {
      const now = new Date();

      // Formatar hora e minuto atuais em Angola
      const timeStr = new Intl.DateTimeFormat('pt-PT', {
        timeZone: this.ANGOLA_TZ,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(now);

      // Formatar chave da data em Angola (ex: 2026-10-01)
      const dateKey = new Intl.DateTimeFormat('pt-PT', {
        timeZone: this.ANGOLA_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(now);

      // Disparar às 23:59 WAT (apenas uma vez por ciclo)
      if (timeStr === '23:59' && this.lastTriggeredDate !== dateKey) {
        this.lastTriggeredDate = dateKey;
        console.log(`\n======================================================`);
        console.log(`⏰ [PERIODIC-REPORT-WORKER] 23:59 WAT atingido! Verificando organizações elegíveis para relatório de 7 dias (${dateKey})...`);
        console.log(`======================================================\n`);

        await this.dispatchReportsToAllOrganizations();
      }
    } catch (err: any) {
      console.error('[PERIODIC-REPORT-WORKER] Erro no ciclo de verificação:', err.message);
    }
  }

  /**
   * Dispara o relatório consolidado de 7 dias para todas as organizações registadas
   * Garantindo que cada organização recebe o relatório a cada 7 dias automaticamente.
   */
  static async dispatchReportsToAllOrganizations(force = false) {
    try {
      const { data: orgs, error } = await supabaseAdmin
        .from('organizations')
        .select('id, name, owner_email');

      if (error) {
        console.error('[PERIODIC-REPORT-WORKER] Erro ao carregar organizações:', error.message);
        return;
      }

      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      const nowMs = Date.now();

      console.log(`[PERIODIC-REPORT-WORKER] A avaliar envio a cada 7 dias para ${orgs?.length || 0} organização(ões)...`);

      for (const org of (orgs || [])) {
        try {
          const lastSent = this.orgLastSentMap.get(org.id) || 0;
          const timeSinceLastSent = nowMs - lastSent;

          // Se passaram 7 dias desde o último envio (ou primeiro envio ou forçado)
          if (force || lastSent === 0 || timeSinceLastSent >= SEVEN_DAYS_MS) {
            console.log(`[PERIODIC-REPORT-WORKER] 📊 A compilar relatório automático de 7 dias para: ${org.name || org.id}...`);
            
            // Enviar relatório com período de 7 dias (WhatsApp, Facebook, Instagram)
            const result = await ReportService.sendDailyReportEmail(org.id, '7d');
            
            if (result.success) {
              this.orgLastSentMap.set(org.id, nowMs);
              this.saveState();
              console.log(`[PERIODIC-REPORT-WORKER] ✅ Relatório de 7 dias enviado com sucesso para ${org.name}: ${result.recipients.join(', ')} (Números WhatsApp: ${result.numbersCount})`);
            } else {
              console.warn(`[PERIODIC-REPORT-WORKER] ⚠️ Aviso no envio para ${org.name}: ${result.error}`);
            }
          } else {
            const daysRemaining = ((SEVEN_DAYS_MS - timeSinceLastSent) / (24 * 3600 * 1000)).toFixed(1);
            console.log(`[PERIODIC-REPORT-WORKER] ℹ️ Organização ${org.name}: Próximo envio agendado em ${daysRemaining} dia(s).`);
          }
        } catch (orgErr: any) {
          console.error(`[PERIODIC-REPORT-WORKER] ❌ Falha no relatório da organização ${org.id}:`, orgErr.message);
        }
      }
    } catch (err: any) {
      console.error('[PERIODIC-REPORT-WORKER] Erro geral ao disparar relatórios:', err.message);
    }
  }
}

// Iniciar worker automaticamente ao importar (sem necessidade de cliques)
DailyReportWorker.start();
