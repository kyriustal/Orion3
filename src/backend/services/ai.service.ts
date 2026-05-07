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

        try {
            // TESTE DE DIAGNÓSTICO: Listar modelos disponíveis
            console.log("[IA] Solicitando lista de modelos disponíveis...");
            const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            const listResponse = await axios.get(listUrl);
            const availableModels = listResponse.data.models?.map((m: any) => m.name.replace('models/', '')) || [];
            
            console.log("[IA] Modelos disponíveis para esta chave:", availableModels.join(', '));

            // Tentar o primeiro da lista que seja "flash" ou "pro"
            const modelToUse = availableModels.find((m: string) => m.includes('1.5-flash')) || 
                               availableModels.find((m: string) => m.includes('pro')) || 
                               availableModels[0];

            if (!modelToUse) throw new Error("Nenhum modelo disponível para esta chave.");

            console.log(`[IA] Tentando o melhor modelo disponível: ${modelToUse}`);

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${apiKey}`;
            const response = await axios.post(url, {
                contents: [{
                    parts: [{ text: `Você é o ${botName || 'Orion'}.\nUsuário: ${message}` }]
                }]
            });

            return {
                reply: response.data.candidates[0].content.parts[0].text,
                status: 'success'
            };

        } catch (error: any) {
            console.error('Erro de Diagnóstico:', error.response?.data || error.message);
            const detail = error.response?.data?.error?.message || error.message;
            throw new Error(`Erro de Conexão com Google AI Studio. Detalhe: ${detail}`);
        }
    }
}
