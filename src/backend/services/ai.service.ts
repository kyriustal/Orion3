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
        
        // Tenta pegar a chave e remove qualquer espaço em branco acidental
        const rawKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
        const apiKey = rawKey?.trim();

        if (!apiKey) {
            throw new Error("GEMINI_API_KEY não encontrada no servidor.");
        }

        console.log(`[IA] Usando chave iniciada em: ${apiKey.substring(0, 4)}...`);

        let knowledgeBase = "";
        try {
            const { data: files } = await supabase
                .from('knowledge_files')
                .select('content_summary')
                .eq('org_id', orgId)
                .limit(3);

            if (files && files.length > 0) {
                knowledgeBase = "\nContexto Base:\n" + files.map(f => f.content_summary).join("\n");
            }
        } catch (err) {}

        const systemPrompt = `Você é o ${botName || 'Orion'}. Seja profissional e amigável.
${knowledgeBase}`;

        try {
            // URL Universal do Gemini 1.5 Flash
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
            
            const response = await axios.post(url, {
                contents: [{
                    parts: [{ 
                        text: `${systemPrompt}\n\nPergunta do usuário: ${message}` 
                    }]
                }],
                generationConfig: {
                    temperature: 1,
                    topP: 0.95,
                    topK: 40,
                    maxOutputTokens: 1024,
                }
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.data.candidates && response.data.candidates[0].content) {
                return {
                    reply: response.data.candidates[0].content.parts[0].text,
                    status: 'success'
                };
            }

            throw new Error("Resposta vazia da Google.");
        } catch (error: any) {
            console.error('Gemini Request Error:', error.response?.data || error.message);
            const errorMsg = error.response?.data?.error?.message || error.message;
            throw new Error(`Falha na IA (Gemini): ${errorMsg}`);
        }
    }
}
