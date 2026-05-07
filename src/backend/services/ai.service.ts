import { ai } from '../config/gemini';
import { supabase } from '../config/supabase';

export class AIService {
    /**
     * Gera uma resposta inteligente baseada no contexto da empresa e documentos
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
        // Buscamos os resumos dos arquivos processados para essa organização
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

        // 2. Construir o Prompt "Perfeito"
        const systemPrompt = `Você é o ${name}, o assistente virtual oficial.
Diretrizes:
- Seja prestativo, profissional e amigável.
- Use as informações da "Base de Conhecimento" abaixo para responder se possível.
- Se não souber algo, admita e peça para falar com um humano.
- Nunca invente fatos sobre a empresa.
${knowledgeContext}`;

        // 3. Formatar Histórico para o Gemini
        // O SDK espera um array de conteúdos
        const contents = history.map(h => ({
            role: h.sender === 'user' ? 'user' : 'model',
            parts: [{ text: h.text }]
        }));

        // Adicionar a mensagem atual
        contents.push({
            role: 'user',
            parts: [{ text: message }]
        });

        // 3. Chamar o Gemini 1.5 Flash
        try {
            // Unificamos o prompt de sistema com a mensagem
            const fullMessage = `${systemPrompt}\n\nUsuário: ${message}`;

            // Forçamos o uso da v1 (estável) em vez da v1beta para evitar o erro 404
            const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" }, { apiVersion: 'v1' });
            const result = await model.generateContent(fullMessage);
            const response = await result.response;
            const reply = response.text();
            
            return {
                reply,
                status: 'success'
            };
        } catch (error: any) {
            console.error('Gemini Error:', error);
            throw new Error(`Erro na IA: ${error.message}`);
        }
    }
}
