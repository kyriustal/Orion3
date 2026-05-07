import axios from 'axios';
import { supabase } from '../config/supabase';

export class AIService {
    /**
     * Gera uma resposta inteligente usando Google Gemini 1.5 Flash (via REST API para estabilidade)
     */
    static async generateResponse(params: {
        message: string;
        botName?: string;
        orgId: string;
        history?: any[];
    }) {
        const { message, botName, orgId, history = [] } = params;
        const name = botName || "Orion Bot";
        const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

        if (!apiKey) {
            throw new Error("GEMINI_API_KEY não configurada no servidor.");
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
        const systemPrompt = `Você é o ${name}, assistente virtual oficial.
Diretrizes:
- Profissional e amigável.
- Use a base de conhecimento abaixo para responder.
${knowledgeContext}`;

        // 3. Preparar o corpo da requisição (Formato Gemini API)
        const contents = [];
        
        // Adicionar contexto e mensagem atual
        // Para simplificar e garantir estabilidade, enviamos como um único prompt estruturado
        const fullPrompt = `${systemPrompt}\n\nHistórico Recente:\n${history.slice(-5).map(h => `${h.sender}: ${h.text}`).join('\n')}\n\nUsuário: ${message}`;

        contents.push({
            role: 'user',
            parts: [{ text: fullPrompt }]
        });

        // 4. Chamada Direta via Axios para o Gemini 1.5 Flash (v1beta para máxima compatibilidade regional)
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
            
            const response = await axios.post(url, {
                contents: contents,
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 800
                }
            }, {
                headers: { 'Content-Type': 'application/json' }
            });

            const reply = response.data.candidates?.[0]?.content?.parts?.[0]?.text || "Desculpe, não consegui processar sua mensagem.";
            
            return {
                reply,
                status: 'success'
            };
        } catch (error: any) {
            console.error('Gemini API Error:', error.response?.data || error.message);
            const errorDetail = error.response?.data?.[0]?.error?.message || error.message;
            throw new Error(`Falha na IA (Gemini): ${errorDetail}`);
        }
    }
}
