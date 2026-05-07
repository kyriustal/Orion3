import { GoogleGenerativeAI } from "@google/generative-ai";
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

        // Contexto RAG
        let knowledgeBase = "";
        try {
            const { data: files } = await supabase
                .from('knowledge_files')
                .select('content_summary')
                .eq('org_id', orgId)
                .limit(3);
            if (files && files.length > 0) {
                knowledgeBase = "\nConhecimento Prévio:\n" + files.map(f => f.content_summary).join("\n");
            }
        } catch (err) {}

        try {
            // Inicializando o SDK oficial
            const genAI = new GoogleGenerativeAI(apiKey);
            
            // Usando o modelo 1.5 Flash (o mais estável para plano gratuito)
            const model = genAI.getGenerativeModel({ 
                model: "gemini-1.5-flash",
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 1000,
                }
            });

            const prompt = `Você é o ${botName || 'Orion'}. Seja prestativo.\n${knowledgeBase}\n\nUsuário: ${message}`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            return {
                reply: text || "Desculpe, não consegui processar a resposta.",
                status: 'success'
            };

        } catch (error: any) {
            console.error('Erro no SDK Gemini:', error);
            const detail = error.message || "Erro desconhecido na IA";
            throw new Error(`Falha na IA (SDK): ${detail}`);
        }
    }
}
