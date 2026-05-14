import axios from 'axios';
import { getApiKey } from './ai.service';

const GEMINI_MODEL = 'gemini-2.5-flash-preview-05-20';
const GEMINI_BASE  = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Serviço de processamento de áudio.
 * Usa o Gemini 2.5 Flash multimodal para transcrição de voz (STT).
 * TTS é opcional e retorna null se não configurado.
 */
export class AudioService {

  /**
   * Transcreve áudio em Base64 para texto usando Gemini multimodal.
   */
  static async speechToTextFromBase64(
    base64: string,
    mimeType: string
  ): Promise<string | null> {
    let apiKey: string;
    try {
      apiKey = getApiKey();
    } catch (err) {
      console.warn('[AudioService] Nenhuma chave válida:', err);
      return null;
    }

    // Normalizar mimeType para formatos suportados pelo Gemini
    const supportedTypes = ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg; codecs=opus'];
    const normalizedMime = mimeType.includes('ogg') ? 'audio/ogg' : mimeType;

    try {
      const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

      const response = await axios.post(url, {
        contents: [{
          parts: [
            {
              inlineData: {
                mimeType: normalizedMime,
                data: base64,
              }
            },
            {
              text: 'Transcreva este áudio para texto em português. Retorne APENAS a transcrição, sem comentários, introduções ou formatação extra. Se o áudio estiver vazio ou inaudível, retorne: [inaudível]'
            }
          ]
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 512,
        },
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30_000,
      });

      const text: string = response.data?.candidates?.[0]?.content?.parts
        ?.filter((p: any) => !p.thought)
        ?.map((p: any) => p.text ?? '')
        ?.join('')
        ?.trim() || '';

      if (!text || text === '[inaudível]') return null;

      return text;

    } catch (err: any) {
      console.error('[AudioService] Erro na transcrição:', err.response?.data?.error?.message || err.message);
      return null;
    }
  }

  /**
   * Text-to-Speech — retorna null (funcionalidade de voz via Meta é separada).
   * Implementar com Google Cloud TTS se necessário no futuro.
   */
  static async textToSpeech(_text: string): Promise<string | null> {
    // TTS via Google Cloud TTS requer dependência extra.
    // Por enquanto, retorna null para forçar fallback para texto.
    return null;
  }
}
