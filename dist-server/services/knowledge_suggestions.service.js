"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KnowledgeSuggestionsService = void 0;
// ─────────────────────────────────────────────────────────────────────────────
//  KnowledgeSuggestionsService — Auto-melhoria da base de conhecimento
//  Quando a IA não sabe responder (flag `confirm`), a pergunta do cliente é
//  registada e a IA redige uma resposta sugerida. O humano aprova com 1 clique
//  e a resposta entra na base de conhecimento — o bot melhora a cada falha.
// ─────────────────────────────────────────────────────────────────────────────
const supabase_1 = require("../config/supabase");
const genai_text_service_1 = require("./genai_text.service");
/** Normaliza texto para comparação de duplicados */
function normalize(text) {
    return text
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
async function draftAnswer(orgId, question) {
    try {
        // Contexto mínimo da empresa para a resposta sugerida fazer sentido
        const { data: org } = await supabase_1.supabaseAdmin
            .from('organizations')
            .select('name, product_description')
            .eq('id', orgId)
            .maybeSingle();
        const { data: instructions } = await supabase_1.supabaseAdmin
            .from('bot_instructions')
            .select('content')
            .eq('org_id', orgId)
            .order('created_at', { ascending: false })
            .limit(3);
        const context = [
            org?.name ? `Empresa: ${org.name}` : '',
            org?.product_description ? `Descrição: ${org.product_description}` : '',
            ...(instructions || []).map((i) => i.content).filter(Boolean),
        ].filter(Boolean).join('\n');
        const answer = await genai_text_service_1.GenAITextService.generate(`Um cliente fez a seguinte pergunta ao assistente virtual, mas o assistente NÃO soube responder:\n\n"${question}"\n\nRedija uma resposta modelo, clara e útil, que o dono da empresa possa rever e aprovar para ensinar ao assistente. Se faltar informação específica da empresa, escreva a resposta com [COLOCHEtes] indicando o que a empresa deve preencher. Responda APENAS com o texto da resposta sugerida.`, {
            system: `És um redator de base de conhecimento para atendimento ao cliente.\n${context}`,
            temperature: 0.4,
            maxOutputTokens: 600,
        });
        return answer || null;
    }
    catch (err) {
        console.warn('[KNOWLEDGE-SUGGESTIONS] Falha ao redigir resposta sugerida:', err.message);
        return null;
    }
}
exports.KnowledgeSuggestionsService = {
    /**
     * Regista (ou incrementa) uma pergunta não respondida. Fire-and-forget.
     * Se a pergunta já existir como pendente (texto similar), apenas incrementa
     * o contador de ocorrências — evita encher a lista com duplicados.
     */
    recordUnansweredQuestion(input) {
        (async () => {
            const question = input.question.trim().substring(0, 1000);
            if (question.length < 8)
                return; // demasiado curta para ser útil
            const normalized = normalize(question);
            // Procurar duplicados pendentes desta organização (últimas 100)
            const { data: pending } = await supabase_1.supabaseAdmin
                .from('knowledge_suggestions')
                .select('id, question, occurrences')
                .eq('org_id', input.orgId)
                .eq('status', 'pending')
                .order('created_at', { ascending: false })
                .limit(100);
            const duplicate = (pending || []).find((s) => {
                const existing = normalize(s.question || '');
                // Duplicado se um contém o outro (pergunta curta embutida numa maior)
                return existing === normalized ||
                    (normalized.length >= 12 && existing.includes(normalized)) ||
                    (existing.length >= 12 && normalized.includes(existing));
            });
            if (duplicate) {
                await supabase_1.supabaseAdmin
                    .from('knowledge_suggestions')
                    .update({ occurrences: (duplicate.occurrences || 1) + 1, updated_at: new Date().toISOString() })
                    .eq('id', duplicate.id);
                console.log(`[KNOWLEDGE-SUGGESTIONS] Pergunta duplicada incrementada (${duplicate.occurrences + 1}x): "${question.substring(0, 60)}..."`);
                return;
            }
            // Nova pergunta: redigir resposta sugerida com IA
            const suggestedAnswer = await draftAnswer(input.orgId, question);
            await supabase_1.supabaseAdmin.from('knowledge_suggestions').insert({
                org_id: input.orgId,
                question,
                suggested_answer: suggestedAnswer,
                channel: input.channel,
                customer_phone: input.customerPhone,
            });
            console.log(`[KNOWLEDGE-SUGGESTIONS] ✅ Nova sugestão registada para org ${input.orgId}: "${question.substring(0, 60)}..."`);
        })().catch(err => console.warn('[KNOWLEDGE-SUGGESTIONS] Erro ao registar sugestão:', err.message));
    },
    /** Aprovar: insere na base de conhecimento e marca como aprovada */
    async approve(orgId, suggestionId, finalAnswer) {
        const { data: suggestion } = await supabase_1.supabaseAdmin
            .from('knowledge_suggestions')
            .select('*')
            .eq('id', suggestionId)
            .eq('org_id', orgId)
            .maybeSingle();
        if (!suggestion)
            return { success: false, error: 'Sugestão não encontrada.' };
        if (suggestion.status !== 'pending')
            return { success: false, error: 'Sugestão já foi processada.' };
        const answer = (finalAnswer || suggestion.suggested_answer || '').trim();
        if (!answer)
            return { success: false, error: 'Resposta vazia. Escreva ou gere uma resposta antes de aprovar.' };
        const content = `P: ${suggestion.question}\nR: ${answer}`;
        const { error: docError } = await supabase_1.supabaseAdmin.from('knowledge_docs').insert({
            org_id: orgId,
            filename: `Sugestão IA — ${suggestion.question.substring(0, 60)}`,
            file_size: content.length,
            mime_type: 'text/plain',
            content,
            content_preview: content.substring(0, 200),
        });
        if (docError)
            return { success: false, error: docError.message };
        await supabase_1.supabaseAdmin
            .from('knowledge_suggestions')
            .update({ status: 'approved', suggested_answer: answer, updated_at: new Date().toISOString() })
            .eq('id', suggestionId);
        return { success: true };
    },
    async reject(orgId, suggestionId) {
        const { error } = await supabase_1.supabaseAdmin
            .from('knowledge_suggestions')
            .update({ status: 'rejected', updated_at: new Date().toISOString() })
            .eq('id', suggestionId)
            .eq('org_id', orgId);
        return error ? { success: false, error: error.message } : { success: true };
    },
};
