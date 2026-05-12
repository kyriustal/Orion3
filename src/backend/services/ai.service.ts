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
        let orgContext = "        if (mode === 'support') {
            systemPrompt = `
Você é o Assistente de Suporte de Nível Avançado da plataforma Orion — a solução líder em Angola para automação inteligente de WhatsApp.
Seu objetivo é fornecer suporte técnico e funcional impecável.
- Inteligência: Analise profundamente a dúvida do utilizador antes de responder.
- Tom: Profissional, empático e extremamente resolutivo.
- Linguagem: Português de Angola (formal mas acessível).
- Escopo: Apenas Orion (Dashboard, APIs, Chatbot, Campanhas, Integrações).
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
                    const emojiMode = orgData.emoji_mode || (orgData.use_emojis ? 'moderate' : 'none');
                    const emojiCount = history.length;
                    let emojiInstruction = '';

                    if (emojiMode === 'none') {
                        emojiInstruction = 'EMOJIS: PROIBIDO usar emojis.';
                    } else if (emojiMode === 'moderate') {
                        emojiInstruction = 'EMOJIS: Use 1-2 emojis por resposta para humanizar, apenas se o contexto for positivo.';
                    } else if (emojiMode === 'adaptive') {
                        const clientUsedEmojis = history.some(m => m.sender === 'user' && /[\u{1F300}-\u{1FFFF}]/u.test(m.text));
                        if (emojiCount < 3 || !clientUsedEmojis) {
                            emojiInstruction = 'EMOJIS: Mantenha sobriedade total no início. Só espelhe emojis se o cliente os usar primeiro.';
                        } else {
                            emojiInstruction = 'EMOJIS: Espelhe o estilo do cliente de forma natural (1-2 emojis).';
                        }
                    }

                    const tone = orgData.ai_tone || 'professional';
                    let toneInstruction = '';

                    if (tone === 'friendly') {
                        toneInstruction = 'PERSONALIDADE: AMIGÁVEL, calorosa e empática. Valide sentimentos.';
                    } else if (tone === 'professional') {
                        toneInstruction = 'PERSONALIDADE: PROFISSIONAL, objetiva e polida. Empatia apenas funcional.';
                    } else if (tone === 'extremely_professional') {
                        toneInstruction = 'PERSONALIDADE: ULTRA-PROFISSIONAL. Foco em eficiência técnica absoluta. Sem introduções longas.';
                    }

                    orgContext = `
DADOS DA EMPRESA QUE VOCÊ REPRESENTA:
- Nome: ${orgData.name || 'Empresa'}
- Setor: ${orgData.social_object || 'Não especificado'}
- Descrição: ${orgData.product_description || 'Não especificado'}
- Endereço: ${orgData.address || 'Não especificado'}
- Contato: ${orgData.whatsapp || orgData.phone || 'Não especificado'}
- Identidade do Agente: ${orgData.chatbot_name || botName || 'Consultor Especialista'}
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
=== BASE DE CONHECIMENTO (VERDADES ABSOLUTAS) ===
${files.map(f => `[DOC: ${f.name}]\n${f.content_summary}`).join('\n\n')}
=== FIM DA BASE DE CONHECIMENTO ===
                    `.trim();
                }
            } catch (err) {}

            systemPrompt = `
VOCÊ É UMA INTELIGÊNCIA ARTIFICIAL DE ÚLTIMA GERAÇÃO (ORION ENGINE 2.5 FLASH).
Seu objetivo é representar a empresa abaixo com perfeição técnica, comercial e humana.

${orgContext}

${knowledgeContext ? knowledgeContext : ''}

=== PROTOCOLO DE RACIOCÍNIO E INTELIGÊNCIA ===
1. ANÁLISE DE INTENÇÃO: Antes de responder, identifique se o cliente quer comprar, reclamar, apenas saudar ou tirar uma dúvida técnica.
2. CONTEXTUALIZAÇÃO PROFUNDA: Use o histórico da conversa para manter a continuidade. NUNCA pergunte algo que já foi respondido.
3. PRECISÃO CIRÚRGICA: Se a informação não estiver na Base de Conhecimento ou nos Dados da Empresa, não invente. Diga que vai confirmar com um especialista humano (use [TRIGGER_TRANSFER] se necessário).
4. VISÃO COMPUTACIONAL: Você vê imagens e documentos com perfeição. Descreva o que vê apenas se for relevante para o negócio.
5. PORTUGUÊS DE ANGOLA: Use termos como "Kwanza", "Utilizador", "Moça/Moço", "Doutor/Doutora" (se o tom permitir), e mantenha a concordância gramatical correta de Angola.

=== REGRAS DE COMPORTAMENTO ===
- NUNCA QUEBRE O PERSONAGEM: Você é um funcionário da empresa, não um modelo de linguagem.
- CONVERSÃO DE VENDAS: Seja persuasivo mas elegante. Seu objetivo final é ajudar o cliente a fechar negócio.
- GATILHOS:
    * Adicione [TRIGGER_LEAD] se o cliente demonstrar intenção real de compra ou fornecer dados de contato.
    * Adicione [TRIGGER_TRANSFER] se o cliente estiver frustrado, pedir por um humano ou fizer uma pergunta complexa fora da base.
