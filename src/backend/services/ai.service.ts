import axios from 'axios';
import { supabase } from '../config/supabase';

/**
 * Serviço de IA - Orion 2
 * Motor: OpenAI GPT-4o mini (Alta Estabilidade)
 */
export class AIService {
    private static readonly API_URL = 'https://api.openai.com/v1/chat/completions';

    static async generateResponse(params: {
        message: string;
        botName?: string;
        orgId: string;
        history?: any[];
    }) {
        const { message, botName, orgId, history = [] } = params;
        const apiKey = process.env.OPENAI_API_KEY;

        if (!apiKey) {
            throw new Error("OPENAI_API_KEY não configurada. Por favor, adicione sua chave da OpenAI no arquivo .env da Hostinger.");
        }

        // 1. Contexto RAG (Base de Conhecimento)
        let knowledgeBase = "";
        try {
            const { data: files } = await supabase
                .from('knowledge_files')
                .select('content_summary')
                .eq('org_id', orgId)
                .limit(3);
            if (files && files.length > 0) {
                knowledgeBase = "\nContexto da Empresa:\n" + files.map(f => f.content_summary).join("\n");
            }
        } catch (err) {}

        // 2. Chamada para OpenAI
        try {
            const response = await axios.post(
                this.API_URL,
                {
                    model: 'gpt-4o-mini',
                    messages: [
                        { 
                            role: 'system', 
                            content: `Você é o ${botName || 'Orion'}. Seja profissional e direto.\n${knowledgeBase}` 
                        },
                        ...history.slice(-5).map(h => ({
                            role: h.sender === 'user' ? 'user' : 'assistant',
                            content: h.text
                        })),
                        { role: 'user', content: message }
                    ],
                    temperature: 0.7
                },
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return {
                reply: response.data.choices[0].message.content,
                status: 'success'
            };

        } catch (error: any) {
            console.error('OpenAI Error:', error.response?.data || error.message);
            const detail = error.response?.data?.error?.message || error.message;
            throw new Error(`Erro na OpenAI: ${detail}`);
        }
    }
}
