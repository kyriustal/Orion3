// ─────────────────────────────────────────────────────────────────────────────
//  GenAITextService — Chamadas leves de texto ao Gemini (fora do fluxo agente)
//  Usado por: sugestões de conhecimento, copilot do LiveChat, personas de
//  simulação, personalização 1:1 de campanhas e outros utilitários de IA.
// ─────────────────────────────────────────────────────────────────────────────
import axios from 'axios';
import { aiHttpsAgent, getApiKey } from './ai.service';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_BASE  = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface GenAITextOptions {
  /** Instrução de sistema (contexto/persona) */
  system?: string;
  /** Temperatura (0 = determinístico, 1 = criativo). Default: 0.7 */
  temperature?: number;
  /** Limite de tokens de saída. Default: 1024 */
  maxOutputTokens?: number;
  /** Timeout em ms. Default: 20000 */
  timeoutMs?: number;
}

export const GenAITextService = {
  /**
   * Gera texto livre com o Gemini, com rotação de chaves e até 3 tentativas.
   * Lança erro se todas as tentativas falharem.
   */
  async generate(prompt: string, options: GenAITextOptions = {}): Promise<string> {
    const {
      system,
      temperature = 0.7,
      maxOutputTokens = 1024,
      timeoutMs = 20000,
    } = options;

    let lastError = '';

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const apiKey = getApiKey(attempt);
        const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

        const body: any = {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens },
        };
        if (system) {
          body.systemInstruction = { parts: [{ text: system }] };
        }

        const resp = await axios.post(url, body, {
          timeout: timeoutMs,
          httpsAgent: aiHttpsAgent,
          headers: { 'Content-Type': 'application/json' },
        });

        const text: string = resp.data?.candidates?.[0]?.content?.parts
          ?.map((p: any) => p.text || '')
          .join('')
          .trim() || '';

        if (text) return text;
        lastError = 'Resposta vazia do Gemini.';
      } catch (err: any) {
        lastError = err?.response?.data?.error?.message || err.message || String(err);
        console.warn(`[GENAI-TEXT] Tentativa ${attempt + 1}/3 falhou: ${lastError}`);
      }
    }

    throw new Error(`[GENAI-TEXT] Falha após 3 tentativas: ${lastError}`);
  },
};
