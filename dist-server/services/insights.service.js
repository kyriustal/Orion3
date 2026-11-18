"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InsightsService = void 0;
// ─────────────────────────────────────────────────────────────────────────────
//  InsightsService — Registo de interações da IA para métricas de qualidade
//  (Fase 1 do Analytics de Qualidade da IA — alimenta a página Insights)
// ─────────────────────────────────────────────────────────────────────────────
const supabase_1 = require("../config/supabase");
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
};