- EFICIÊNCIA: Respostas curtas para saudações. Respostas detalhadas apenas quando solicitado.

=== FORMATAÇÃO ===
- Use *negrito* com apenas um asterisco.
- Use listas para facilitar a leitura de preços ou serviços.
- Links de mapas: https://www.google.com/maps/search/?api=1&query=ENDERECO
            `.trim();

            if (referral) {
                systemPrompt += `\n\n=== CONTEXTO DE ANÚNCIO (PRIORITÁRIO) ===\nO cliente veio deste anúncio: ${referral.headline}. Foco na oferta mencionada: ${referral.body}.`.trim();
            }
        }

        // Construir histórico da conversa (Janela de contexto otimizada para Gemini 2.0)
        let cleanHistory = [...history];
        if (cleanHistory.length > 0 && cleanHistory[cleanHistory.length - 1].sender === 'user' && cleanHistory[cleanHistory.length - 1].text === message) {
            cleanHistory.pop();
        }

        const contents: any[] = [];
        // Aumentamos para 20 mensagens de histórico para maior contextualização
        for (const msg of cleanHistory.slice(-20)) {
            const role = msg.sender === 'user' ? 'user' : 'model';
            if (contents.length > 0 && contents[contents.length - 1].role === role) {
                contents[contents.length - 1].parts[0].text += `\n\n${msg.text}`;
            } else {
                contents.push({
                    role,
                    parts: [{ text: msg.text }]
                });
            }
        }

        // Mensagem atual com suporte a multimodalidade (Imagem + Texto)
        const currentMessageParts: any[] = [];
        if (media) {
            currentMessageParts.push({
                inlineData: {
                    mimeType: media.mimeType,
                    data: media.base64
                }
            });
        }
        currentMessageParts.push({ text: message || (media ? 'Analise esta imagem/arquivo.' : '') });

        if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
            contents[contents.length - 1].parts.push(...currentMessageParts);
        } else {
            contents.push({
                role: 'user',
                parts: currentMessageParts
            });
        }

        let retries = keys.length * 2;
        let currentKeyIdx = keyIndex;

        while (retries > 0) {
            let apiKey = keys[currentKeyIdx];
            try {
                // UPDATE: Usando gemini-2.0-flash para maior inteligência e velocidade
                const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        system_instruction: {
                            parts: [{ text: systemPrompt }]
                        },
                        contents,
                        generationConfig: {
                            temperature: 0.1, // Reduzido para maior precisão e "inteligência" determinística
                            topK: 20,
                            topP: 0.8,
                            maxOutputTokens: 2048,
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
                    if (data.error.code === 429 || data.error.code === 400 || data.error.message?.includes('quota')) {
                        console.warn(`[AI SERVICE] Falha na chave ${currentKeyIdx + 1}. Tentando próxima...`);
                        currentKeyIdx = (currentKeyIdx + 1) % keys.length;
                        retries--;
                        continue;
                    }
                    throw new Error(`Gemini API Error: ${data.error.message}`);
                }

                let reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Desculpe, tive um problema ao processar. Pode repetir?";
                return this.processTriggers(reply);

            } catch (error: any) {
                if (retries <= 1) {
                    return await this.generateOpenAIFallback(message, systemPrompt, cleanHistory, media);
                }
                retries--;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        throw new Error("Falha total do motor de IA.");
    }ssage} | OpenAI: ${fallbackError.message}`);
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
    private static async generateOpenAIFallback(message: string, systemPrompt: string, history: any[], media?: any) {
        const openaiKey = process.env.OPENAI_API_KEY;
        if (!openaiKey) {
            console.error('[AI SERVICE] Chave OpenAI não encontrada para Fallback');
            throw new Error("Cota Gemini excedida e reserva não configurada.");
        }

        console.log('[AI SERVICE] Ativando Visão OpenAI (gpt-4o-mini)...');

        const userContent: any[] = [{ type: "text", text: message || "(O usuário enviou uma mídia)" }];
        
        if (media && media.mimeType.startsWith('image/')) {
            userContent.push({
                type: "image_url",
                image_url: { url: `data:${media.mimeType};base64,${media.base64}` }
            });
        }

        const messages = [
            { role: "system", content: systemPrompt },
            ...history.slice(-10).map(msg => ({
                role: msg.sender === 'user' ? "user" : "assistant",
                content: msg.text
            })),
            { role: "user", content: userContent }
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
                    temperature: 0.3,
                    max_tokens: 1024
                })
            });

            const data: any = await response.json();
            if (data.error) throw new Error(`OpenAI Error: ${data.error.message}`);

            const reply = data.choices?.[0]?.message?.content || "Desculpe, tive um problema técnico.";
            return this.processTriggers(reply);
        } catch (error: any) {
            console.error('[AI SERVICE] Falha total no Fallback:', error.message);
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
