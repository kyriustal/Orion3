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

        if (!apiKey) {
            throw new Error("Chave não encontrada.");
        }

        try {
            // MODO DIAGNÓSTICO: Listar modelos disponíveis na v1beta
            const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            const listResponse = await fetch(listUrl);
            const listData: any = await listResponse.json();

            if (!listResponse.ok) {
                throw new Error(`Falha ao listar modelos: ${listData.error?.message || listResponse.statusText}`);
            }

            // Pega os nomes dos modelos e remove o prefixo 'models/'
            const availableModels = listData.models?.map((m: any) => m.name.replace('models/', '')) || [];
            
            // Retorna um erro proposital com a lista de modelos para a gente ler na tela
            throw new Error(`MODELOS DISPONÍVEIS: ${availableModels.join(', ')}`);

        } catch (error: any) {
            console.error('Diagnostic Error:', error.message);
            throw new Error(error.message);
        }
    }
}
