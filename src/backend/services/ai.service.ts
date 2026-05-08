import { supabase } from '../config/supabase';
import dotenv from 'dotenv';

dotenv.config();

export class AIService {
    static async generateResponse(params: {
        message: string;
        botName?: string;
        orgId: string;
        history?: any[];
    }) {
        const { message, botName, orgId, history = [] } = params;
        const apiKey = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();

        if (!apiKey) throw new Error("Chave não encontrada.");

        // 1. Busca Conhecimento no Supabase
        let knowledgeContext = "";
        try {
            const { data: files } = await supabase
                .from('knowledge_files')
                .select('content_summary')
                .eq('org_id', orgId)
                .limit(3);

            if (files && files.length > 0) {
                knowledgeContext = "\nUSE ESTE CONHECIMENTO:\n" + 
                    files.map(f => f.content_summary).join("\n---\n");
            }
        } catch (err) {
            console.warn("Aviso: Erro ao ler conhecimento.");
        }

        // 2. Prepara o Histórico para o Gemini (Formato de Chat)
        // O Gemini usa 'user' e 'model' (em vez de 'bot' ou 'assistant')
        const contents = history.slice(-6).map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
        }));

        // Adiciona a mensagem atual
        contents.push({
            role: 'user',
            parts: [{ text: `INSTRUÇÃO: Você é o ${botName || 'Orion Bot'}. Seja profissional.${knowledgeContext}\n\nPERGUNTA: ${message}` }]
        });

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents })
            });

            const data: any = await response.json();

            if (!response.ok) {
                throw new Error(data.error?.message || "Erro na Google");
            }

            const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;

            return {
                reply: reply || "Não consegui gerar uma resposta.",
                status: 'success'
            };

        } catch (error: any) {
            console.error('IA Error:', error.message);
            throw new Error(error.message);
        }
    }
}
