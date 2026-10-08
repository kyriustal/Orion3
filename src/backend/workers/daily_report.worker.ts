import fs from 'fs';
import path from 'path';
import { supabaseAdmin } from '../config/supabase';
import { ReportService } from '../services/report.service';

/**
 * Worker Autónomo para Envio Automático do Relatório a cada 7 dias às 23:59 (Horário de Angola / WAT)
 * Funciona de forma 100% autónoma, sem necessidade de intervenção ou clique em botões.
 * Fuso horário: Africa/Luanda (UTC+1)
 *
 * Garantias anti-duplicação:
 *  1. lastTriggeredDate é persistido em disco — sobrevive a reinícios do servidor.
 *  2. O intervalo de polling é de 60 s (não 30 s), pelo que 23:59 só pode ser detectado uma vez
 *     por ciclo de minuto.
 *  3. Por organização, o mapa orgLastSentMap garante o espaçamento mínimo de 7 dias.
 */
export class DailyReportWorker {
  private static ANGOLA_TZ        = 'Africa/Luanda';
  private static intervalHandle: any = null;
  private static STATE_FILE = path.resolve(process.cwd(), 'data', 'periodic_reports_state.json');

  // Estado persistido em disco
  private static lastTriggeredDate = '';                        // 'YYYY-MM-DD' da última execução global
  private static orgLastSentMap    = new Map<string, number>(); // orgId → timestamp ms do último envio

  // ─── Persistência ──────────────────────────────────────────────────────────

  private static loadState() {
    try {
      if (fs.existsSync(this.STATE_FILE)) {
        const raw    = fs.readFileSync(this.STATE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object' && parsed !== null) {
          // Campo global de lock
          if (typeof parsed.__lastTriggeredDate === 'string') {
            this.lastTriggeredDate = parsed.__lastTriggeredDate;
          }
          // Mapa por organização
          for (const [k, v] of Object.entries(parsed)) {
            if (k !== '__lastTriggeredDate' && typeof v === 'number') {
              this.orgLastSentMap.set(k, v);
            }
          }
        }
      }
    } catch (_) {}
  }

  private static saveState() {
    try {
      const dir = path.dirname(this.STATE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const obj: Record<string, any> = { __lastTriggeredDate: this.lastTriggeredDate };
      for (const [k, v] of this.orgLastSentMap.entries()) {
        obj[k] = v;
      }
      fs.writeFileSync(this.STATE_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (_) {}
  }

  // ─── Ciclo de Vida ─────────────────────────────────────────────────────────

  static start() {
    this.loadState();
    console.log('⏰ [PERIODIC-REPORT-WORKER] Worker de Relatórios Periódicos (7 Dias) iniciado. Monitorando ciclo automático (WAT / Angola)...');

    // Verificar a cada 60 segundos (garante que 23:59 é detetado uma única vez por minuto)
    this.intervalHandle = setInterval(() => {
      this.checkAndTriggerWeeklyReport();
    }, 60 * 1000);

    // Verificação inicial após 15 segundos do arranque
    setTimeout(() => {
      this.checkAndTriggerWeeklyReport();
    }, 15 * 1000);
  }

  static stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  // ─── Lógica de Disparo ─────────────────────────────────────────────────────

  /**
   * Avalia se é 23:59 WAT e se ainda não disparámos hoje.
   * O lock é duplo: memória + disco, para sobreviver a reinícios.
   */
  private static async checkAndTriggerWeeklyReport() {
    try {
      const now = new Date();

      // Hora atual em Angola (HH:MM)
      const timeStr = new Intl.DateTimeFormat('pt-PT', {
        timeZone: this.ANGOLA_TZ,
        hour:   '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(now);

      // Chave da data em Angola (YYYY-MM-DD)
      const dateKey = new Intl.DateTimeFormat('sv-SE', {   // sv-SE devolve ISO 'YYYY-MM-DD' nativamente
        timeZone: this.ANGOLA_TZ,
      }).format(now);

      // Só dispara às 23:59 WAT e apenas se ainda não disparámos hoje
      if (timeStr !== '23:59' || this.lastTriggeredDate === dateKey) return;

      // Gravar lock antes de disparar (evita segundo disparo mesmo que o servidor reinicie a meio)
      this.lastTriggeredDate = dateKey;
      this.saveState();

      console.log(`\n======================================================`);
      console.log(`⏰ [PERIODIC-REPORT-WORKER] 23:59 WAT atingido! Verificando organizações elegíveis (${dateKey})...`);
      console.log(`======================================================\n`);

      await this.dispatchReportsToAllOrganizations();
    } catch (err: any) {
      console.error('[PERIODIC-REPORT-WORKER] Erro no ciclo de verificação:', err.message);
    }
  }

  /**
   * Dispara o relatório consolidado de 7 dias para todas as organizações registadas.
   * Cada organização só recebe o relatório se já passaram pelo menos 7 dias desde o último envio.
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
      const nowMs         = Date.now();

      console.log(`[PERIODIC-REPORT-WORKER] A avaliar envio a cada 7 dias para ${orgs?.length || 0} organização(ões)...`);

      for (const org of (orgs || [])) {
        try {
          const lastSent         = this.orgLastSentMap.get(org.id) || 0;
          const timeSinceLastSent = nowMs - lastSent;

          // Enviar apenas se passaram 7 dias (ou se for o primeiro envio / forçado)
          if (!force && lastSent !== 0 && timeSinceLastSent < SEVEN_DAYS_MS) {
            const daysRemaining = ((SEVEN_DAYS_MS - timeSinceLastSent) / (24 * 3600 * 1000)).toFixed(1);
            console.log(`[PERIODIC-REPORT-WORKER] ℹ️  ${org.name}: próximo envio em ${daysRemaining} dia(s).`);
            continue;
          }

          console.log(`[PERIODIC-REPORT-WORKER] 📊 A compilar relatório de 7 dias para: ${org.name || org.id}...`);

          const result = await ReportService.sendDailyReportEmail(org.id, '7d');

          if (result.success) {
            // Registar timestamp do envio imediatamente e persistir
            this.orgLastSentMap.set(org.id, nowMs);
            this.saveState();
            console.log(`[PERIODIC-REPORT-WORKER] ✅ Relatório enviado para ${org.name}: ${result.recipients.join(', ')} (${result.numbersCount} números WhatsApp)`);
          } else {
            console.warn(`[PERIODIC-REPORT-WORKER] ⚠️  Aviso no envio para ${org.name}: ${result.error}`);
          }
        } catch (orgErr: any) {
          console.error(`[PERIODIC-REPORT-WORKER] ❌ Falha na org ${org.id}:`, orgErr.message);
        }
      }
    } catch (err: any) {
      console.error('[PERIODIC-REPORT-WORKER] Erro geral ao disparar relatórios:', err.message);
    }
  }
}

// Iniciar worker automaticamente ao importar
DailyReportWorker.start();
