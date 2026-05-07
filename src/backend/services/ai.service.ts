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

        // 2. Construir o Prompt
        const systemPrompt = `Você é o ${name}, o assistente virtual oficial.
Diretrizes:
- Seja prestativo, profissional e amigável.
- Use as informações da "Base de Conhecimento" abaixo para responder se possível.
${knowledgeContext}`;

        // 3. Chamar o Gemini 1.5 Flash
        try {
            const fullMessage = `${systemPrompt}\n\nUsuário: ${message}`;

            // Usando v1beta conforme sugerido para a região
            const model = ai.getGenerativeModel({ model: "gemini-1.5-flash-latest" }, { apiVersion: 'v1beta' });
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
