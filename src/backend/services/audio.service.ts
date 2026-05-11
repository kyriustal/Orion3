import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AudioService {
    /**
     * Gera um áudio a partir de um texto usando OpenAI TTS
     * @returns O caminho do arquivo gerado
     */
    static async textToSpeech(text: string, voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'nova'): Promise<string | null> {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) return null;

        try {
            const tempDir = path.join(process.cwd(), 'temp_audio');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

            const filePath = path.join(tempDir, `audio_${Date.now()}.mp3`);

            const response = await axios.post(
                'https://api.openai.com/v1/audio/speech',
                {
                    model: 'tts-1',
                    input: text,
                    voice: voice
                },
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    responseType: 'arraybuffer'
                }
            );

            fs.writeFileSync(filePath, Buffer.from(response.data));
            return filePath;
        } catch (error: any) {
            console.error('[AUDIO SERVICE] Erro ao gerar áudio:', error.response?.data || error.message);
            return null;
        }
    }

    /**
     * Transcreve um áudio para texto usando OpenAI Whisper
     */
    static async speechToText(audioPath: string): Promise<string | null> {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) return null;

        try {
            const formData = new FormData();
            // @ts-ignore
            formData.append('file', fs.createReadStream(audioPath));
            formData.append('model', 'whisper-1');

            const response = await axios.post(
                'https://api.openai.com/v1/audio/transcriptions',
                formData,
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'multipart/form-data'
                    }
                }
            );

            return response.data.text;
        } catch (error: any) {
            console.error('[AUDIO SERVICE] Erro na transcrição:', error.response?.data || error.message);
            return null;
        }
    /**
     * Transcreve um áudio a partir de base64
     */
    static async speechToTextFromBase64(base64: string, mimeType: string): Promise<string | null> {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) return null;

        let tempFilePath = '';
        try {
            const tempDir = path.join(process.cwd(), 'temp_audio');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

            const extension = mimeType.split('/')[1] || 'ogg';
            tempFilePath = path.join(tempDir, `input_${Date.now()}.${extension}`);
            
            fs.writeFileSync(tempFilePath, Buffer.from(base64, 'base64'));

            const transcription = await this.speechToText(tempFilePath);
            
            // Limpeza
            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            
            return transcription;
        } catch (error) {
            if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            return null;
        }
    }
}
