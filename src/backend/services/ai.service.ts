import axios from 'axios';
import { supabase } from '../config/supabase';

export class AIService {
    /**
     * Gera uma resposta inteligente usando OpenAI (via API REST direta para máxima estabilidade)
     */
    static async generateResponse(params: {
        message: string;
        botName?: string;
        orgId: string;
        history?: any[];
    }) {
        const { message, botName, orgId, history = [] } = params;
        const name = botName || "Orion Bot";
        const apiKey = process.env.OPENAI_API_KEY;

        if (!apiKey) {
            throw new Error("OPENAI_API_KEY não configurada no servidor.");
        }

        // 1. Buscar Contexto da Base de Conhecimento (RAG)
        const { data: files } = await supabase
            .from('knowledge_files')
            .select('content_summary')
            .eq('org_id', orgId)
            .limit(5);

        let knowledgeContext = "";
        if (files && files.length > 0) {
            knowledgeContext = "\nBase de Conhecimento da Empresa:\n" + 
                files.map(f => f.content_summary).join("\n---\n");
        }

        // 2. Construir o Prompt do Sistema
        const systemPrompt = `Você é o ${name}, o assistente virtual oficial.
Diretrizes:
- Seja prestativo, profissional e amigável.
- Use as informações da "Base de Conhecimento" abaixo para responder se possível.
- Se não souber algo, peça para falar com um atendente humano.
${knowledgeContext}`;

        // 3. Preparar Mensagens para a API da OpenAI
        const messages: any[] = [
            { role: 'system', content: systemPrompt }
        ];

        // Adicionar histórico (últimas 10 mensagens)
        history.slice(-10).forEach(h => {
            messages.push({
                role: h.sender === 'user' ? 'user' : 'assistant',
                content: h.text
            });
        });

        // Adicionar a mensagem atual
        messages.push({
            role: 'user',
            content: message
        });

        // 4. Chamada Direta via Axios (Mais leve que o SDK oficial)
        try {
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: 'gpt-4o-mini',
                    messages: messages,
                    temperature: 0.7
                },
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const reply = response.data.choices[0].message.content;
            
            return {
                reply,
                status: 'success'
            };
        } catch (error: any) {
            console.error('OpenAI API Error:', error.response?.data || error.message);
            const errorDetail = error.response?.data?.error?.message || error.message;
            throw new Error(`Falha na IA (OpenAI): ${errorDetail}`);
        }
    }
}
