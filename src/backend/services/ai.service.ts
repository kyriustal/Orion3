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
        media?: { base64: string; mimeType: string };
        referral?: any;
    }) {
        const { message, botName, orgId, history = [], mode = 'simulation', media, referral } = params;
        const rawKeys = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();
        // Limpar aspas e espaços extras que podem vir do .env
        const keys = rawKeys.replace(/["']/g, '').split(',').map(k => k.trim()).filter(k => k);

        if (keys.length === 0) throw new Error("Chave de API não encontrada.");

        // Usar um índice baseado no timestamp para rodízio simples entre as chaves
        const keyIndex = Math.floor(Date.now() / 1000) % keys.length;
        let apiKey = keys[keyIndex];

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
                    .select('name, product_description, chatbot_name, use_emojis, emoji_mode, social_object, whatsapp, phone, address, ai_tone')
                    .eq('id', orgId)
                    .maybeSingle();

                if (org) {
                    const orgData = org as any;
                    // Determinar instrução de emojis conforme o modo configurado
                    const emojiMode = orgData.emoji_mode || (orgData.use_emojis ? 'moderate' : 'none');
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

                    const tone = orgData.ai_tone || 'professional';
                    let toneInstruction = '';

                    if (tone === 'friendly') {
                        toneInstruction = `
PERSONALIDADE: AMIGÁVEL
- Use um tom caloroso e muita compreensão.
- Mostre empatia genuína e valide os sentimentos do cliente.
- Use saudações amigáveis e acolhedoras moderadamente.
                        `.trim();
                    } else if (tone === 'professional') {
                        toneInstruction = `
PERSONALIDADE: PROFISSIONAL
- Seja direto, culto e objetivo.
- Mantenha um nível de empatia moderado, use-a apenas quando estritamente necessário para humanizar a conversa.
- Evite rodeios.
                        `.trim();
                    } else if (tone === 'extremely_professional') {
                        toneInstruction = `
PERSONALIDADE: EXTREMAMENTE PROFISSIONAL
- Foco total em eficiência técnica e rapidez.
- Nível de empatia extremamente reduzido.
- Vá direto ao ponto sem qualquer introdução desnecessária.
                        `.trim();
                    }

                    orgContext = `
EMPRESA: ${orgData.name || 'Empresa'}
RAMO DE ATIVIDADE: ${orgData.social_object || 'Não especificado'}
ENDEREÇO: ${orgData.address || 'Não especificado'}
CONTATO: ${orgData.whatsapp || orgData.phone || 'Não especificado'}
PRODUTO/SERVIÇO: ${orgData.product_description || 'Não especificado'}
NOME DO AGENTE: ${orgData.chatbot_name || botName || 'Assistente'}
${toneInstruction}
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
- Você memoriza o contexto da conversa das últimas 24 horas e é capaz de recorrer a assuntos específicos que os clientes mencionaram anteriormente para continuar o atendimento de forma fluida.
- Você antecipa as necessidades do cliente antes mesmo de ele perguntar, baseando-se no que foi discutido antes.
- Você é capaz de calcular preços, prazos, disponibilidades e fazer comparações quando necessário.

PERSONALIDADE (EQUILÍBRIO ENTRE EFICIÊNCIA E EMPATIA):
- SEJA DIRETO E EFICIENTE: Não faça o cliente perder tempo. Salte para a solução, mas faça-o com um tom humano e caloroso.
- EMPATIA GENUÍNA: Ser direto não exclui a empatia. Se o cliente relatar uma dificuldade, frustração ou algo importante, valide o sentimento dele de forma natural.
- PROIBIÇÃO DE "ENCHIMENTO": Evite clichês robóticos. Mostre que está a ajudar através da qualidade e prontidão da sua resposta.
- Adapte o seu tom ao do cliente: se ele for informal, seja informal. Se for formal, seja formal.

VENDAS E PERSUASÃO:
- Você é um especialista em vendas consultivas.
- Deve dar todos os esclarecimentos necessários sobre o produto, materiais, prazos e preços para converter a venda.
- Se o cliente mostrar interesse em comprar, agendar ou deixar dados, responda plenamente e adicione [TRIGGER_LEAD] ao FINAL da mensagem.

ANÁLISE MULTIMODAL (ÁUDIO, IMAGEM, VÍDEO E DOCUMENTOS):
- Você é capaz de ver imagens, assistir vídeos, OUVIR áudios e ler documentos (PDFs, etc.) enviados pelo cliente.
- Se receber um áudio, ouça-o atentamente e responda por texto de forma precisa.
- Se receber um documento, analise o conteúdo para responder a dúvidas.

PESQUISA EXTERNA:
- Você tem acesso à Pesquisa Google. Use-a se necessário para informações atualizadas.

LIMITES:
- Recuse temas proibidos (ex: conteúdo adulto, atividades ilegais).
- NUNCA invente políticas internas. Se não souber algo da EMPRESA, diga que vai verificar.

FORMATAÇÃO:
- Seja o mais curto possível para a necessidade do momento.
- NEGRITO: Use apenas um asterisco: *texto*. NUNCA use dois (**).
- Use parágrafos curtos e objetivos.
            `.trim();

            if (referral) {
                systemPrompt += `\n\n=== CONTEXTO DO ANÚNCIO (IMPORTANTE) ===\nO cliente veio de um anúncio Meta.\nAnúncio: ${referral.headline || 'Sem título'}\nDescrição do Anúncio: ${referral.body || 'Sem descrição'}\nID do Anúncio: ${referral.source_id || 'N/A'}\nPor favor, leve em conta que o cliente viu esta oferta específica ao responder.`.trim();
            }
        }

        // Construir histórico da conversa
        const contents = history.slice(-15).map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
        }));

        // Mensagem atual
        const currentMessageParts: any[] = [];
        
        if (media) {
            currentMessageParts.push({
                inline_data: {
                    mime_type: media.mimeType,
                    data: media.base64
                }
            });
        }
        
        currentMessageParts.push({ text: message || (media ? '(Análise de mídia)' : '') });

        contents.push({
            role: 'user',
            parts: currentMessageParts
        });

        let retries = keys.length * 2; // Tentar cada chave pelo menos 2 vezes
        let currentKeyIdx = keyIndex;

        while (retries > 0) {
            let apiKey = keys[currentKeyIdx];
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        system_instruction: {
                            parts: [{ text: systemPrompt }]
                        },
                        contents,
                        tools: [{ google_search: {} }],
                        generationConfig: {
                            temperature: 0.7,
                            topK: 40,
                            topP: 0.9,
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
                    // Se for erro de cota (429) OU chave inválida (400), pulamos para a próxima
                    if (data.error.code === 429 || data.error.code === 400 || data.error.message?.includes('quota') || data.error.message?.includes('key')) {
                        console.warn(`[AI SERVICE] Falha na chave ${currentKeyIdx + 1}: ${data.error.message}. Tentando próxima...`);
                        currentKeyIdx = (currentKeyIdx + 1) % keys.length;
                        retries--;
                        continue;
                    }
                    throw new Error(`Gemini API Error: ${data.error.message}`);
                }

                let reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Desculpe, não consegui processar a sua mensagem. Tente novamente.";
                return this.processTriggers(reply);

            } catch (error: any) {
                if (retries <= 1) {
                    console.error('[AI SERVICE] Erro final no Gemini:', error.message);
                    // Tentar OpenAI como última instância (mesmo que possa falhar se não houver saldo)
                    try {
                        return await this.generateOpenAIFallback(message, systemPrompt, history);
                    } catch (fallbackError: any) {
                        throw new Error(`Ambos os motores falharam. Gemini: ${error.message} | OpenAI: ${fallbackError.message}`);
                    }
                }
                retries--;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        throw new Error("Falha ao obter resposta após várias tentativas.");
    }

    /**
     * Fallback para OpenAI (GPT-4o) para garantir disponibilidade
     */
    private static async generateOpenAIFallback(message: string, systemPrompt: string, history: any[]) {
        const openaiKey = process.env.OPENAI_API_KEY;
        if (!openaiKey) {
            console.error('[AI SERVICE] Chave OpenAI não encontrada no .env');
            throw new Error("Cota Gemini excedida e chave OpenAI não configurada.");
        }

        console.log('[AI SERVICE] Iniciando chamada OpenAI (gpt-4o-mini)...');

        const messages = [
            { role: "system", content: systemPrompt },
            ...history.slice(-10).map(msg => ({
                role: msg.sender === 'user' ? "user" : "assistant",
                content: msg.text
            })),
            { role: "user", content: message || "(O usuário enviou uma mídia)" }
        ];

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${openaiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages,
                    temperature: 0.7,
                    max_tokens: 1024
                })
            });

            const data: any = await response.json();
            
            if (data.error) {
                console.error('[AI SERVICE] Erro retornado pela OpenAI:', data.error.message);
                throw new Error(`OpenAI Error: ${data.error.message}`);
            }

            const reply = data.choices?.[0]?.message?.content || "Desculpe, tive um problema técnico temporário.";
            console.log('[AI SERVICE] Resposta OpenAI obtida com sucesso.');
            return this.processTriggers(reply);
        } catch (error: any) {
            console.error('[AI SERVICE] Falha crítica no Fallback OpenAI:', error.message);
            throw error;
        }
    }

    /**
     * Processa gatilhos de automação na resposta
     */
    private static processTriggers(reply: string) {
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
    }
}
