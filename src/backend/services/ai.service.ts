import axios from 'axios';
import { supabase } from '../config/supabase';

/**
 * Serviço central de IA do Orion 2
 * Responsável por gerenciar RAG (Base de Conhecimento), Histórico e Memória.
 */
export class AIService {
    private static readonly OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

    static async generateResponse(params: {
        message: string;
        botName?: string;
        orgId: string;
        history?: any[];
    }) {
        const { message, botName, orgId, history = [] } = params;
        const apiKey = process.env.OPENAI_API_KEY;

        if (!apiKey) {
            throw new Error("Configuração ausente: OPENAI_API_KEY não encontrada.");
        }

        // 1. RAG - Busca de conhecimento no Supabase
        let knowledgeBase = "";
        try {
            const { data: files } = await supabase
                .from('knowledge_files')
                .select('content_summary')
                .eq('org_id', orgId)
                .limit(3);

            if (files && files.length > 0) {
                knowledgeBase = "\nCONHECIMENTO ADICIONAL:\n" + 
                    files.map(f => f.content_summary).join("\n---\n");
            }
        } catch (err) {
            console.warn("Aviso: Falha ao carregar base de conhecimento.", err);
        }

        // 2. Montagem do Prompt de Sistema
        const systemPrompt = `Você é o ${botName || 'Orion Bot'}, assistente virtual da plataforma Orion.
Responda de forma curta, profissional e amigável.
${knowledgeBase}`;

        // 3. Preparação das mensagens
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history.slice(-6).map(h => ({
                role: h.sender === 'user' ? 'user' : 'assistant',
                content: h.text
            })),
            { role: 'user', content: message }
        ];

        // 4. Execução da Chamada (Axios para evitar dependências pesadas)
        try {
            const response = await axios.post(
                this.OPENAI_URL,
                {
                    model: 'gpt-4o-mini',
                    messages,
                    temperature: 0.7,
                    max_tokens: 600
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
            console.error('Erro na API da OpenAI:', error.response?.data || error.message);
            throw new Error(`Falha na IA: ${error.response?.data?.error?.message || error.message}`);
        }
    }
}
