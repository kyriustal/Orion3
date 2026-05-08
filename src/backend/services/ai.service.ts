import dotenv from 'dotenv';

// Carrega variáveis de ambiente
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

        if (!apiKey || apiKey.length < 10) {
            throw new Error("Chave GEMINI_API_KEY não encontrada no servidor.");
        }

        const promptText = `Você é o ${botName || 'Orion'}.\n\nUsuário: ${message}`;

        try {
            // USANDO FETCH NATIVO E V1 ESTÁVEL
            const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: promptText }]
                    }]
                })
            });

            const data: any = await response.json();

            if (!response.ok) {
                console.error('Gemini API Error Response:', data);
                const errorMsg = data.error?.message || response.statusText;
                throw new Error(`Erro na Google (v1): ${errorMsg}`);
            }

            const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!reply) throw new Error("A IA não retornou texto na resposta.");

            return { reply, status: 'success' };

        } catch (error: any) {
            console.error('Fetch Error:', error.message);
            throw new Error(`Falha de Conexão: ${error.message}`);
        }
    }
}
