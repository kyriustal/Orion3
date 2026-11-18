// ─────────────────────────────────────────────────────────────────────────────
//  InsightsService — Registo de interações da IA para métricas de qualidade
//  (Fase 1 do Analytics de Qualidade da IA — alimenta a página Insights)
// ─────────────────────────────────────────────────────────────────────────────
import { supabaseAdmin } from '../config/supabase';

export type AIChannel =
  | 'whatsapp'
  | 'instagram'
  | 'facebook'
  | 'email'
  | 'webchat'
  | 'tiktok'
  | 'sms'
  | (string & {});

export interface AIInteractionRecord {
  orgId: string;
  channel: AIChannel;
  customerPhone: string;
  customerMessage?: string;
  success: boolean;
  transferred?: boolean;   // cliente pediu atendimento humano
  bookingCreated?: boolean; // interação gerou agendamento
  proposal?: boolean;       // proposta comercial detectada
  confirm?: boolean;        // dúvida fora da base de conhecimento
  attempts?: number;        // tentativas do protocolo de auto-cura (1-3)
  responseLatencyMs?: number;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

// ─── Agregação para a página Insights ─────────────────────────────────────────

export interface InsightsSummary {
  total: number;
  success: number;
  failures: number;
  transferred: number;
  bookings: number;
  proposals: number;
  confirms: number;
  resolutionRate: number;       // % interações sem transferência nem falha
  avgLatencyMs: number | null;
  avgAttempts: number | null;
  byChannel: Record<string, { total: number; transferred: number; bookings: number; failures: number }>;
  dailySeries: Array<{ date: string; total: number; transferred: number; bookings: number; failures: number }>;
  topHandoffCustomers: Array<{ phone: string; transfers: number; channel: string }>;
  recentFailures: Array<{ customer_phone: string; channel: string; error: string; created_at: string }>;
}

export type InsightsPeriod = '24h' | '7d' | '30d' | '90d';

function periodStart(period: InsightsPeriod): string {
  const ms = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
  }[period] ?? 24 * 60 * 60 * 1000;
  return new Date(Date.now() - ms).toISOString();
}

export const InsightsService = {
  /**
   * Regista uma interação da IA de forma assíncrona (fire-and-forget).
   * Nunca bloqueia o fluxo principal nem lança erros — falhas são apenas logadas.
   */
  recordAIInteraction(record: AIInteractionRecord): void {
    try {
      const row = {
        org_id: record.orgId,
        channel: record.channel,
        customer_phone: record.customerPhone,
        customer_message: record.customerMessage?.substring(0, 2000) || null,
        success: record.success,
        transferred: record.transferred ?? false,
        booking_created: record.bookingCreated ?? false,
        proposal: record.proposal ?? false,
        confirm: record.confirm ?? false,
        attempts: record.attempts ?? 1,
        response_latency_ms: record.responseLatencyMs ?? null,
        error_message: record.errorMessage?.substring(0, 500) || null,
        metadata: record.metadata ?? {},
      };

      Promise.resolve(supabaseAdmin.from('ai_interactions').insert(row))
        .then(({ error }) => {
          if (error) {
            console.warn('[INSIGHTS] Falha ao registar interação da IA:', error.message);
          }
        })
        .catch((err: any) => {
          console.warn('[INSIGHTS] Erro inesperado ao registar interação:', err?.message);
        });
    } catch (err: any) {
      console.warn('[INSIGHTS] Erro ao preparar registo de interação:', err?.message);
    }
  },

  /**
   * Agrega métricas de qualidade da IA para a página Insights.
   * Busca as linhas do período e agrega em memória (volume moderado por org).
   */
  async getSummary(orgId: string, period: InsightsPeriod = '7d', channel = 'all'): Promise<InsightsSummary> {
    let query = supabaseAdmin
      .from('ai_interactions')
      .select('channel, customer_phone, success, transferred, booking_created, proposal, confirm, attempts, response_latency_ms, error_message, created_at')
      .eq('org_id', orgId)
      .gte('created_at', periodStart(period))
      .order('created_at', { ascending: false })
      .limit(10000);

    if (channel !== 'all') {
      query = query.eq('channel', channel);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];

    const total = rows.length;
    const failures = rows.filter(r => !r.success).length;
    const transferred = rows.filter(r => r.transferred).length;
    const bookings = rows.filter(r => r.booking_created).length;
    const proposals = rows.filter(r => r.proposal).length;
    const confirms = rows.filter(r => r.confirm).length;

    const latencies = rows.map(r => r.response_latency_ms).filter((v): v is number => typeof v === 'number' && v > 0);
    const avgLatencyMs = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;

    const attemptsList = rows.map(r => r.attempts).filter((v): v is number => typeof v === 'number' && v > 0);
    const avgAttempts = attemptsList.length
      ? Math.round((attemptsList.reduce((a, b) => a + b, 0) / attemptsList.length) * 100) / 100
      : null;

    const resolutionRate = total > 0 ? Math.round(((total - transferred - failures) / total) * 1000) / 10 : 100;

    // Por canal
    const byChannel: InsightsSummary['byChannel'] = {};
    for (const r of rows) {
      const ch = r.channel || 'desconhecido';
      if (!byChannel[ch]) byChannel[ch] = { total: 0, transferred: 0, bookings: 0, failures: 0 };
      byChannel[ch].total++;
      if (r.transferred) byChannel[ch].transferred++;
      if (r.booking_created) byChannel[ch].bookings++;
      if (!r.success) byChannel[ch].failures++;
    }

    // Série diária
    const dailyMap = new Map<string, { total: number; transferred: number; bookings: number; failures: number }>();
    for (const r of rows) {
      const day = (r.created_at || '').substring(0, 10);
      if (!day) continue;
      if (!dailyMap.has(day)) dailyMap.set(day, { total: 0, transferred: 0, bookings: 0, failures: 0 });
      const d = dailyMap.get(day)!;
      d.total++;
      if (r.transferred) d.transferred++;
      if (r.booking_created) d.bookings++;
      if (!r.success) d.failures++;
    }
    const dailySeries = Array.from(dailyMap.entries())
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Clientes com mais transferências para humano
    const transferMap = new Map<string, { transfers: number; channel: string }>();
    for (const r of rows) {
      if (!r.transferred) continue;
      const key = r.customer_phone;
      if (!transferMap.has(key)) transferMap.set(key, { transfers: 0, channel: r.channel });
      transferMap.get(key)!.transfers++;
    }
    const topHandoffCustomers = Array.from(transferMap.entries())
      .map(([phone, v]) => ({ phone, ...v }))
      .sort((a, b) => b.transfers - a.transfers)
      .slice(0, 5);

    // Falhas recentes (para alertas)
    const recentFailures = rows
      .filter(r => !r.success)
      .slice(0, 10)
      .map(r => ({
        customer_phone: r.customer_phone,
        channel: r.channel,
        error: (r.error_message || 'Erro desconhecido').substring(0, 200),
        created_at: r.created_at,
      }));

    return {
      total,
      success: total - failures,
      failures,
      transferred,
      bookings,
      proposals,
      confirms,
      resolutionRate,
      avgLatencyMs,
      avgAttempts,
      byChannel,
      dailySeries,
      topHandoffCustomers,
      recentFailures,
    };
  },
};
