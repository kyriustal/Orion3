import { supabase } from '../config/supabase';
import dotenv from 'dotenv';

dotenv.config();

export class AIService {
    static async generateResponse(params: {
        message: string;
        botName?: string;
        orgId: string;
        history?: any[];
        mode?: 'simulation' | 'support'; // NOVO: Diferencia a finalidade
    }) {
        const { message, botName, orgId, history = [], mode = 'simulation' } = params;
        const apiKey = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();

        if (!apiKey) throw new Error("Chave não encontrada.");

        let systemPrompt = "";
        let knowledgeContext = "";

        if (mode === 'support') {
            // PERSONALIDADE: SUPORTE TÉCNICO ORION (Chat Flutuante)
            systemPrompt = `Você é o Assistente da Orion. 
            SOBRE A ORION: A Orion é uma plataforma avançada de IA criada para automatizar o atendimento de empresas e vendedores no WhatsApp através de assistentes virtuais 24h.
            SEU OBJETIVO: Ajudar o usuário a configurar seus agentes, conectar o WhatsApp e tirar dúvidas técnicas sobre a plataforma.
            Seja prestativo e profissional.`;
        } else {
            // PERSONALIDADE 2: AGENTE DA EMPRESA (Simulação)
            // Busca conhecimento específico da empresa do usuário no Supabase
            try {
                const { data: files } = await supabase
                    .from('knowledge_files')
                    .select('content_summary')
                    .eq('org_id', orgId)
                    .limit(3);

                if (files && files.length > 0) {
                    knowledgeContext = "\nCONHECIMENTO DA EMPRESA:\n" + 
                        files.map(f => f.content_summary).join("\n---\n");
                }
            } catch (err) {}

            systemPrompt = `Você é o ${botName || 'Assistente Virtual'}. Seu objetivo é atender os clientes da empresa cadastrada. 
            Use apenas o conhecimento abaixo para responder. Se não souber, peça para o cliente aguardar um humano.
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
            const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;

            return { reply: reply || "Não consegui responder agora.", status: 'success' };
        } catch (error: any) {
            throw new Error(error.message);
        }
    }
}
