"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenAITextService = void 0;
// ─────────────────────────────────────────────────────────────────────────────
//  GenAITextService — Chamadas leves de texto ao Gemini (fora do fluxo agente)
//  Usado por: sugestões de conhecimento, copilot do LiveChat, personas de
//  simulação, personalização 1:1 de campanhas e outros utilitários de IA.
// ─────────────────────────────────────────────────────────────────────────────
const axios_1 = __importDefault(require("axios"));
const ai_service_1 = require("./ai.service");
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
exports.GenAITextService = {
    /**
     * Gera texto livre com o Gemini, com rotação de chaves e até 3 tentativas.
     * Lança erro se todas as tentativas falharem.
     */
    async generate(prompt, options = {}) {
        const { system, temperature = 0.7, maxOutputTokens = 1024, timeoutMs = 20000, } = options;
        let lastError = '';
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const apiKey = (0, ai_service_1.getApiKey)(attempt);
                const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
                const body = {
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: { temperature, maxOutputTokens },
                };
                if (system) {
                    body.systemInstruction = { parts: [{ text: system }] };
                }
                const resp = await axios_1.default.post(url, body, {
                    timeout: timeoutMs,
                    httpsAgent: ai_service_1.aiHttpsAgent,
                    headers: { 'Content-Type': 'application/json' },
                });
                const text = resp.data?.candidates?.[0]?.content?.parts
                    ?.map((p) => p.text || '')
                    .join('')
                    .trim() || '';
                if (text)
                    return text;
                lastError = 'Resposta vazia do Gemini.';
            }
            catch (err) {
                lastError = err?.response?.data?.error?.message || err.message || String(err);
                console.warn(`[GENAI-TEXT] Tentativa ${attempt + 1}/3 falhou: ${lastError}`);
            }
        }
        throw new Error(`[GENAI-TEXT] Falha após 3 tentativas: ${lastError}`);
    },
};
