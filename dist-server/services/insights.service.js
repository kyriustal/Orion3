"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InsightsService = void 0;
// ─────────────────────────────────────────────────────────────────────────────
//  InsightsService — Registo de interações da IA para métricas de qualidade
//  (Fase 1 do Analytics de Qualidade da IA — alimenta a página Insights)
// ─────────────────────────────────────────────────────────────────────────────
const supabase_1 = require("../config/supabase");
function periodStart(period) {
    const ms = {
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
        '90d': 90 * 24 * 60 * 60 * 1000,
    }[period] ?? 24 * 60 * 60 * 1000;
    return new Date(Date.now() - ms).toISOString();
}
exports.InsightsService = {
    /**
     * Regista uma interação da IA de forma assíncrona (fire-and-forget).
     * Nunca bloqueia o fluxo principal nem lança erros — falhas são apenas logadas.
     */
    recordAIInteraction(record) {
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
            Promise.resolve(supabase_1.supabaseAdmin.from('ai_interactions').insert(row))
                .then(({ error }) => {
                if (error) {
                    console.warn('[INSIGHTS] Falha ao registar interação da IA:', error.message);
                }
            })
                .catch((err) => {
                console.warn('[INSIGHTS] Erro inesperado ao registar interação:', err?.message);
            });
        }
        catch (err) {
            console.warn('[INSIGHTS] Erro ao preparar registo de interação:', err?.message);
        }
    },
    /**
     * Agrega métricas de qualidade da IA para a página Insights.
     * Busca as linhas do período e agrega em memória (volume moderado por org).
     */
    async getSummary(orgId, period = '7d', channel = 'all') {
        let query = supabase_1.supabaseAdmin
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
        if (error)
            throw error;
        const rows = data || [];
        const total = rows.length;
        const failures = rows.filter(r => !r.success).length;
        const transferred = rows.filter(r => r.transferred).length;
        const bookings = rows.filter(r => r.booking_created).length;
        const proposals = rows.filter(r => r.proposal).length;
        const confirms = rows.filter(r => r.confirm).length;
        const latencies = rows.map(r => r.response_latency_ms).filter((v) => typeof v === 'number' && v > 0);
        const avgLatencyMs = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
        const attemptsList = rows.map(r => r.attempts).filter((v) => typeof v === 'number' && v > 0);
        const avgAttempts = attemptsList.length
            ? Math.round((attemptsList.reduce((a, b) => a + b, 0) / attemptsList.length) * 100) / 100
            : null;
        const resolutionRate = total > 0 ? Math.round(((total - transferred - failures) / total) * 1000) / 10 : 100;
        // Por canal
        const byChannel = {};
        for (const r of rows) {
            const ch = r.channel || 'desconhecido';
            if (!byChannel[ch])
                byChannel[ch] = { total: 0, transferred: 0, bookings: 0, failures: 0 };
            byChannel[ch].total++;
            if (r.transferred)
                byChannel[ch].transferred++;
            if (r.booking_created)
                byChannel[ch].bookings++;
            if (!r.success)
                byChannel[ch].failures++;
        }
        // Série diária
        const dailyMap = new Map();
        for (const r of rows) {
            const day = (r.created_at || '').substring(0, 10);
            if (!day)
                continue;
            if (!dailyMap.has(day))
                dailyMap.set(day, { total: 0, transferred: 0, bookings: 0, failures: 0 });
            const d = dailyMap.get(day);
            d.total++;
            if (r.transferred)
                d.transferred++;
            if (r.booking_created)
                d.bookings++;
            if (!r.success)
                d.failures++;
        }
        const dailySeries = Array.from(dailyMap.entries())
            .map(([date, v]) => ({ date, ...v }))
            .sort((a, b) => a.date.localeCompare(b.date));
        // Clientes com mais transferências para humano
        const transferMap = new Map();
        for (const r of rows) {
            if (!r.transferred)
                continue;
            const key = r.customer_phone;
            if (!transferMap.has(key))
                transferMap.set(key, { transfers: 0, channel: r.channel });
            transferMap.get(key).transfers++;
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
