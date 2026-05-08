import dotenv from 'dotenv';

dotenv.config();

/**
 * Serviço de IA - Orion 2
 * Motor: Gemini 2.5 Flash (Identificado via Diagnóstico)
 */
export class AIService {
    static async generateResponse(params: {
        message: string;
        botName?: string;
        orgId: string;
        history?: any[];
    }) {
        const { message, botName, orgId, history = [] } = params;
        const apiKey = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();

        if (!apiKey) {
            throw new Error("Chave não encontrada no .env.");
        }

        const promptText = `Você é o ${botName || 'Orion'}.\n\nUsuário: ${message}`;

        try {
            // USANDO O MODELO QUE APARECEU NA SUA LISTA: gemini-2.5-flash
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: promptText }]
                    }],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 1000
                    }
                })
            });

            const data: any = await response.json();

            if (!response.ok) {
                const errorMsg = data.error?.message || "Erro desconhecido";
                throw new Error(`Erro na Google (2.5): ${errorMsg}`);
            }

            const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!reply) throw new Error("A IA respondeu mas o texto veio vazio.");

            return {
                reply,
                status: 'success'
            };

        } catch (error: any) {
            console.error('IA Error:', error.message);
            throw new Error(error.message);
        }
    }
}
