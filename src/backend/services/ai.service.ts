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
            throw new Error("GEMINI_API_KEY não encontrada no servidor.");
        }

        // 1. Contexto RAG
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

        const systemPrompt = `Você é o ${botName || 'Orion'}. Seja profissional.\n${knowledgeBase}`;

        // 2. Modelos para tentar (em ordem de preferência)
        const models = ['gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-pro'];
        let lastError = null;

        for (const model of models) {
            try {
                console.log(`[IA] Tentando modelo: ${model}...`);
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                
                const response = await axios.post(url, {
                    contents: [{
                        role: 'user',
                        parts: [{ text: `${systemPrompt}\n\nUsuário: ${message}` }]
                    }]
                });

                if (response.data.candidates && response.data.candidates[0].content) {
                    console.log(`[IA] Sucesso com o modelo: ${model}`);
                    return {
                        reply: response.data.candidates[0].content.parts[0].text,
                        status: 'success'
                    };
                }
            } catch (error: any) {
                lastError = error.response?.data || error.message;
                console.error(`[IA] Falha no modelo ${model}:`, lastError);
                // Se o erro não for 404, pode ser algo mais sério, mas vamos tentar o próximo de qualquer forma
            }
        }

        // Se todos falharem
        throw new Error(`Falha total na IA após tentar ${models.join(', ')}. Último erro: ${JSON.stringify(lastError)}`);
    }
}
