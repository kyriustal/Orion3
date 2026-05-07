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
        const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

        if (!apiKey) {
            throw new Error("Configuração ausente: GEMINI_API_KEY não encontrada no servidor.");
        }

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
            console.warn("Aviso: Falha ao carregar base de conhecimento.");
        }

        const systemPrompt = `Você é o ${botName || 'Orion Bot'}, assistente virtual oficial.
Responda de forma profissional e amigável.
${knowledgeBase}`;

        const fullPrompt = `${systemPrompt}\n\nUsuário: ${message}`;

        try {
            // Usando gemini-pro (v1beta) para compatibilidade universal
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
            
            const response = await axios.post(url, {
                contents: [{
                    parts: [{ text: fullPrompt }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 1000
                }
            });

            const reply = response.data.candidates?.[0]?.content?.parts?.[0]?.text || "Desculpe, não consegui gerar uma resposta.";
            
            return {
                reply,
                status: 'success'
            };
        } catch (error: any) {
            console.error('Erro na API do Gemini:', error.response?.data || error.message);
            const detail = error.response?.data?.[0]?.error?.message || error.message;
            throw new Error(`Falha na IA (Gemini): ${detail}`);
        }
    }
}
