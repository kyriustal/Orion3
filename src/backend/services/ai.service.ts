import axios from 'axios';
import { supabaseAdmin } from '../config/supabase';
import { DocumentService } from './document.service';
import { AudioService } from './audio.service';

// ─────────────────────────────────────────────────────────────────────────────
//  Tipos
// ─────────────────────────────────────────────────────────────────────────────
export interface ChatMessage {
  sender: 'user' | 'bot' | 'human';
  text: string;
}

export interface CustomerProfile {
  name?: string;
  email?: string;
  phone?: string;
  isReturning?: boolean; // tem histórico anterior às últimas 24h
}

export interface GenerateOptions {
  message: string;
  orgId: string;
  history?: ChatMessage[];
  botName?: string;
  mode?: 'simulation' | 'support';
  media?: { base64: string; mimeType: string };
  referral?: any;
  timeSinceLastMessageHours?: number;
  customerProfile?: CustomerProfile;
}

export interface BookingData {
  name: string;
  email: string;
  subject: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
}

export interface GenerateResult {
  reply: string;
  transfer: boolean;
  booking?: boolean;
  bookingData?: BookingData;
  proposal?: boolean;
  contactData?: { name?: string; email?: string; phone?: string };
  confirm?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Configuração Gemini 2.5 Flash
// ─────────────────────────────────────────────────────────────────────────────
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_BASE  = 'https://generativelanguage.googleapis.com/v1beta/models';

// Chaves de fallback resiliente garantidas para funcionamento contínuo mesmo se o .env do servidor estiver incompleto
const DEFAULT_DEEPSEEK_KEYS = [
  'sk-af8be088f2f64a908b0627e252038e3e'
];

const DEFAULT_GEMINI_KEYS = [
  'AIzaSyAcGFxdt4vcB__g5jafVKvzPuNSfFZDgq0',
  'AIzaSyCx82gslbXvYzNiYsHKAeED4YE0-xSe0vo'
];

// Mapa de cooldown para chaves temporariamente em 429
const geminiKeyCooldowns = new Map<string, number>();

/** Obter lista de todas as chaves Gemini válidas e únicas */
export function getUniqueApiKeys(): string[] {
  const rawKeys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    ...DEFAULT_GEMINI_KEYS
  ].filter(Boolean) as string[];

