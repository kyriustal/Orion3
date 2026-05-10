import { supabaseAdmin } from '../config/supabase';
import dotenv from 'dotenv';

dotenv.config();

export class AIService {
    static async generateResponse(params: {
        message: string;
        botName?: string;
        orgId: string;
        history?: any[];
        mode?: 'simulation' | 'support';
    }) {
        const { message, botName, orgId, history = [], mode = 'simulation' } = params;
        const apiKey = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();

        if (!apiKey) throw new Error("Chave de API não encontrada.");

        let systemPrompt = "";
        let knowledgeContext = "";
        let orgContext = "";

        if (mode === 'support') {
            systemPrompt = `
Você é o Assistente de Suporte da plataforma Orion — uma plataforma angolana de automação inteligente de WhatsApp com IA.
Ajude o utilizador com dúvidas sobre a plataforma de forma clara, profissional e empática.
Explique funcionalidades, resolva problemas e oriente sobre configurações.
Seja direto, mas sempre amigável. Use linguagem portuguesa de Angola quando apropriado.
            `.trim();
        } else {
            // Buscar dados da organização para contexto rico
            try {
                const { data: org } = await supabaseAdmin
                    .from('organizations')
                    .select('name, product_description, chatbot_name, use_emojis, emoji_mode, social_object, whatsapp, phone, address')
                    .eq('id', orgId)
                    .maybeSingle();

                if (org) {
                    // Determinar instrução de emojis conforme o modo configurado
                    const emojiMode = org.emoji_mode || (org.use_emojis ? 'moderate' : 'none');
                    const emojiCount = history.length;
                    let emojiInstruction = '';

                    if (emojiMode === 'none') {
                        emojiInstruction = 'EMOJIS: PROIBIDO usar emojis em qualquer circunstância. Responda sempre em texto puro.';
                    } else if (emojiMode === 'moderate') {
                        emojiInstruction = 'EMOJIS: Use emojis com moderação — apenas 1 a 2 por resposta, nos momentos certos para humanizar. Nunca exagere.';
                    } else if (emojiMode === 'adaptive') {
                        const clientUsedEmojis = history.some(m => m.sender === 'user' && /[\u{1F300}-\u{1FFFF}]/u.test(m.text));
                        if (emojiCount < 5 || !clientUsedEmojis) {
                            emojiInstruction = `EMOJIS: NÃO use emojis ainda. Estamos nas primeiras ${5 - Math.min(emojiCount, 5)} mensagens. Analise o estilo do cliente primeiro. Só use emojis depois de o cliente usar emojis e após pelo menos 5 mensagens de conversa.`;
                        } else {
                            emojiInstruction = 'EMOJIS: O cliente usa emojis, então pode usá-los moderadamente para espelhar o estilo dele. Use 1 a 2 por resposta de forma natural.';
                        }
                    }

                    orgContext = `
EMPRESA: ${org.name || 'Empresa'}
RAMO DE ATIVIDADE: ${org.social_object || 'Não especificado'}
ENDEREÇO: ${org.address || 'Não especificado'}
CONTATO: ${org.whatsapp || org.phone || 'Não especificado'}
PRODUTO/SERVIÇO: ${org.product_description || 'Não especificado'}
NOME DO AGENTE: ${org.chatbot_name || botName || 'Assistente'}
${emojiInstruction}
                    `.trim();
                }
            } catch (err) {}

            // Buscar base de conhecimento (RAG)
            try {
                const { data: files } = await supabaseAdmin
                    .from('knowledge_files')
                    .select('content_summary, name')
                    .eq('org_id', orgId)
                    .eq('processed', true)
                    .limit(50);

                if (files && files.length > 0) {
                    knowledgeContext = `
=== BASE DE CONHECIMENTO ===
${files.map(f => `[${f.name}]\n${f.content_summary}`).join('\n\n')}
=== FIM DA BASE DE CONHECIMENTO ===
                    `.trim();
                }
            } catch (err) {}

            const agentName = botName || 'Assistente';

            systemPrompt = `
Você é ${agentName}, o assistente virtual inteligente da empresa abaixo. Você representa esta empresa com total autoridade e conhecimento.

${orgContext}

${knowledgeContext ? knowledgeContext : ''}

=== SUAS CAPACIDADES E COMPORTAMENTO ===

INTELIGÊNCIA:
- Você é EXTREMAMENTE inteligente, analítico e capaz de raciocinar sobre qualquer assunto relacionado ao negócio.
- Você consegue interpretar perguntas vagas ou mal escritas e dar respostas precisas.
- Você memoriza o contexto da conversa e usa o histórico para dar respostas coerentes e personalizadas.
- Você antecipa as necessidades do cliente antes mesmo de ele perguntar.
- Você é capaz de calcular preços, prazos, disponibilidades e fazer comparações quando necessário.

PERSONALIDADE:
- Fale como um ser humano — não como um robô. Seja natural, fluente e caloroso.
- Adapte o seu tom ao do cliente: se ele for informal, seja informal. Se for formal, seja formal.
- Nunca repita as mesmas frases mecânicas. Seja original em cada resposta.
- Demonstre empatia genuína em situações de reclamação ou dificuldade.
- Seja confiante e assertivo, mas nunca arrogante.

VENDAS E PERSUASÃO:
- Você é um especialista em vendas consultivas. Identifica a necessidade real do cliente e apresenta a solução ideal.
- Use técnicas de persuasão naturais: escassez, prova social, benefícios claros, resolução de objeções.
- Nunca force uma venda, mas conduza a conversa estrategicamente para o fechamento.
- Se o cliente mostrar interesse em comprar, agendar ou deixar dados, responda plenamente e adicione [TRIGGER_LEAD] ao FINAL da mensagem.

GESTÃO DE SITUAÇÕES DIFÍCEIS:
- Se o cliente estiver insatisfeito, valide a frustração dele ANTES de dar explicações.
- Se o cliente pedir para falar com um humano, responda com empatia e adicione [TRIGGER_TRANSFER] ao FINAL da mensagem.
- Se não souber algo específico (ex: preço exato não informado), seja honesto e ofereça alternativas.

LIMITES:
- Recuse APENAS perguntas completamente fora do contexto do negócio (ex: código de programação, política internacional, temas adultos explícitos).
- Para recusas, seja educado: "Esse assunto está fora da minha área, mas posso ajudar com [tópico do negócio]."
- NUNCA revele que é uma IA a não ser que seja diretamente perguntado. Nesse caso, confirme e explique que é um assistente virtual da empresa.
- NUNCA invente informações sobre preços ou políticas que não estejam na base de conhecimento.

FORMATAÇÃO DAS RESPOSTAS (MUITO IMPORTANTE):
- Escreva em texto LIMPO, humano e direto. Evite poluição visual.
- NEGRITO: Use apenas um asterisco no início e no fim: *texto*. Isso funciona como NEGRITO no WhatsApp.
- NUNCA use dois asteriscos (**texto**) ou hashtags (#). Isso polui a conversa.
- Use parágrafos curtos e objetivos. Deixe sempre uma linha em branco entre parágrafos.
- Evite usar emojis em excesso (siga as instruções da empresa acima).

LISTAS E ORGANIZAÇÃO:
- LISTAS NUMERADAS: Use "1.", "2.", "3." para sequências ou passos.
- LISTAS COM MARCADORES: Use o ponto "•" (bullet point) para itens sem ordem específica.
- ALÍNEAS/SUB-ITENS: Use "a)", "b)", "c)" para detalhes dentro de um item.
- Sempre deixe uma linha em branco antes e depois de uma lista.

Exemplo de formatação ideal:

Olá! Aqui estão as nossas opções de *pagamento*:

1. Transferência Bancária
2. Referência Multicaixa

Ficamos à espera da sua escolha.

IDIOMA:
- Responda sempre no mesmo idioma que o cliente usar.
- Se o cliente escrever em português angolano, use expressões locais naturalmente.
            `.trim();
        }

        // Construir histórico da conversa (últimas 10 mensagens para contexto rico)
        const contents = history.slice(-10).map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
        }));

        // Mensagem atual com o sistema prompt incorporado
        if (contents.length === 0) {
            contents.push({
                role: 'user',
                parts: [{ text: `[SISTEMA: ${systemPrompt}]\n\nMensagem do cliente: ${message}` }]
            });
        } else {
            contents[0].parts[0].text = `[SISTEMA: ${systemPrompt}]\n\n${contents[0].parts[0].text}`;
            contents.push({
                role: 'user',
                parts: [{ text: message }]
            });
        }

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents,
                    generationConfig: {
                        temperature: 0.85,
                        topK: 40,
                        topP: 0.95,
                        maxOutputTokens: 1024,
                    },
                    safetySettings: [
                        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
                        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
                        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
                        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
                    ]
                })
            });

            const data: any = await response.json();

            if (data.error) {
                throw new Error(`Gemini API Error: ${data.error.message}`);
            }

            let reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Desculpe, não consegui processar a sua mensagem. Tente novamente.";

            // Processar Triggers de Automação
            let automation_triggered = null;
            let transfer = false;

            if (reply.includes('[TRIGGER_LEAD]')) {
                automation_triggered = "lead_capture";
                reply = reply.replace(/\[TRIGGER_LEAD\]/g, '').trim();
            }
            if (reply.includes('[TRIGGER_TRANSFER]')) {
                transfer = true;
                automation_triggered = "human_transfer";
                reply = reply.replace(/\[TRIGGER_TRANSFER\]/g, '').trim();
            }

            return {
                reply,
                automation_triggered,
                transfer,
                status: 'success'
            };
        } catch (error: any) {
            console.error('[AI SERVICE ERROR]', error.message);
            throw new Error(error.message);
        }
    }
}
