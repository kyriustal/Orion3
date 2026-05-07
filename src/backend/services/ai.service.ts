import axios from 'axios';
import { supabase } from '../config/supabase';

/**
 * Serviço de IA - Orion 2
 * Motor: Google Gemini 1.5 Flash (Plano Gratuito)
 */
export class AIService {
    static async generateResponse(params: {
        message: string;
        botName?: string;
        orgId: string;
        history?: any[];
    }) {
        const { message, botName, orgId, history = [] } = params;
        
        // Prioriza a chave do Gemini
        const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

        if (!apiKey) {
            throw new Error("Chave do Gemini (GEMINI_API_KEY) não encontrada no servidor.");
        }

        // 1. Contexto da Empresa (RAG)
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

        // 2. Chamada para o Gemini via REST (Mais estável que o SDK para planos gratuitos)
        try {
            // URL para o modelo Flash 1.5 - Versão estável v1beta
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey.trim()}`;
            
            const response = await axios.post(url, {
                contents: [{
                    parts: [{ 
                        text: `Você é o ${botName || 'Orion'}. Seja prestativo.\n${knowledgeBase}\n\nPergunta: ${message}` 
                    }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 800
                }
            });

            const reply = response.data.candidates?.[0]?.content?.parts?.[0]?.text;

            return {
                reply: reply || "A IA não conseguiu gerar uma resposta no momento.",
                status: 'success'
            };

        } catch (error: any) {
            console.error('Gemini Error:', error.response?.data || error.message);
            const detail = error.response?.data?.error?.message || error.message;
            throw new Error(`Erro no Gemini Gratuito: ${detail}`);
        }
    }
}