  const allKeys: string[] = [];
  rawKeys.forEach(k => {
    const cleanStr = k.trim().replace(/^["']|["']$/g, '');
    const parts = cleanStr.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
    allKeys.push(...parts);
  });

  return Array.from(new Set(allKeys.filter(k => k.length > 10)));
}

/** Rotação de chaves Gemini */
export function getApiKey(attempt = 0): string {
  const uniqueKeys = getUniqueApiKeys();
  if (uniqueKeys.length === 0) {
    throw new Error('[AIService] Nenhuma GEMINI_API_KEY válida no .env');
  }
  const baseIdx = Math.floor(Date.now() / 60_000);
  const idx = (baseIdx + attempt) % uniqueKeys.length;
  return uniqueKeys[idx];
}

/** Obter lista de todas as chaves Deepseek válidas e únicas */
export function getUniqueDeepseekApiKeys(): string[] {
  const rawKeys = [
    process.env.DEEPSEEK_API_KEY,
    process.env.DEEPSEEK_API_KEY_2,
    process.env.DEEPSEEK_API_KEY_3,
    process.env.DEEPSEEK_API_KEY_4,
    ...DEFAULT_DEEPSEEK_KEYS
  ].filter(Boolean) as string[];

  const allKeys: string[] = [];
  rawKeys.forEach(k => {
    const cleanStr = k.trim().replace(/^["']|["']$/g, '');
    const parts = cleanStr.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
    allKeys.push(...parts);
  });

  return Array.from(new Set(allKeys.filter(k => k.length > 10)));
}

/**
 * Executa uma requisição POST para a API do Gemini com rotação de chaves e retentativas.
 */
export async function postGeminiWithRetry(
  endpointPath: string,
  payload: any,
  timeout = 25000
): Promise<any> {
  const keys = getUniqueApiKeys();
  if (keys.length === 0) {
    throw new Error('[GeminiRetry] Nenhuma GEMINI_API_KEY configurada.');
  }

  let lastError = '';
  const now = Date.now();
  // Priorizar chaves fora de cooldown
  const sortedKeys = [...keys].sort((a, b) => {
    const cdA = geminiKeyCooldowns.get(a) || 0;
    const cdB = geminiKeyCooldowns.get(b) || 0;
    return (cdA > now ? 1 : 0) - (cdB > now ? 1 : 0);
  });

  for (let idx = 0; idx < sortedKeys.length; idx++) {
    const apiKey = sortedKeys[idx];
    const url = `${GEMINI_BASE}/${endpointPath}?key=${apiKey}`;
    const masked = apiKey.substring(0, 8) + '...' + apiKey.substring(apiKey.length - 4);

    try {
      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout,
      });
      return response.data;
    } catch (err: any) {
      const status = err.response?.status ?? 'N/A';
      const errMsg = err.response?.data?.error?.message || err.message;
      lastError = `Chave (${masked}) HTTP ${status}: ${errMsg}`;
      if (status === 429) {
        geminiKeyCooldowns.set(apiKey, Date.now() + 25_000);
      }
      console.warn(`[GeminiRetry] Falha na chave (${masked}):`, lastError);
      continue;
    }
  }

  throw new Error(`[GeminiRetry] Todas as chaves do Gemini falharam. Último erro: ${lastError}`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Construção do System Prompt
// ─────────────────────────────────────────────────────────────────────────────
interface OrgProfile {
  name?: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  maps_link?: string;
  social_object?: string;
  product_description?: string;
  chatbot_name?: string;
  emoji_mode?: string;
  handover_mode?: string;
  ai_prompt?: string;
  ai_tone?: string;
  calendar_provider?: string;
  calendar_link?: string;
}

function buildSystemPrompt(
  mode: 'simulation' | 'support',
  org: OrgProfile | null,
  botNameOverride?: string,
  referral?: any,
  timeSinceLastMessageHours?: number,
  urlContext?: string,
  customerProfile?: CustomerProfile
): string {
  if (mode === 'support') {
    return `Você é o assistente virtual de suporte da **Orion** — plataforma SaaS angolana de automação de atendimento ao cliente via WhatsApp com Inteligência Artificial.

MISSÃO: Ajudar utilizadores com dúvidas sobre a plataforma Orion (configuração, billing, WhatsApp Cloud API, campanhas, live chat, etc.)

REGRAS:
- Responda sempre em português (angolano/europeu), de forma clara e concisa.
- Seja empático, profissional e prestativo.
- Se não souber a resposta exacta, diga honestamente e sugira contactar o suporte via email.
- Nunca revele detalhes técnicos internos do sistema.
- Nunca invente funcionalidades que não existem.`;
  }

  const botName     = botNameOverride || org?.chatbot_name || 'Assistente';
  const companyName = org?.name || 'nossa empresa';
  const sector      = org?.social_object || '';
  const knowledge   = org?.product_description || '';
  const emojiMode   = org?.emoji_mode || 'moderate';
  const tone        = org?.ai_tone || 'friendly';

  const companyPhone = org?.phone || org?.whatsapp || '';
  const companyAddress = org?.address || '';
  const mapsLink = org?.maps_link || '';

  let companyContactInfo = '';
  if (companyPhone || companyAddress || mapsLink) {
    const infoLines: string[] = [];
    if (companyPhone) infoLines.push(`- Telefone / WhatsApp da Empresa: ${companyPhone}`);
    if (companyAddress) infoLines.push(`- Endereço / Localização física: ${companyAddress}`);
    if (mapsLink) {
      infoLines.push(`- Link do Google Maps: ${mapsLink}`);
      infoLines.push(`- REGRA OBRIGATÓRIA DE LOCALIZAÇÃO: Quando o cliente pedir a localização, morada, mapa ou como chegar, forneça a morada física e envie SEMPRE o link exatamente no formato clicável: [Localizar no Google Maps](${mapsLink}).`);
    }
    companyContactInfo = `\n═══ CONTACTO E LOCALIZAÇÃO OFICIAL DA EMPRESA ═══\n${infoLines.join('\n')}\n`;
  }

  const emojiRules: Record<string, string> = {
    none:     'NÃO use emojis em nenhuma circunstância. Seja puramente textual e formal.',
    moderate: 'Use emojis com muita parcimónia — máximo 1 por mensagem e apenas quando natural.',
    adaptive: 'Observe o perfil do cliente. Nas primeiras mensagens use com moderação. Se o cliente usar emojis, espelhe o estilo dele.',
  };

  const toneRules: Record<string, string> = {
    friendly: `═══ ESTILO DE COMUNICAÇÃO: AMIGÁVEL, CARISMÁTICO E ALTAMENTE PERSUASIVO ═══
- PERSONALIDADE: Excepcionalmente caloroso, atencioso, entusiasmado e cheio de energia positiva! Aja como um humano simpático, acolhedor e genuíno, transmitindo vibrações excelentes.
- EMPATIA & PERSUASÃO: Conecte-se emocionalmente com as dores e desejos do cliente. Valide as dúvidas dele com entusiasmo sincero e conduza-o de forma assertiva, carismática e persuasiva em direção à solução/compra, focando nos benefícios reais.
- ENERGIA: Nunca responda de forma fria, robótica, curta demais ou puramente técnica. Mostre carinho e dedicação em cada frase.`,
    
    professional: `═══ ESTILO DE COMUNICAÇÃO: PROFISSIONAL, CARISMÁTICO E PERSUASIVO ═══
- PERSONALIDADE: Polido, altamente capacitado, seguro e carismático. Transmita autoridade de mercado mantendo-se sempre muito prestativo e simpático.
- EMPATIA & PERSUASÃO: Entenda a fundo as necessidades do cliente, apresentando as soluções da empresa com forte argumentação lógica e persuasão de alto nível.
- ENERGIA: Firme, confiante e extremamente focado em gerar valor e credibilidade absoluta.`,
    
    ultra_formal: `═══ ESTILO DE COMUNICAÇÃO: ULTRA-FORMAL E RIGOROSO ═══
- PERSONALIDADE: Muito formal, polido e corporativo. Respeito absoluto pelas normas de cortesia clássica.
- PERSUASÃO: Conduza o cliente com lógica irrefutável e sobriedade técnica, sem o uso de informalidades, gírias ou expressões coloquiais.`
  };

  const selectedToneInstructions = toneRules[tone] || toneRules.friendly;

  const transferRule = '- Se o cliente pedir explicitamente para falar com um humano, atendente ou pessoa real, inicie a sua resposta com o token [TRANSFERIR_HUMANO] e despeça-se gentilmente.';

  const bookingRule = `
═══ FLUXO OBRIGATÓRIO DE AGENDAMENTO (WHATSAPP) ═══
Quando o cliente quiser agendar um compromisso, marcação, reunião, consulta ou serviço:
1. Você deve recolher os 4 dados essenciais (se o nome do cliente já for conhecido da conversa anterior ou do perfil, NÃO volte a perguntar o nome, use o nome já conhecido!):
   - 👤 Nome do cliente
   - ✉️ E-mail do cliente (essencial para envio do convite automático da agenda)
   - 📋 Assunto a tratar (motivo específico ou tipo de serviço pretendido)
   - 📅 Data e Hora desejada (ex: 2026-08-20 às 15:00)

2. Dinâmica de Conversação:
   - Se faltar qualquer um destes dados, pergunte amigavelmente e de forma fluida apenas pelos dados em falta.
   - REGRA OBRIGATÓRIA E INEGOCIÁVEL: No momento em que você confirmar o agendamento ao cliente (quando tiver os dados ou quando o cliente fornecer a data/hora/email), você DEVE OBRIGATORIAMENTE incluir no INÍCIO da sua resposta o token:
     [BOOKING_CONFIRMED:{"name":"<Nome do Cliente>","email":"<email@dominio.com>","subject":"<Assunto>","date":"<YYYY-MM-DD>","time":"<HH:MM>"}]
   - Se o nome não estiver na mensagem imediata mas for conhecido de antes, preencha o campo "name" com o nome conhecido.
   - O campo "date" no token DEVE ser SEMPRE em formato ISO YYYY-MM-DD (ex: 2026-08-18) e a hora no formato HH:MM (ex: 10:00).
   - Confirme com entusiasmo ao cliente que a sua marcação foi agendada com sucesso, que o convite foi enviado para o seu e-mail e que receberá um SMS de confirmação.
   - Caso o cliente apenas pergunte como agendar mas ainda não forneceu os dados, inclua o token [AGENDAR] e solicite os dados necessários.
`;

  const proposalRule = '- PROPOSTAS COMERCIAIS DO CLIENTE: Se o cliente enviar uma proposta comercial (oferta de parceria, prestação de serviços, etc.), responda de forma diplomática e profissional, informe que irá encaminhar para a área competente, e inclua o token [PROPOSTA] no INÍCIO da sua resposta.';

  const contactRule = '- Se o cliente partilhar espontaneamente informações de contacto (nome completo, email, número de telefone, morada ou empresa), inclua no INÍCIO da sua resposta o token compacto [CONTATO:{"name":"<nome>","email":"<email>","phone":"<tel>"}] preenchendo APENAS os campos informados. Exemplo: [CONTATO:{"name":"Ana Silva","phone":"+244912345678"}].';

  // Construção do contexto rico do anúncio (Meta Ads / Instagram / CTWA)
  let referralContext = '';
  if (referral) {
    const adDetails: string[] = [];
    if (referral.headline) adDetails.push(`- Título do Anúncio: "${referral.headline}"`);
    if (referral.body) adDetails.push(`- Texto/Descrição do Anúncio: "${referral.body}"`);
    if (referral.source_url) adDetails.push(`- Link/Página do Anúncio: ${referral.source_url}`);
    if (referral.source_type) adDetails.push(`- Origem: ${referral.source_type}`);
    if (referral.media_type) adDetails.push(`- Formato do Anúncio: ${referral.media_type}`);

    const adTheme = referral.headline || referral.body || 'nosso anúncio';

    referralContext = `
═══ CONTEXTO DO ANÚNCIO DE ORIGEM (META / WHATSAPP ADS) ═══
O cliente iniciou este contacto clicando directamente num anúncio patrocinado da empresa.
${adDetails.join('\n')}

INSTRUÇÕES CRÍTICAS PARA ATENDIMENTO DE LEADS DE ANÚNCIOS:
1. Reconheça e saude o cliente com muito entusiasmo, contextualizando imediatamente com a oferta anunciada ("${adTheme}").
2. NÃO faça perguntas genéricas ("como posso ajudar?"). Vá direto ao assunto da oferta anunciada de forma calorosa, consultiva e prestativa.
3. Se o cliente perguntar preços ou como funciona, responda aos valores/pacotes de forma transparente, estruturada e consultiva, guiando-o rumo ao próximo passo.
`;
  }

  // Contexto de URLs/links extraído pelo sistema
  const urlContextSection = urlContext
    ? `\n═══ CONTEXTO DE PÁGINAS WEB / LINKS EXTRAÍDOS PELO SISTEMA ═══\nO conteúdo abaixo foi extraído automaticamente de páginas web ou anúncios associados ao link enviado ou clicado. Use estas informações para enriquecer a sua resposta e entender com precisão a oferta/página que o cliente está a visualizar:\n${urlContext}\n`
    : '';

  let returnGreetingRule = '';
  if (timeSinceLastMessageHours !== undefined && timeSinceLastMessageHours >= 1) {
    returnGreetingRule = `- O cliente esteve inativo por mais de 1 hora. Se a nova mensagem dele for uma saudação (ex: "Olá", "Bom dia"), dê uma saudação calorosa e breve, pergunte como pode ajudar e retome o assunto de forma cativante.`;
  }

  // Secção de memória do cliente
  let customerMemorySection = '';
  if (customerProfile && (customerProfile.name || customerProfile.email || customerProfile.isReturning)) {
    const lines: string[] = [];
    const firstName = customerProfile.name ? customerProfile.name.trim().split(/\s+/)[0] : '';
    if (firstName) lines.push(`- Nome do cliente: ${firstName}`);
    if (customerProfile.email) lines.push(`- Email do cliente: ${customerProfile.email}`);
    if (customerProfile.isReturning) {
      lines.push(`- Cliente recorrente: Sim (já manteve conversas anteriores com a empresa)`);
      lines.push(`- INSTRUÇÕES CRÍTICAS: Trate o cliente pelo primeiro nome ("${firstName}"). Não o trate como novo cliente.`);
    } else if (firstName) {
      lines.push(`- Trate o cliente pelo primeiro nome ("${firstName}").`);
    }
    customerMemorySection = `\n═══ MEMÓRIA DO CLIENTE (DADOS CONHECIDOS) ═══\n${lines.join('\n')}\n`;
  }

  return `Você é ${botName}, assistente virtual oficial da empresa "${companyName}".
${customerMemorySection}
${companyContactInfo}
${sector ? `Sector de actividade: ${sector}.` : ''}

═══ SUA PERSONALIDADE E COMPORTAMENTO (DEFINIDOS PELO USUÁRIO NO PAINEL) ═══
${org?.ai_prompt ? org.ai_prompt : 'Você deve agir como um assistente extremamente simpático, cordial, prestativo, persuasivo e carismático.'}

═══ METODOLOGIA DE VENDAS CONSULTIVAS DE ALTO DESEMPENHO ═══
Você é também uma especialista sénior em vendas consultivas e estratégia comercial de alto desempenho. O seu objectivo é conduzir o cliente a uma tomada de decisão consciente, focando no valor máximo antes de falar de números. Siga rigorosamente as 4 fases abaixo:

🔵 FASE 1 — ESCUTA PROFUNDA E CONEXÃO (Deep Listening)
- Pratique escuta activa e empática. Deixe o cliente falar e sinta as dores dele.
- Faça perguntas abertas e investigativas para extrair dores implícitas, desejos e o real cenário do cliente.

🟡 FASE 2 — DIAGNÓSTICO COMPLETO
- Mapeie a necessidade do cliente com máxima profundidade: situação actual, impacto do problema, urgência e custo da inacção.
- Valide o diagnóstico com o cliente antes de avançar.

🟠 FASE 3 — CONSTRUÇÃO DA OFERTA DE ALTO VALOR
- Estruture a solução ideal sob medida para o perfil e as dores identificadas no cliente.
- Conecte cada recurso ou funcionalidade da oferta a um benefício exclusivo e ao valor gerado.

🔴 FASE 4 — REVELAÇÃO DO PREÇO E FECHAMENTO
- Apresente os valores com total clareza e transparência quando solicitado ou após o diagnóstico.
- Conduza o fechamento com naturalidade, confiança e sem pressão excessiva.

═══ BASE DE CONHECIMENTO DA EMPRESA ═══
${knowledge ? knowledge : 'Você deve agir como um assistente cordial e prestativo.'}

${referralContext}
${urlContextSection}
${selectedToneInstructions}

═══ REGRAS DE COMPORTAMENTO OBRIGATÓRIAS ═══
- DÚVIDAS FORA DA BASE DE DADOS: Se o cliente solicitar informações que NÃO existam na sua base de conhecimento, responda de forma muito simpática dizendo que irá confirmar com a equipa técnica e inclua o token [CONFIRMAR_INFORMAÇÃO] no final da sua resposta.
- PROIBIDO VAZAR RACIOCÍNIO: A resposta deve conter EXCLUSIVAMENTE a mensagem final em português que será lida pelo cliente. Nunca inclua blocos em inglês ou marcas de pensamento interno.
- SEPARAÇÃO OBRIGATÓRIA: Informações de contexto de links e anúncios são dados do sistema para seu conhecimento. Use-os para responder ao cliente de forma certeira e natural.
- PRIMEIRA MENSAGEM (SAUDAÇÃO): Deve ser uma saudação super simpática e calorosa.
- FORMATAÇÃO: Realce termos importantes em **negrito**. Mantenha a pontuação limpa, sem tags desnecessárias.
- ENVIO DE ARQUIVOS: Sempre que o cliente pedir arquivos ou catálogos listados na secção de arquivos, inclua o token [SEND_FILE: ID].

REGRAS OBRIGATÓRIAS:
- Responda SEMPRE em português (angolano/europeu).
- ${emojiRules[emojiMode] || emojiRules.moderate}
- Seja prestável e resolva os problemas do cliente com eficiência.
- Nunca revele que é uma IA.
${transferRule}
${bookingRule}
${proposalRule}
${contactRule}`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Construção do histórico de conversa para Gemini
// ─────────────────────────────────────────────────────────────────────────────
function buildContents(
  history: ChatMessage[],
  message: string,
  media?: { base64: string; mimeType: string },
  extraImages?: { base64: string; mimeType: string }[]
): any[] {
  const contents: any[] = [];

  for (const h of history) {
    if (!h.text?.trim()) continue;
    const role = h.sender === 'user' ? 'user' : 'model';
    contents.push({
      role,
      parts: [{ text: h.text }],
    });
  }

  const userParts: any[] = [];

  if (media && (
    media.mimeType.startsWith('image/') ||
    media.mimeType.startsWith('video/') ||
    media.mimeType.startsWith('audio/')
  )) {
    userParts.push({
      inlineData: { mimeType: media.mimeType, data: media.base64 }
    });
  }

  if (extraImages && extraImages.length > 0) {
    extraImages.forEach(img => {
      userParts.push({
        inlineData: { mimeType: img.mimeType, data: img.base64 }
      });
    });
  }

  userParts.push({ text: message });
  contents.push({ role: 'user', parts: userParts });

  // Agrupar mensagens consecutivas do mesmo role
  const mergedList: any[] = [];
  for (const item of contents) {
    if (mergedList.length > 0 && mergedList[mergedList.length - 1].role === item.role) {
      const lastMerged = mergedList[mergedList.length - 1];
      if (item.parts) {
        lastMerged.parts.push(...item.parts);
      } else if (item.text) {
        lastMerged.parts.push({ text: item.text });
      }
    } else {
      mergedList.push(item);
    }
  }

  while (mergedList.length > 0 && mergedList[0].role !== 'user') {
    mergedList.shift();
  }

  return mergedList;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Pesquisa Externa em Tempo Real (DuckDuckGo Lite Grounding)
// ─────────────────────────────────────────────────────────────────────────────
async function performWebSearch(query: string): Promise<string> {
  try {
    // Limpar marcadores de metadados antes de pesquisar
    const cleanQuery = query
      .replace(/\[[^\]]+\]/g, ' ')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanQuery.length < 4) return '';

    console.log(`[Search] 🔍 A pesquisar em fontes oficiais: "${cleanQuery.substring(0, 80)}"...`);

    const searchResp = await axios.get(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery + ' site oficial')}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 4000
      }
    );

    const html = searchResp.data as string;
    const urlPattern = /href="(https?:\/\/(?!duckduckgo)[^"&]+)"/gi;
    const foundUrls: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = urlPattern.exec(html)) !== null && foundUrls.length < 3) {
      const u = m[1];
      if (!/facebook|instagram|twitter|youtube|tiktok|pinterest|reddit|amazon/i.test(u)) {
        foundUrls.push(u);
      }
    }

    if (foundUrls.length === 0) return '';

    const pageResults = await Promise.all(
      foundUrls.map(async (url, idx) => {
        try {
          const pageResp = await axios.get(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 3500
          });
          const pageHtml = pageResp.data as string;
          const text = pageHtml
            .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gim, '')
            .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gim, '')
            .replace(/<[^>]+>/gm, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 2000);

          if (text.length > 50) {
            return `[Fonte ${idx + 1} — ${url}]:\n${text}`;
          }
          return null;
        } catch {
          return null;
        }
      })
    );

    const validResults = pageResults.filter(Boolean) as string[];
    if (validResults.length > 0) {
      return `═══ INFORMAÇÕES REAIS EXTRAÍDAS DE FONTES OFICIAIS ═══\n${validResults.join('\n\n')}`;
    }
    return '';
  } catch (err: any) {
    console.warn('[Search] ⚠️  Falha na pesquisa externa (não crítico):', err.message);
    return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Serviço Principal de IA
// ─────────────────────────────────────────────────────────────────────────────
export class AIService {

  /**
   * Descreve ou transcreve uma imagem usando o Gemini multimodal com rotação de chaves.
   */
  static async describeImageWithGemini(base64: string, mimeType: string): Promise<string> {
    try {
      console.log(`[AIService] Descrevendo imagem (${mimeType}) com Gemini...`);
      const responseData = await postGeminiWithRetry(`${GEMINI_MODEL}:generateContent`, {
        contents: [{
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64,
              }
            },
            {
              text: 'Descreva esta imagem detalhadamente em português, identificando qualquer texto escrito, documentos, informações relevantes, ofertas ou produtos. Retorne apenas a descrição direta para servir de contexto à conversa.'
            }
          ]
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 800,
        }
      }, 15000);

      const text = responseData?.candidates?.[0]?.content?.parts
        ?.filter((p: any) => !p.thought)
        ?.map((p: any) => p.text ?? '')
        ?.join('')
        ?.trim() || '';

      return text;
    } catch (err: any) {
      console.error('[AIService] Falha ao descrever imagem com Gemini:', err.message);
      return '';
    }
  }

  static async generateResponse(options: GenerateOptions): Promise<GenerateResult> {
    const {
      message,
      orgId,
      history = [],
      botName,
      mode = 'simulation',
      media,
      referral,
      timeSinceLastMessageHours,
      customerProfile,
    } = options;

    // 0. Leitura e extração inteligente de URLs da mensagem e do anúncio (referral)
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
    const messageUrls = message.match(urlRegex) || [];
    const referralUrl = referral?.source_url ? [referral.source_url] : [];
    const allCandidateUrls = Array.from(new Set([...messageUrls, ...referralUrl]));

    let urlContextBlocks: string[] = [];
    let extractedImages: { base64: string; mimeType: string }[] = [];

    // Se houver imagem direta no anúncio (referral.image_url), descarregá-la
    if (referral?.image_url) {
      try {
        console.log(`[AIService] 🖼️ Descarregando imagem associada ao anúncio: ${referral.image_url.substring(0, 60)}...`);
        const adImg = await DocumentService.fetchImageAsBase64(referral.image_url);
        if (adImg) extractedImages.push(adImg);
      } catch (_) {}
    }

    if (allCandidateUrls.length > 0) {
      console.log(`[AIService] 🔗 ${allCandidateUrls.length} URL(s) identificados (mensagem / anúncio). A extrair conteúdo...`);
      const urlFetches = allCandidateUrls.slice(0, 2).map(async (url) => {
        try {
          const result = await DocumentService.extractPageContentAndImages(url);
          if (result && result.text) {
            if (result.images && result.images.length > 0) {
              extractedImages.push(...result.images);
            }
            return `[Página / Oferta no Link ${url}]:\n${result.text}`;
          }
        } catch (urlErr: any) {
          console.warn(`[AIService] ⚠️ Falha não crítica ao ler URL ${url}: ${urlErr.message}`);
        }
        return null;
      });

      const results = await Promise.all(urlFetches);
      urlContextBlocks = results.filter(Boolean) as string[];
    }

    // ── Pré-processamento multimodal via Gemini (Áudio, Imagem, Documento) ──
    let enrichedMessage = message;
    let mediaForAI: { base64: string; mimeType: string } | undefined = media;

    if (mediaForAI) {
      if (mediaForAI.mimeType.startsWith('audio/')) {
        console.log(`[AIService] 🎙️ [Gemini Multimodal] Transcrevendo áudio...`);
        try {
          const stt = await AudioService.speechToTextFromBase64(mediaForAI.base64, mediaForAI.mimeType);
          if (stt?.text) {
            enrichedMessage = `${enrichedMessage}\n\n[Áudio transcrito]:\n${stt.text}`.trim();
          }
        } catch (e: any) {
          console.error('[AIService] ❌ Falha ao transcrever áudio:', e.message);
        }
        mediaForAI = undefined;

      } else if (
        mediaForAI.mimeType.includes('pdf') ||
        mediaForAI.mimeType.includes('word') ||
        mediaForAI.mimeType.includes('docx') ||
        mediaForAI.mimeType.startsWith('text/')
      ) {
        console.log(`[AIService] 📄 [Gemini Multimodal] Extraindo documento...`);
        try {
          const docText = await DocumentService.extractTextFromBase64(mediaForAI.base64, mediaForAI.mimeType);
          if (docText) {
            enrichedMessage = `${enrichedMessage}\n\n[Documento anexo]:\n${docText}`.trim();
          }
        } catch (e: any) {
          console.error('[AIService] ❌ Falha ao extrair documento:', e.message);
        }
        mediaForAI = undefined;

      } else if (mediaForAI.mimeType.startsWith('image/')) {
        console.log(`[AIService] 🖼️ [Gemini Multimodal] Descrevendo imagem...`);
        try {
          const description = await AIService.describeImageWithGemini(mediaForAI.base64, mediaForAI.mimeType);
          if (description) {
            enrichedMessage = `${enrichedMessage}\n\n[Imagem anexa — descrição]:\n${description}`.trim();
          }
        } catch (e: any) {
          console.error('[AIService] ❌ Falha ao descrever imagem:', e.message);
        }
        mediaForAI = undefined;
      }
    }

    // Descrever imagens de páginas/anúncios extraídas
    if (extractedImages.length > 0) {
      console.log(`[AIService] Descrevendo ${extractedImages.length} imagem(ns) do anúncio/link...`);
      for (const img of extractedImages.slice(0, 2)) {
        try {
          const desc = await AIService.describeImageWithGemini(img.base64, img.mimeType);
          if (desc) {
            enrichedMessage = `${enrichedMessage}\n\n[Imagem do Anúncio/Link — descrição visual]:\n${desc}`.trim();
          }
        } catch (_) {}
      }
    }

    const urlSystemContext = urlContextBlocks.length > 0 ? urlContextBlocks.join('\n\n') : undefined;

    // 1. Carregar perfil da organização, Base de Conhecimento e Assets
    let org: OrgProfile | null = null;
    let externalKnowledge = '';
    let availableAssets = '';

    if (orgId && mode !== 'support') {
      const { data: orgData } = await supabaseAdmin
        .from('organizations')
        .select('name, phone, whatsapp, address, maps_link, social_object, product_description, chatbot_name, emoji_mode, handover_mode, ai_prompt, ai_tone, calendar_provider, calendar_link')
        .eq('id', orgId)
        .maybeSingle();
      org = orgData;

      const { data: docs } = await supabaseAdmin
        .from('knowledge_docs')
        .select('filename, content')
        .eq('org_id', orgId);

      if (docs && docs.length > 0) {
        externalKnowledge = docs
          .map(d => `--- DOCUMENTO: ${d.filename} ---\n${d.content}`)
          .join('\n\n');
      }

      const { data: snippets } = await supabaseAdmin
        .from('bot_instructions')
        .select('content')
        .eq('org_id', orgId);

      const snippetsText = (snippets || []).map(s => s.content).join('\n');

      const { data: assets } = await supabaseAdmin
        .from('public_assets')
        .select('id, filename, description')
        .eq('org_id', orgId);

      if (assets && assets.length > 0) {
        availableAssets = '\n═══ ARQUIVOS QUE VOCÊ PODE ENVIAR AO CLIENTE ═══\n' +
          assets.map(a => `- ID: ${a.id} | Descrição: ${a.description} | Arquivo: ${a.filename}`).join('\n') +
          '\nPara enviar um arquivo, inclua exatamente o código [SEND_FILE: ID] na sua resposta.';
      }

      // Pesquisa externa para dados que exijam atualização
      let searchResults = '';
      const isSearchNeeded = /consulado|taxa oficial|lei atual|governo|embaixada|notícia recente/i.test(enrichedMessage);
      if (isSearchNeeded) {
        try {
          searchResults = await performWebSearch(enrichedMessage);
        } catch (err) {
          console.warn('[Search] Erro não crítico na pesquisa:', err);
        }
      }

      externalKnowledge = `${snippetsText}\n\n${externalKnowledge}\n\n${searchResults}`.trim();
    }

    // Auxiliar para limpar pensamento interno
    function extractCleanText(parts: any[]): string {
      const textParts = parts
        .filter((p: any) => !p.thought && !p.executableCode && !p.codeExecutionResult)
        .map((p: any) => (p.text ?? '').trim())
        .filter(Boolean);

      let raw = textParts.join('\n').trim();
      if (!raw) return '';

      raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');
      raw = raw.replace(/^(The user (is asking|wants|said|mentioned)|I need to|I should|Let me|I will|I'll|Okay,|Sure,|Certainly,).*$/gim, '');
      raw = raw.replace(/```(?:python|tool_code|json|javascript|typescript)?[\s\S]*?```/gi, '');
      raw = raw.replace(/tool_code\s*[\s\S]*?(?=\n\n|$)/gi, '');
      raw = raw.replace(/print\(.*?\)/gi, '');
      raw = raw.replace(/^(Thought:|Reasoning:|Step \d+:|Analysis:|Context:).*$/gim, '');
      raw = raw.replace(/\n{3,}/g, '\n\n').trim();

      return raw;
    }

    // Auxiliar robusto para extração de BookingData (com suporte a fallback de texto natural)
    function parseBookingData(
      text: string,
      historyList: ChatMessage[] = [],
      currentMsg: string = '',
      cProfile?: CustomerProfile
    ): BookingData | undefined {
      // 1. Tentar extração direta via token [BOOKING_CONFIRMED:...]
      const tag = '[BOOKING_CONFIRMED:';
      const tagIdx = text.indexOf(tag);
      if (tagIdx !== -1) {
        const jsonStart = tagIdx + tag.length;
        let depth = 0, jsonEnd = -1;
        for (let ci = jsonStart; ci < text.length; ci++) {
          if (text[ci] === '{') depth++;
          else if (text[ci] === '}') {
            depth--;
            if (depth === 0) { jsonEnd = ci; break; }
          }
        }
        if (jsonEnd !== -1) {
          const jsonStr = text.substring(jsonStart, jsonEnd + 1);
          console.log('[AIService] BOOKING_CONFIRMED JSON extraido:', jsonStr);
          try {
            const b = JSON.parse(jsonStr);
            const name = (b.name || cProfile?.name || 'Cliente').trim();
            const email = (b.email || cProfile?.email || '').trim();
            const subject = (b.subject || 'Consulta / Atendimento').trim();
            let date = (b.date || '').trim();
            let time = (b.time || '').trim();

            if (date && time && email.includes('@')) {
              if (time.length === 5 && !time.includes(':')) {
                time = `${time.substring(0, 2)}:${time.substring(2)}`;
              }
              return { name, email, subject, date, time };
            }
          } catch (pe: any) {
            console.error('[AIService] BOOKING_CONFIRMED parse error:', pe.message, '| JSON:', jsonStr);
          }
        }
      }

      // 2. Fallback de Recuperação Automática:
      // Se a IA confirmou a marcação no texto mas omitiu o token de máquina
      const isConfirmedInText = /marcação\s+(?:está\s+)?confirmada|agendamento\s+(?:está\s+)?confirmado|consulta\s+(?:está\s+)?confirmada|marcação\s+confirmada|agendamento\s+confirmado|sua\s+marcação\s+está\s+confirmada/i.test(text);

      if (isConfirmedInText) {
        console.log('[AIService] 🔍 Detetada confirmação de agendamento no texto! A recuperar dados com fallback inteligente...');

        const fullContext = [
          text,
          currentMsg,
          ...historyList.slice(-4).map(h => h.text),
          cProfile?.name,
          cProfile?.email,
        ].filter(Boolean).join('\n');

        // Extrair E-mail
        const emailMatch = fullContext.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        const email = emailMatch ? emailMatch[1].trim() : (cProfile?.email || '');

        // Extrair Hora (ex: "10h00", "10:00", "15h30", "às 10h", "10:00")
        let time = '';
        const timeMatch = fullContext.match(/(?:às|as|hora|horário|horario|ás)?\s*(\b[0-2]?[0-9])[:hH]([0-5][0-9])\b/i) ||
                          fullContext.match(/(?:às|as)\s*(\b[0-2]?[0-9])\s*h(?:oras)?\b/i);

        if (timeMatch) {
          const hh = timeMatch[1].padStart(2, '0');
          const mm = timeMatch[2] ? timeMatch[2] : '00';
          time = `${hh}:${mm}`;
        }

        // Extrair Data
        let date = '';
        const isoDateMatch = fullContext.match(/\b(202[4-9])-([0-1][0-9])-([0-3][0-9])\b/);
        if (isoDateMatch) {
          date = isoDateMatch[0];
        } else {
          const monthsMap: Record<string, string> = {
            'janeiro': '01', 'fevereiro': '02', 'março': '03', 'marco': '03',
            'abril': '04', 'maio': '05', 'junho': '06', 'julho': '07',
            'agosto': '08', 'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
          };

          const datePtMatch = fullContext.match(/\b([0-3]?[0-9])\s+de\s+(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+(202[4-9]))?\b/i);
          if (datePtMatch) {
            const day = datePtMatch[1].padStart(2, '0');
            const month = monthsMap[datePtMatch[2].toLowerCase()] || '01';
            const year = datePtMatch[3] || new Date().getFullYear().toString();
            date = `${year}-${month}-${day}`;
          }
        }

        // Extrair Assunto
        let subject = 'Consulta / Atendimento';
        const subjectMatch = text.match(/(?:Assunto|Serviço|Motivo):\s*\*?\*?([^\n\r*]+)/i) ||
                             currentMsg.match(/(?:visto|consulta|reunião|processo|serviço)[^\n\r]*/i);
        if (subjectMatch) {
          subject = subjectMatch[1] ? subjectMatch[1].trim() : subjectMatch[0].trim();
        }

        // Nome
        const name = cProfile?.name || 'Cliente';

        if (email && email.includes('@') && date && time) {
          console.log(`[AIService] ✅ Agendamento recuperado com sucesso via fallback:`, { name, email, subject, date, time });
          return { name, email, subject, date, time };
        } else {
          console.warn(`[AIService] ⚠️ Confirmação no texto detetada mas faltam dados para fallback:`, { hasEmail: !!email, hasDate: !!date, hasTime: !!time });
        }
      }

      return undefined;
    }

    // 2. Construir System Prompt
    const fullKnowledge = `${org?.product_description || ''}\n\n${externalKnowledge}\n\n${availableAssets}`.trim();

    const systemPrompt = buildSystemPrompt(
      mode,
      { ...org, product_description: fullKnowledge } as any,
      botName,
      referral,
      timeSinceLastMessageHours,
      urlSystemContext,
      customerProfile
    );

    const contents = buildContents(history, enrichedMessage, media, extractedImages);
    let lastError = '';

    // ─────────────────────────────────────────────────────────────────────────
    // MOTOR 1 — DeepSeek (MOTOR PRINCIPAL PARA TEXTO)
    // ─────────────────────────────────────────────────────────────────────────
    const dsKeys = getUniqueDeepseekApiKeys();
    if (dsKeys.length > 0) {
      console.log(`[AIService] 🚀 DeepSeek [PRINCIPAL] — ${dsKeys.length} chave(s) configurada(s).`);
      const dsModel   = process.env.DEEPSEEK_MODEL   || 'deepseek-chat';
      const dsBaseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
      const deepseekMessages = [
        { role: 'system', content: systemPrompt },
        ...history
          .filter(h => h.sender === 'user' || h.sender === 'bot')
          .map(h => ({
            role: h.sender === 'user' ? 'user' : 'assistant',
            content: h.text,
          })),
        { role: 'user', content: enrichedMessage },
      ];

      for (let attempt = 0; attempt < dsKeys.length; attempt++) {
        const baseIdx     = Math.floor(Date.now() / 60_000);
        const idx         = (baseIdx + attempt) % dsKeys.length;
        const deepseekKey = dsKeys[idx];
        const maskedKey   = deepseekKey.substring(0, 8) + '...' + deepseekKey.substring(deepseekKey.length - 4);
        try {
          console.log(`[AIService] 🔄 DeepSeek — chave ${idx} (${maskedKey})...`);
          const response = await axios.post(`${dsBaseUrl}/chat/completions`, {
            model: dsModel,
            messages: deepseekMessages,
            temperature: 0.4,
            max_tokens: 1500,
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${deepseekKey}`,
            },
            timeout: 20_000,
          });

          const rawText = response.data?.choices?.[0]?.message?.content?.trim();
          if (!rawText) {
            console.warn(`[AIService] ⚠️ DeepSeek retornou resposta vazia.`);
            continue;
          }

          const cleanedText  = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
          const confirm      = cleanedText.includes('[CONFIRMAR_INFORMAÇÃO]');
          const transfer     = cleanedText.includes('[TRANSFERIR_HUMANO]');
          const booking      = cleanedText.includes('[AGENDAR]') || cleanedText.includes('[BOOKING_CONFIRMED:');
          const proposal     = cleanedText.includes('[PROPOSTA]');
          const contactMatch = cleanedText.match(/\[CONTATO:(\{[^}]+\})\]/);
          const contactData  = contactMatch
            ? (() => { try { return JSON.parse(contactMatch[1]); } catch { return undefined; } })()
            : undefined;

          // Parser robusto: extrai JSON ou recupera dados via fallback inteligente
          const bookingData = parseBookingData(cleanedText, history, enrichedMessage, customerProfile);

          const cleanReply = cleanedText
            .replace(/\[TRANSFERIR_HUMANO\]|\[AGENDAR\]|\[PROPOSTA\]|\[CONFIRMAR_INFORMAÇÃO\]|\[CONTATO:\{[^}]+\}\]|\[BOOKING_CONFIRMED:\{[\s\S]*?\}\]/g, '')
            .trim();

          console.log(`[AIService] ✅ Resposta via DeepSeek [PRINCIPAL] (${cleanReply.length} chars). BookingData:`, bookingData ? 'Detectado' : 'Não');
          return { reply: cleanReply || cleanedText, transfer, booking: booking || !!bookingData, bookingData, proposal, contactData, confirm };

        } catch (dsErr: any) {
          const httpStatus = dsErr.response?.status ?? 'N/A';
          lastError = dsErr.response?.data?.error?.message || dsErr.message || String(dsErr);
          console.error(`[AIService] ❌ DeepSeek chave ${idx} HTTP ${httpStatus}: ${lastError}`);
          if (httpStatus === 401 || httpStatus === 402) {
            break; // Sem saldo ou chave inválida
          }
        }
      }
      console.warn(`[AIService] ⚠️ DeepSeek não concluiu a resposta. A tentar Gemini como fallback...`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MOTOR 2 — Gemini 2.5 Flash (FALLBACK ROBUSTO COM ROTAÇÃO DE CHAVES)
    // ─────────────────────────────────────────────────────────────────────────
    const geminiKeys = getUniqueApiKeys();
    if (geminiKeys.length > 0) {
      const now = Date.now();
      const sortedGeminiKeys = [...geminiKeys].sort((a, b) => {
        const cdA = geminiKeyCooldowns.get(a) || 0;
        const cdB = geminiKeyCooldowns.get(b) || 0;
        return (cdA > now ? 1 : 0) - (cdB > now ? 1 : 0);
      });

      console.log(`[AIService] 🔁 Gemini 2.5 Flash [FALLBACK] — ${sortedGeminiKeys.length} chave(s)...`);
      const baseConfig = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.4, maxOutputTokens: 1500 },
      };

      for (let keyIdx = 0; keyIdx < sortedGeminiKeys.length; keyIdx++) {
        const apiKey = sortedGeminiKeys[keyIdx];
        const url    = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
        const masked = apiKey.substring(0, 8) + '...' + apiKey.substring(apiKey.length - 4);

        try {
          console.log(`[AIService] 🔄 Gemini — chave ${keyIdx} (${masked})...`);
          const response = await axios.post(url, baseConfig, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 20_000,
          });
          const parts: any[] = response.data?.candidates?.[0]?.content?.parts ?? [];
          const cleanText = extractCleanText(parts);
          if (!cleanText) continue;

          const confirm      = cleanText.includes('[CONFIRMAR_INFORMAÇÃO]');
          const transfer     = cleanText.includes('[TRANSFERIR_HUMANO]');
          const booking      = cleanText.includes('[AGENDAR]') || cleanText.includes('[BOOKING_CONFIRMED:');
          const proposal     = cleanText.includes('[PROPOSTA]');
          const contactMatch = cleanText.match(/\[CONTATO:(\{[^}]+\})\]/);
          const contactData  = contactMatch
            ? (() => { try { return JSON.parse(contactMatch[1]); } catch { return undefined; } })()
            : undefined;

          // Parser robusto: extrai JSON ou recupera dados via fallback inteligente
          const bookingData = parseBookingData(cleanText, history, enrichedMessage, customerProfile);

          const cleanReply = cleanText
            .replace(/\[TRANSFERIR_HUMANO\]|\[AGENDAR\]|\[PROPOSTA\]|\[CONFIRMAR_INFORMAÇÃO\]|\[CONTATO:\{[^}]+\}\]|\[BOOKING_CONFIRMED:\{[\s\S]*?\}\]/g, '')
            .trim();

          console.log(`[AIService] ✅ Resposta via Gemini [FALLBACK] chave ${keyIdx}. BookingData:`, bookingData ? 'Detectado' : 'Não');
          return { reply: cleanReply || cleanText, transfer, booking: booking || !!bookingData, bookingData, proposal, contactData, confirm };

        } catch (err: any) {
          const status = err.response?.status ?? 'N/A';
          lastError = err.response?.data?.error?.message || err.message || String(err);
          if (status === 429) {
            geminiKeyCooldowns.set(apiKey, Date.now() + 25_000);
          } else if (status === 403) {
            geminiKeyCooldowns.set(apiKey, Date.now() + 3_600_000);
          }
          console.warn(`[AIService] ⚠️ Gemini chave ${keyIdx} (${masked}) HTTP ${status}: ${lastError}`);
          continue;
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Se ambos os motores falharem: LANÇAR ERRO para o webhook sinalizar o painel
    // e NUNCA enviar mensagens de desculpas automáticas ao cliente!
    // ─────────────────────────────────────────────────────────────────────────
    console.error(`[AIService] ❌ TODOS os motores de IA falharam (DeepSeek + Gemini). Último erro: ${lastError}`);
    throw new Error(`Falha temporária ao comunicar com os motores de IA: ${lastError}`);
  }

  /**
   * Traduz um texto silenciosamente para a língua alvo (usado para gravar histórico em PT)
   */
  static async translateText(text: string, targetLanguage: string): Promise<string> {
    try {
      const dsKeys = getUniqueDeepseekApiKeys();
      if (dsKeys.length > 0) {
        const deepseekKey = dsKeys[0];
        const dsModel   = process.env.DEEPSEEK_MODEL   || 'deepseek-chat';
        const dsBaseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
        const response = await axios.post(`${dsBaseUrl}/chat/completions`, {
          model: dsModel,
          messages: [{ role: 'user', content: `Traduza o seguinte texto para ${targetLanguage}. Retorne APENAS a tradução, sem comentários:\n\n${text}` }],
          temperature: 0.3,
          max_tokens: 500,
        }, {
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
          timeout: 10_000,
        });
        const result = response.data?.choices?.[0]?.message?.content?.trim();
        if (result) return result;
      }
    } catch (_) {}

    try {
      const apiKey = getApiKey(0);
      const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
      const response = await axios.post(url, {
        contents: [{ parts: [{ text: `Traduza o seguinte texto para ${targetLanguage}. Retorne APENAS a tradução:\n\n${text}` }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 500 },
      }, { timeout: 10_000 });
      const result = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (result) return result;
    } catch (_) {}

    return text;
  }
}
