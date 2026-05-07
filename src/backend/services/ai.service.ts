import axios from 'axios';
import { supabase } from '../config/supabase';

export class AIService {
    static async generateResponse(params: {
        message: string;
        botName?: string;
        orgId: string;
        history?: any[];
    }) {
        const { message, botName, orgId, history = [] } = params;
        const rawKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
        const apiKey = rawKey?.trim();

        if (!apiKey) {
            throw new Error("GEMINI_API_KEY não encontrada.");
        }

        // Contexto RAG (opcional)
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

        const systemPrompt = `Você é o ${botName || 'Orion'}. Responda de forma curta.\n${knowledgeBase}`;

        try {
            // FORÇANDO o 1.5-flash que tem a maior cota gratuita
            const model = "gemini-1.5-flash";
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            
            const response = await axios.post(url, {
                contents: [{
                    parts: [{ text: `${systemPrompt}\n\nPergunta: ${message}` }]
                }],
                generationConfig: {
                    temperature: 1,
                    maxOutputTokens: 800
                }
            });

            if (response.data.candidates && response.data.candidates[0].content) {
                return {
                    reply: response.data.candidates[0].content.parts[0].text,
                    status: 'success'
                };
            }
            throw new Error("Resposta vazia.");

        } catch (error: any) {
            console.error('Erro na IA:', error.response?.data || error.message);
            const detail = error.response?.data?.error?.message || error.message;
            throw new Error(`Limite de Cota ou Erro na Google. Detalhe: ${detail}`);
        }
    }
}
