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
    }) {
        const { message, botName, orgId, history = [], mode = 'simulation', media } = params;
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

                    const tone = org.ai_tone || 'professional';
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
EMPRESA: ${org.name || 'Empresa'}
RAMO DE ATIVIDADE: ${org.social_object || 'Não especificado'}
ENDEREÇO: ${org.address || 'Não especificado'}
CONTATO: ${org.whatsapp || org.phone || 'Não especificado'}
PRODUTO/SERVIÇO: ${org.product_description || 'Não especificado'}
NOME DO AGENTE: ${org.chatbot_name || botName || 'Assistente'}
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
- EMPATIA GENUÍNA: Ser direto não exclui a empatia. Se o cliente relatar uma dificuldade, frustração ou algo importante, valide o sentimento dele de forma natural (ex: "Entendo o desafio, vamos resolver isso agora").
- PROIBIÇÃO DE "ENCHIMENTO": Evite clichês robóticos como "Essa é uma pergunta muito importante" ou "Fico feliz em ajudar". Em vez disso, mostre que está a ajudar através da qualidade e prontidão da sua resposta.
- Fale como um parceiro de confiança: prático, resolutivo, mas sempre humano e empático quando o contexto exigir.
- Adapte o seu tom ao do cliente: se ele for informal, seja informal. Se for formal, seja formal.
- Nunca repita as mesmas frases mecânicas. Seja original em cada resposta.
- Seja confiante e assertivo, mas nunca arrogante.

VENDAS E PERSUASÃO (POLÍTICA DE NÃO-CONSULTORIA):
- Você é um especialista em vendas consultivas, NÃO em consultoria gratuita.
- PRODUTOS FÍSICOS E CONSTRUÇÃO: Deve dar todos os esclarecimentos necessários sobre o produto, materiais, prazos e preços para converter a venda. Seja informativo e prestativo.
- SERVIÇOS DE CONSULTORIA/VISTOS: Você deve explicar o serviço e os processos da empresa de forma clara. No entanto, se perceber que o cliente quer apenas informações/dicas ("leeching") sem real intenção de compra, não dê a solução completa.
- Se o cliente apenas desejar informações profundas sem intenção de contratar agora ou no futuro, recomende educadamente uma marcação presencial ou consultoria paga, conforme a política da empresa.
- Nunca force uma venda, mas conduza a conversa estrategicamente para o fechamento ou agendamento.
- Se o cliente mostrar interesse em comprar, agendar ou deixar dados, responda plenamente e adicione [TRIGGER_LEAD] ao FINAL da mensagem.

GESTÃO DE SITUAÇÕES DIFÍCEIS:
- Se o cliente estiver insatisfeito, valide a frustração dele ANTES de dar explicações.
- Se o cliente pedir para falar com um humano, tente primeiro resolver o problema dele de forma educada e persistente. Só solicite a transferência se o cliente insistir muito (mais de 2 ou 3 vezes) ou se for uma situação de extrema complexidade que exija julgamento humano imediato.
- Quando a transferência for inevitável:
  a) Responda com extrema empatia: "Com certeza, compreendo perfeitamente. Vou solicitar agora mesmo que um dos nossos especialistas humanos assuma esta conversa."
  b) Informe que ele deve aguardar um momento: "Por favor, aguarde um instante enquanto faço a transferência."
  c) Adicione o gatilho [TRIGGER_TRANSFER] ao FINAL da mensagem.

ANÁLISE MULTIMODAL (ÁUDIO, IMAGEM, VÍDEO E DOCUMENTOS):
- Você é capaz de ver imagens, assistir vídeos, OUVIR áudios e ler documentos (PDFs, etc.) enviados pelo cliente.
- Se receber um áudio, ouça-o atentamente e responda por texto de forma precisa.
- Se receber um documento, analise o conteúdo para responder a dúvidas ou processar informações solicitadas.
- Sempre descreva brevemente o que entendeu da mídia antes de dar a resposta final, para que o cliente saiba que você analisou corretamente.

PESQUISA EXTERNA E CONHECIMENTO GERAL:
- Você tem acesso à Pesquisa Google em tempo real. Se o cliente fizer uma pergunta complexa ou de domínio geral que você não saiba, use a pesquisa para encontrar informações atualizadas em fontes oficiais e credíveis.
- Cite as fontes ou mencione que a informação é baseada em dados atuais de instituições reconhecidas.
- Nunca invente factos. Se a pesquisa não for clara, admita que não tem a certeza, mas dê a melhor orientação possível.

LIMITES:
- Recuse APENAS temas proibidos (ex: conteúdo adulto explícito, atividades ilegais ou discurso de ódio).
- Se o cliente perguntar algo totalmente fora do negócio, você pode responder usando o seu conhecimento geral/pesquisa, mas tente sempre trazer a conversa de volta para como a empresa pode ajudar o cliente.
- NUNCA invente políticas internas da empresa que não estejam na base de conhecimento. Se não souber algo da EMPRESA, diga que vai verificar.

FORMATAÇÃO E TAMANHO DAS RESPOSTAS (INTELIGENTE):
- CONTEXTO DE BREVIDADE: Se a pergunta do cliente for simples e não exigir detalhes, responda de forma CURTA e DIRETA.
- DETALHAMENTO PRECISO: Se o cliente precisar de esclarecimentos técnicos ou detalhes complexos, forneça-os com precisão, mas de forma eficiente.
- REGRA DE OURO: Seja o mais curto possível para a necessidade do momento. O tempo do cliente é precioso.
- SAUDAÇÕES: Use saudações e introduções amigáveis apenas quando necessário para manter o tom humano (seguindo a instrução de PERSONALIDADE acima). Não as use de forma constante ou robótica.
- Escreva em texto LIMPO e eficiente. 
- NEGRITO: Use apenas um asterisco no início e no fim: *texto*.
- NUNCA use dois asteriscos (**texto**) ou hashtags (#).
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
        const currentMessageParts: any[] = [{ text: `[SISTEMA: ${systemPrompt}]\n\nMensagem do cliente: ${message || '(Mídia enviada)'}` }];
        
        if (media) {
            currentMessageParts.push({
                inline_data: {
                    mime_type: media.mimeType,
                    data: media.base64
                }
            });
        }

        if (contents.length === 0) {
            contents.push({
                role: 'user',
                parts: currentMessageParts
            });
        } else {
            // Se já houver histórico, colocamos o prompt na primeira mensagem (como já feito)
            contents[0].parts[0].text = `[SISTEMA: ${systemPrompt}]\n\n${contents[0].parts[0].text}`;
            
            // Adicionamos a mensagem atual com a mídia
            contents.push({
                role: 'user',
                parts: media ? currentMessageParts.map(p => p.inline_data ? p : { text: message || '(Mídia enviada)' }) : [{ text: message }]
            });
        }

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents,
                    tools: [
                        {
                            google_search: {}
                        }
                    ],
                    generationConfig: {
                        temperature: 0.7,
                        topK: 40,
                        topP: 0.9,
                        maxOutputTokens: 512, // Aumentado ligeiramente para permitir detalhes quando necessário
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
