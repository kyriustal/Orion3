import axios from 'axios';
import { getApiKey } from './ai.service';

const GEMINI_MODEL = 'gemini-2.5-flash';
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
    // ─────────────────────────────────────────────────────────
    // 1. Tentar OpenAI Whisper se a chave estiver configurada
    // ─────────────────────────────────────────────────────────
    const openaiKey = process.env.OPENAI_API_KEY?.replace(/^["']|["']$/g, '')?.trim();
    if (openaiKey && openaiKey.length > 10) {
      try {
        console.log(`[AudioService] Tentando transcrição de áudio via OpenAI Whisper...`);

        // Obter extensão correspondente para o arquivo
        const ext = mimeType.includes('mpeg') || mimeType.includes('mp3') ? 'mp3' :
                    mimeType.includes('wav') ? 'wav' :
                    mimeType.includes('webm') ? 'webm' : 'ogg';

        const buffer   = Buffer.from(base64, 'base64');
        const fileBlob = new Blob([buffer], { type: mimeType });

        const formData = new FormData();
        formData.append('file', fileBlob, `audio.${ext}`);
        formData.append('model', 'whisper-1');
        formData.append('language', 'pt');

        const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
          headers: {
            'Authorization': `Bearer ${openaiKey}`,
            'Content-Type': 'multipart/form-data',
          },
          timeout: 25_000,
        });

        const transcript = response.data?.text?.trim();
        if (transcript) {
          console.log(`[AudioService] ✅ Transcrição Whisper concluída com sucesso.`);
          return transcript;
        }
      } catch (err: any) {
        console.error('[AudioService] ❌ Transcrição Whisper falhou:', err.response?.data || err.message);
        console.log('[AudioService] Avançando para fallback Gemini para transcrição de áudio...');
      }
    }

    // ─────────────────────────────────────────────────────────
    // 2. Fallback para Gemini 2.5 Flash
    // ─────────────────────────────────────────────────────────
    let apiKey: string;
    try {
      apiKey = getApiKey(0);
    } catch (err) {
      console.warn('[AudioService] Nenhuma chave Gemini ativa disponível:', err);
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
