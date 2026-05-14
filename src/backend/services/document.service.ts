import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

/**
 * Serviço de extracção de texto de documentos.
 * Suporta PDF e DOCX (dependências já instaladas no package.json).
 */
export class DocumentService {

  /**
   * Extrai texto de um documento em Base64.
   * @param base64   Conteúdo do ficheiro em Base64
   * @param mimeType MIME type do ficheiro
   * @returns Texto extraído ou null em caso de falha
   */
  static async extractTextFromBase64(
    base64: string,
    mimeType: string
  ): Promise<string | null> {
    try {
      const buffer = Buffer.from(base64, 'base64');

      // ── PDF ─────────────────────────────────────────────
      if (mimeType === 'application/pdf' || mimeType.includes('pdf')) {
        const data = await pdfParse(buffer);
        const text = data.text?.trim();
        if (!text) return null;
        // Limitar a 15 000 caracteres para não explodir o contexto da IA
        return text.substring(0, 15_000);
      }

      // ── DOCX / Word ──────────────────────────────────────
      if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword' ||
        mimeType.includes('word') ||
        mimeType.includes('docx')
      ) {
        const result = await mammoth.extractRawText({ buffer });
        const text = result.value?.trim();
        if (!text) return null;
        return text.substring(0, 15_000);
      }

      // ── Texto simples ────────────────────────────────────
      if (mimeType.startsWith('text/')) {
        return buffer.toString('utf-8').substring(0, 15_000);
      }

      // Tipo não suportado
      console.warn(`[DocumentService] Tipo de ficheiro não suportado: ${mimeType}`);
      return null;

    } catch (err: any) {
      console.error('[DocumentService] Erro ao extrair texto:', err.message);
      return null;
    }
  }
}
