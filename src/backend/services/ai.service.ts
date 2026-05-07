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
            throw new Error("GEMINI_API_KEY não encontrada no servidor.");
        }

        let knowledgeBase = "";
        try {
            const { data: files } = await supabase
                .from('knowledge_files')
                .select('content_summary')
                .eq('org_id', orgId)
                .limit(3);

            if (files && files.length > 0) {
                knowledgeBase = "\nConhecimento:\n" + files.map(f => f.content_summary).join("\n");
            }
        } catch (err) {}

        const systemPrompt = `Você é o ${botName || 'Orion'}. Seja profissional.\n${knowledgeBase}`;

        try {
            // Usando v1beta com o nome de modelo mais estável
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
            
            const response = await axios.post(url, {
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: `${systemPrompt}\n\nUsuário: ${message}` }]
                    }
                ],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 800
                }
            });

            const reply = response.data.candidates?.[0]?.content?.parts?.[0]?.text || "Erro na resposta.";
            
            return { reply, status: 'success' };
        } catch (error: any) {
            console.error('Gemini Error:', error.response?.data || error.message);
            throw new Error(`Falha na IA: ${error.response?.data?.[0]?.error?.message || error.message}`);
        }
    }
}
