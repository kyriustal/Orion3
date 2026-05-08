import axios from 'axios';
import { supabase } from '../config/supabase';

/**
 * Serviço de IA - Orion 2 (Versão Ultra-Estável)
 */
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
            throw new Error("API Key não encontrada. Verifique o seu .env.");
        }

        // 1. Prompt Simplificado (Evita erros de codificação)
        const systemPrompt = `Você é o ${botName || 'Orion'}.`;
        const promptText = `${systemPrompt}\n\nPergunta: ${message}`;

        try {
            // Usando Gemini Pro (v1beta) - O modelo mais compatível
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey.trim()}`;
            
            const response = await axios.post(url, {
                contents: [{
                    parts: [{ text: promptText }]
                }]
            }, { timeout: 10000 });

            const reply = response.data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!reply) {
                throw new Error("A IA respondeu mas o texto veio vazio. Verifique sua cota no Google AI Studio.");
            }

            return { reply, status: 'success' };

        } catch (error: any) {
            console.error('IA ERROR:', error.response?.data || error.message);
            const detail = error.response?.data?.[0]?.error?.message || error.message;
            throw new Error(`Erro na IA: ${detail}`);
        }
    }
}
