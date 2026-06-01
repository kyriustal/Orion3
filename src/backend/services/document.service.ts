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

  /**
   * Extrai o conteúdo de texto e descarrega as imagens principais de um URL.
   * Suporta og:image, twitter:image e imagens <img> normais, filtrando ícones/logos/trackers.
   * Retorna o texto limpo e até 3 imagens em formato Base64 com tipo MIME.
   */
  static async extractPageContentAndImages(
    url: string
  ): Promise<{ text: string; images: { base64: string; mimeType: string }[] }> {
    try {
      console.log(`[DocumentService] A extrair texto e imagens do URL: ${url}`);
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 8000 // Timeout adequado para descarregar a página e imagens
      });

      let html = response.data;
      if (typeof html !== 'string') {
        html = JSON.stringify(html);
      }

      // 1. Extrair Texto limpo
      let text = html
        .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, '')
        .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, '')
        .replace(/<[^>]+>/gm, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const pageText = text.substring(0, 8000);

      // 2. Extrair URLs de Imagens
      const imageUrlsSet = new Set<string>();

      // Tentar og:image primeiro
      const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                           html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
      if (ogImageMatch && ogImageMatch[1]) {
        try {
          const absoluteUrl = new URL(ogImageMatch[1], url).href;
          imageUrlsSet.add(absoluteUrl);
        } catch (_) {}
      }

      // Tentar twitter:image
      const twitterImageMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
                                html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
      if (twitterImageMatch && twitterImageMatch[1]) {
        try {
          const absoluteUrl = new URL(twitterImageMatch[1], url).href;
          imageUrlsSet.add(absoluteUrl);
        } catch (_) {}
      }

      // Tentar <img> tags standard
      const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
      let imgMatch;
      while ((imgMatch = imgRegex.exec(html)) !== null) {
        const src = imgMatch[1];
        if (src) {
          // Filtrar ícones, logos, trackers, etc.
          if (!/logo|icon|pixel|avatar|sprite|tracker|spinner|loader/i.test(src)) {
            try {
              const absoluteUrl = new URL(src, url).href;
              imageUrlsSet.add(absoluteUrl);
            } catch (_) {}
          }
        }
      }

      const imageUrls = Array.from(imageUrlsSet).slice(0, 3); // Limitar a no máximo 3 imagens
      const downloadedImages: { base64: string; mimeType: string }[] = [];

      for (const imgUrl of imageUrls) {
        try {
          console.log(`[DocumentService] A descarregar imagem do anúncio: ${imgUrl}`);
          const imgResponse = await axios.get(imgUrl, {
            responseType: 'arraybuffer',
            timeout: 4000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });

          const contentType = imgResponse.headers['content-type'] || 'image/jpeg';
          if (contentType.startsWith('image/')) {
            const buffer = Buffer.from(imgResponse.data);
            // Ignorar imagens extremamente pequenas (ex: tracking pixels < 1KB)
            if (buffer.length > 1024) {
              const base64 = buffer.toString('base64');
              downloadedImages.push({
                base64,
                mimeType: contentType
              });
            }
          }
        } catch (err: any) {
          console.warn(`[DocumentService] Erro ao descarregar imagem ${imgUrl}:`, err.message);
        }
      }

      return {
        text: pageText,
        images: downloadedImages
      };

    } catch (err: any) {
      console.warn(`[DocumentService] Falha ao extrair conteúdo e imagens do URL ${url}:`, err.message);
      return { text: '', images: [] };
    }
  }
}
