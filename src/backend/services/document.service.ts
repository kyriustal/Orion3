import pdf from 'pdf-parse';
import mammoth from 'mammoth';

export class DocumentService {
    /**
     * Extrai texto de um buffer (PDF ou DOCX)
     */
    static async extractText(buffer: Buffer, mimeType: string): Promise<string> {
        try {
            if (mimeType === 'application/pdf') {
                const data = await pdf(buffer);
                return data.text;
            } else if (
                mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                mimeType === 'application/msword'
            ) {
                const result = await mammoth.extractRawText({ buffer });
                return result.value;
            } else if (mimeType.startsWith('text/')) {
                return buffer.toString('utf8');
            }
            return '';
        } catch (error: any) {
            console.error('[DOCUMENT SERVICE] Erro na extração:', error.message);
            return '';
        }
    }

    /**
     * Extrai texto de base64
     */
    static async extractTextFromBase64(base64: string, mimeType: string): Promise<string> {
        const buffer = Buffer.from(base64, 'base64');
        return this.extractText(buffer, mimeType);
    }
}
