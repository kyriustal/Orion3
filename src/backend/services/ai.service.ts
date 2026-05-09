import { supabase } from '../config/supabase';
import dotenv from 'dotenv';

dotenv.config();

export class AIService {
    static async generateResponse(params: {
        message: string;
        botName?: string;
        orgId: string;
        history?: any[];
        mode?: 'simulation' | 'support';
    }) {
        const { message, botName, orgId, history = [], mode = 'simulation' } = params;
        const apiKey = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();

        if (!apiKey) throw new Error("Chave não encontrada.");

        let systemPrompt = "";
        let knowledgeContext = "";

        if (mode === 'support') {
            systemPrompt = `Você é o Suporte da Orion. Ajude o usuário com a plataforma.`;
        } else {
            // Busca conhecimento...
            try {
                const { data: files } = await supabase.from('knowledge_files').select('content_summary').eq('org_id', orgId).limit(50);
                if (files && files.length > 0) {
                    knowledgeContext = "\nCONTEXTO:\n" + files.map(f => f.content_summary).join("\n\n");
                }
            } catch (err) {}

            systemPrompt = `Você é o ${botName || 'Assistente'}. 
            REGRAS DE AUTOMAÇÃO:
            - Se o usuário quiser comprar, agendar ou deixar contato, responda e termine com o código [TRIGGER_LEAD].
            - Se o usuário estiver bravo ou pedir um atendente humano, termine com [TRIGGER_TRANSFER].
            ${knowledgeContext}`;
        }

        const contents = history.slice(-6).map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
        }));

        contents.push({
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\nPERGUNTA: ${message}` }]
        });

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents })
            });

            const data: any = await response.json();
            let reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

            // Lógica de Automação (Processamento de Triggers)
            let automation_triggered = null;
            let transfer = false;

            if (reply.includes('[TRIGGER_LEAD]')) {
                automation_triggered = "Captura de Lead";
                reply = reply.replace('[TRIGGER_LEAD]', '').trim();
            }
            if (reply.includes('[TRIGGER_TRANSFER]')) {
                transfer = true;
                automation_triggered = "Transferência Humana";
                reply = reply.replace('[TRIGGER_TRANSFER]', '').trim();
            }

            return { 
                reply, 
                automation_triggered, 
                transfer,
                status: 'success' 
            };
        } catch (error: any) {
            throw new Error(error.message);
        }
    }
}
