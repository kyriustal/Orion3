import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import axios from 'axios';

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

  /**
   * Extrai o conteúdo de texto limpo de uma página web (URL).
   * Remove scripts, estilos e tags HTML, retornando o conteúdo principal estruturado.
   */
  static async extractTextFromUrl(url: string): Promise<string | null> {
    try {
      console.log(`[DocumentService] A extrair conteúdo do URL: ${url}`);
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 5000 // Timeout curto para não bloquear a experiência do WhatsApp
      });

      let html = response.data;
      if (typeof html !== 'string') {
        html = JSON.stringify(html);
      }

      // Remover blocos de script, estilos e marcação HTML
      let text = html
        .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, '')
        .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, '')
        .replace(/<[^>]+>/gm, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (text.length < 30) {
        return null;
      }

      // Limitar o tamanho do conteúdo extraído para otimizar o tamanho do contexto da IA
      return text.substring(0, 8000);
    } catch (err: any) {
      console.warn(`[DocumentService] Falha ao extrair texto do URL ${url}:`, err.message);
      return null;
    }
  }
}
