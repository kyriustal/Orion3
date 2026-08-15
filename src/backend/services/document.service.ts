import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import axios from 'axios';

/**
 * Serviço de extracção de texto e leitura de conteúdos/links/documentos.
 * Suporta PDF, DOCX, páginas web completas, OpenGraph, descompressão de links de anúncios e imagens.
 */
export class DocumentService {

  /**
   * Resolve links de redireccionamento de anúncios ou encurtadores para a URL de destino real.
   * Ex: l.facebook.com/l.php?u=https://site.com -> https://site.com
   * bit.ly/xyz -> https://site.com/produto
   */
  static async resolveTargetUrl(rawUrl: string): Promise<string> {
    try {
      const parsed = new URL(rawUrl);
      const host = parsed.hostname.toLowerCase().replace(/^www\./, '');

      // 1. Descompactar parâmetros de links intermediários do Facebook e Instagram (l.facebook.com, etc.)
      if (host === 'l.facebook.com' || host === 'lm.facebook.com' || host === 'l.instagram.com') {
        const targetParam = parsed.searchParams.get('u') || parsed.searchParams.get('target');
        if (targetParam) {
          try {
            return decodeURIComponent(targetParam);
          } catch (_) {
            return targetParam;
          }
        }
      }

      // 2. Se for um encurtador de URL ou redirect comum, resolver via HEAD/GET rápido (timeout 3s)
      const SHORTENER_HOSTS = ['bit.ly', 'tinyurl.com', 't.co', 'tiny.cc', 'rebrand.ly', 'short.io', 'is.gd', 'buff.ly', 'cutt.ly'];
      if (SHORTENER_HOSTS.some(sh => host === sh || host.endsWith('.' + sh))) {
        const headResp = await axios.get(rawUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          timeout: 3000,
          maxRedirects: 5
        });
        const finalUrl = headResp.request?.res?.responseUrl || headResp.config?.url;
        if (finalUrl && finalUrl !== rawUrl) {
          return finalUrl;
        }
      }

      return rawUrl;
    } catch (_) {
      return rawUrl;
    }
  }

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

      console.warn(`[DocumentService] Tipo de ficheiro não suportado: ${mimeType}`);
      return null;

    } catch (err: any) {
      console.error('[DocumentService] Erro ao extrair texto:', err.message);
      return null;
    }
  }

  /**
   * Extrai o conteúdo de texto e imagens de um URL (anúncios, produtos, páginas de destino).
   * Captura título, meta tags OpenGraph, cabeçalhos, corpo e imagens principais com timeout seguro.
   */
  static async extractPageContentAndImages(
    rawUrl: string
  ): Promise<{ text: string; images: { base64: string; mimeType: string }[] }> {
    try {
      const targetUrl = await this.resolveTargetUrl(rawUrl);
      console.log(`[DocumentService] A extrair conteúdo do URL: ${targetUrl} (original: ${rawUrl})`);
      
      const response = await axios.get(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'pt,pt-PT;q=0.9,en;q=0.8'
        },
        timeout: 4500, // Timeout seguro para não bloquear o fluxo da IA
        maxRedirects: 5
      });

      let html = response.data;
      if (typeof html !== 'string') {
        html = JSON.stringify(html);
      }

      // 1. Extrair Metadados Estruturados (Título, OpenGraph, Descrição)
      let title = '';
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
      }

      let ogTitle = '';
      const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
                           html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
      if (ogTitleMatch && ogTitleMatch[1]) ogTitle = ogTitleMatch[1].trim();

      let description = '';
      const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i) ||
                        html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
      if (descMatch && descMatch[1]) description = descMatch[1].trim();

      // 2. Extrair Cabeçalhos (H1, H2)
      const headings: string[] = [];
      const headingRegex = /<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi;
      let hMatch;
      while ((hMatch = headingRegex.exec(html)) !== null && headings.length < 5) {
        const cleanH = hMatch[1].replace(/<[^>]+>/g, '').trim();
        if (cleanH && cleanH.length > 3) headings.push(cleanH);
      }

      // 3. Extrair Texto Limpo do Corpo
      let cleanBody = html
        .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, '')
        .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, '')
        .replace(/<nav\b[^>]*>([\s\S]*?)<\/nav>/gim, '')
        .replace(/<footer\b[^>]*>([\s\S]*?)<\/footer>/gim, '')
        .replace(/<[^>]+>/gm, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const summaryParts: string[] = [];
      if (ogTitle || title) summaryParts.push(`Título da Página: ${ogTitle || title}`);
      if (description) summaryParts.push(`Descrição/Resumo: ${description}`);
      if (headings.length > 0) summaryParts.push(`Destaques/Seções: ${headings.join(' | ')}`);
      if (cleanBody) summaryParts.push(`Conteúdo Principal:\n${cleanBody.substring(0, 4000)}`);

      const structuredText = summaryParts.join('\n\n');

      // 4. Extrair Imagens Relevantes (og:image, twitter:image, imagens de produto)
      const imageUrlsSet = new Set<string>();

      const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                           html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
      if (ogImageMatch && ogImageMatch[1]) {
        try {
          const absoluteUrl = new URL(ogImageMatch[1], targetUrl).href;
          imageUrlsSet.add(absoluteUrl);
        } catch (_) {}
      }

      const twitterImageMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
                                html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
      if (twitterImageMatch && twitterImageMatch[1]) {
        try {
          const absoluteUrl = new URL(twitterImageMatch[1], targetUrl).href;
          imageUrlsSet.add(absoluteUrl);
        } catch (_) {}
      }

      const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
      let imgMatch;
      while ((imgMatch = imgRegex.exec(html)) !== null && imageUrlsSet.size < 3) {
        const src = imgMatch[1];
        if (src && !/logo|icon|pixel|avatar|sprite|tracker|spinner|loader|badge/i.test(src)) {
          try {
            const absoluteUrl = new URL(src, targetUrl).href;
            imageUrlsSet.add(absoluteUrl);
          } catch (_) {}
        }
      }

      const imageUrls = Array.from(imageUrlsSet).slice(0, 2);
      const downloadedImages: { base64: string; mimeType: string }[] = [];

      for (const imgUrl of imageUrls) {
        try {
          const imgResponse = await axios.get(imgUrl, {
            responseType: 'arraybuffer',
            timeout: 3000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });

          const rawContentType = imgResponse.headers['content-type'];
          const contentType = typeof rawContentType === 'string' ? rawContentType : 'image/jpeg';
          if (contentType.startsWith('image/')) {
            const buffer = Buffer.from(imgResponse.data);
            if (buffer.length > 1024) { // > 1KB
              downloadedImages.push({
                base64: buffer.toString('base64'),
                mimeType: contentType
              });
            }
          }
        } catch (_) {}
      }

      return {
        text: structuredText,
        images: downloadedImages
      };

    } catch (err: any) {
      console.warn(`[DocumentService] Não foi possível extrair detalhes do URL ${rawUrl}: ${err.message}`);
      return { text: '', images: [] };
    }
  }

  /**
   * Descarrega uma imagem diretamente a partir de um URL (ex: imagem de anúncio).
   */
  static async fetchImageAsBase64(imageUrl: string): Promise<{ base64: string; mimeType: string } | null> {
    try {
      const resp = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 4000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      const contentType = (resp.headers['content-type'] as string) || 'image/jpeg';
      if (contentType.startsWith('image/')) {
        return {
          base64: Buffer.from(resp.data).toString('base64'),
          mimeType: contentType
        };
      }
      return null;
    } catch (_) {
      return null;
    }
  }
}
