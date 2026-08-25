import { postGeminiWithRetry } from './ai.service';

const GEMINI_MODEL = 'gemini-2.0-flash';

/**
 * Serviço de processamento de áudio.
 * Usa o Google Gemini Multimodal para transcrição de voz (STT).
 */
export class AudioService {

  /**
   * Transcreve áudio em Base64 para texto usando o Gemini Multimodal.
   * Retorna o texto transcrito e a língua detectada.
   */
  static async speechToTextFromBase64(
    base64: string,
    mimeType: string
  ): Promise<{ text: string; language: string } | null> {
    try {
      console.log(`[AudioService] 🎙️ Transcrevendo áudio (${mimeType}) via Gemini Multimodal...`);

      // Normalizar mimeType para formatos suportados pelo Gemini
      let normalizedMime = (mimeType || 'audio/ogg').toLowerCase().split(';')[0].trim();
      if (normalizedMime === 'audio/mp3') normalizedMime = 'audio/mpeg';
      if (normalizedMime === 'audio/m4a') normalizedMime = 'audio/mp4';
      if (normalizedMime === 'audio/opus') normalizedMime = 'audio/ogg';

      const responseData = await postGeminiWithRetry(`${GEMINI_MODEL}:generateContent`, {
        contents: [{
          parts: [
            {
              inlineData: {
                mimeType: normalizedMime,
                data: base64,
              }
            },
            {
              text: 'Transcreva com precisão todo o conteúdo falado deste áudio para texto. Retorne APENAS a transcrição literal, sem comentários, prefixos ou formatação extra. Se o áudio estiver completamente silencioso ou inaudível, retorne: [inaudível]'
            }
          ]
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 1000,
        },
      }, 25000);

      const text: string = responseData?.candidates?.[0]?.content?.parts
        ?.filter((p: any) => !p.thought)
        ?.map((p: any) => p.text ?? '')
        ?.join('')
        ?.trim() || '';

      if (!text || text === '[inaudível]') {
        console.warn('[AudioService] Áudio vazio, inaudível ou sem texto reconhecido.');
        return null;
      }

      console.log(`[AudioService] ✅ Áudio transcrito com sucesso: "${text.substring(0, 80)}"`);
      return { text, language: 'pt' };

    } catch (err: any) {
      console.error('[AudioService] ❌ Erro na transcrição de áudio com Gemini:', err.message);
      return null;
    }
  }

  /**
   * TTS desabilitado (exclusivo para texto e áudio recebido)
   */
  static async textToSpeech(_text: string): Promise<string | null> {
    return null;
  }
}

