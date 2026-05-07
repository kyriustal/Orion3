import OpenAI from 'openai';
import { supabase } from '../config/supabase';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || ''
});

export class AIService {
    /**
     * Gera uma resposta inteligente usando OpenAI GPT
     */
    static async generateResponse(params: {
        message: string;
        botName?: string;
        orgId: string;
        history?: any[];
    }) {
        const { message, botName, orgId, history = [] } = params;
        const name = botName || "Orion Bot";

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
- Se não souber algo, admita e peça para falar com um humano.
${knowledgeContext}`;

        // 3. Formatar Mensagens para OpenAI
        const messages: any[] = [
            { role: 'system', content: systemPrompt }
        ];

        // Adicionar histórico
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

        // 4. Chamar o GPT-4o-mini
        try {
            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: messages,
                temperature: 0.7,
                max_tokens: 500
            });

            const reply = response.choices[0].message.content || "Desculpe, não consegui gerar uma resposta agora.";
            
            return {
                reply,
                status: 'success'
            };
        } catch (error: any) {
            console.error('OpenAI Error:', error);
            throw new Error(`Erro na IA (OpenAI): ${error.message}`);
        }
    }
}
