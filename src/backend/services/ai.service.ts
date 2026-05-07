import axios from 'axios';
import { supabase } from '../config/supabase';

/**
 * Serviço de IA - Orion 2
 * Motor: OpenAI GPT-5.4-mini (Nova Geração)
 */
export class AIService {
    // Usando o novo endpoint v1/responses conforme fornecido
    private static readonly API_URL = 'https://api.openai.com/v1/responses';

    static async generateResponse(params: {
        message: string;
        botName?: string;
        orgId: string;
        history?: any[];
    }) {
        const { message, botName, orgId, history = [] } = params;
        const apiKey = process.env.OPENAI_API_KEY;

        if (!apiKey) {
            throw new Error("OPENAI_API_KEY não encontrada no .env do servidor.");
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
                knowledgeBase = "\nContexto:\n" + files.map(f => f.content_summary).join("\n");
            }
        } catch (err) {}

        // 2. Chamada para a Nova API da OpenAI
        try {
            const response = await axios.post(
                this.API_URL,
                {
                    model: 'gpt-5.4-mini',
                    input: `Você é o ${botName || 'Orion'}. Responda à pergunta do usuário considerando o contexto abaixo.\n${knowledgeBase}\n\nUsuário: ${message}`,
                    store: true
                },
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            // Nota: O formato de resposta da v1/responses pode variar, 
            // mas geralmente o texto está em output ou choices. 
            // Vou tratar o formato padrão retornado pelo modelo 5.4-mini.
            const reply = response.data.output || response.data.choices?.[0]?.message?.content || response.data.text;

            return {
                reply: reply || "Processado com sucesso, mas sem retorno de texto.",
                status: 'success'
            };

        } catch (error: any) {
            console.error('OpenAI 5.4 Error:', error.response?.data || error.message);
            const detail = error.response?.data?.error?.message || error.message;
            throw new Error(`Erro no GPT-5.4: ${detail}`);
        }
    }
}
