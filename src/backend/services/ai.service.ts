import axios from 'axios';
import { supabaseAdmin } from '../config/supabase';
import { DocumentService } from './document.service';

// As variáveis de ambiente são carregadas em ../config/supabase.ts e server.ts

// ─────────────────────────────────────────────────────────
//  Tipos
// ─────────────────────────────────────────────────────────
export interface ChatMessage {
  sender: 'user' | 'bot' | 'human';
  text: string;
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
}

export interface GenerateResult {
  reply: string;
  transfer: boolean;
  booking?: boolean;
  proposal?: boolean;
  contactData?: { name?: string; email?: string; phone?: string };
}

// ─────────────────────────────────────────────────────────
//  Configuração Gemini 2.5 Flash
// ─────────────────────────────────────────────────────────
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_BASE  = 'https://generativelanguage.googleapis.com/v1beta/models';


/** Obter lista de todas as chaves Gemini válidas e únicas */
export function getUniqueApiKeys(): string[] {
  const rawKeys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
  ].filter(Boolean) as string[];

  const allKeys: string[] = [];
  rawKeys.forEach(k => {
    // Remover aspas de toda a string antes de fazer o split
    const cleanStr = k.trim().replace(/^["']|["']$/g, '');
    const parts = cleanStr.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
    allKeys.push(...parts);
  });

  return Array.from(new Set(allKeys.filter(k => k.length > 10)));
}

/** Rotação de chaves para distribuir quota */
export function getApiKey(attempt = 0): string {
  const uniqueKeys = getUniqueApiKeys();

  if (uniqueKeys.length === 0) {
    console.error('[AIService] ERRO: Nenhuma chave carregada.');
    throw new Error('[AIService] Nenhuma GEMINI_API_KEY válida no .env');
  }

  // Rotação básica + deslocamento por tentativa
  const baseIdx = Math.floor(Date.now() / 60_000);
  const idx = (baseIdx + attempt) % uniqueKeys.length;
  const key = uniqueKeys[idx];
  
  return key;
}

// ─────────────────────────────────────────────────────────
//  Construção do System Prompt
// ─────────────────────────────────────────────────────────
interface OrgProfile {
  name?: string;
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
  urlContext?: string
): string {
  // ── Modo Suporte Orion (widget do site) ────────────────
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

  // ── Modo Empresa (agente do cliente) ──────────────────
  const botName     = botNameOverride || org?.chatbot_name || 'Assistente';
  const companyName = org?.name || 'nossa empresa';
  const sector      = org?.social_object || '';
  const knowledge   = org?.product_description || '';
  const emojiMode   = org?.emoji_mode || 'moderate';
  const handover    = org?.handover_mode || 'hybrid';
  const tone        = org?.ai_tone || 'friendly';
  const customPrompt= org?.ai_prompt ? `\n═══ INSTRUÇÕES DE COMPORTAMENTO (PROMPT PERSONALIZADO) ═══\n${org.ai_prompt}\n` : '';

  const emojiRules: Record<string, string> = {
    none:     'NÃO use emojis em nenhuma circunstância. Seja puramente textual e formal.',
    moderate: 'Use emojis com muita parcimónia — máximo 1 por mensagem e apenas quando natural.',
    adaptive: 'Observe o perfil do cliente. Nas primeiras 5 mensagens NÃO use emojis. Após isso, espelhe o estilo do cliente: se ele usar emojis, use; se não usar, abstenha-se.',
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

  // Instrução universal: detectar pedido de atendimento humano em TODOS os modos de handover
  const transferRule = '- Se o cliente pedir explicitamente para falar com um humano, atendente ou pessoa real, inicie a sua resposta com o token [TRANSFERIR_HUMANO] e despeça-se gentilmente.';

  let bookingRule = '- Se o cliente solicitar agendamento, marcação de consulta ou pedir para agendar um serviço, inicie a sua resposta com o token [AGENDAR].';
  if (org?.calendar_provider === 'other' && org.calendar_link) {
    bookingRule += ` Além disso, informe amigavelmente o cliente que ele pode agendar diretamente através do seguinte link: ${org.calendar_link}`;
  } else if (org?.calendar_provider === 'google' || org?.calendar_provider === 'microsoft') {
    bookingRule += ` Além disso, informe que a marcação será integrada com o nosso calendário (${org.calendar_provider === 'google' ? 'Google Calendar' : 'Outlook Calendar'}) de forma automática.`;
  }

  const proposalRule = '- PROPOSTAS COMERCIAIS DO CLIENTE: Se o cliente enviar uma proposta comercial (oferta de parceria, prestação de serviços, fornecimento de produtos, colaboração, publicidade, patrocínio, ou qualquer outro tipo de proposta de negócio) — quer seja num sector semelhante ao da empresa OU num sector completamente diferente — responda de forma diplomática e profissional. Reconheça a proposta com simpatia, informe que irá encaminhar para a área competente para análise, e inclua o token [PROPOSTA] no INÍCIO da sua resposta. ATENÇÃO CRÍTICA: Não confunda a proposta do cliente com os produtos/serviços da NOSSA empresa. A proposta é uma OFERTA DO CLIENTE para nós, não um pedido de compra dos nossos serviços. Trate-a como tal.';

  // Instrução para captura automática de dados de contacto
  const contactRule = '- Se o cliente partilhar espontaneamente informações de contacto (nome completo, email, número de telefone, morada ou empresa), inclua no INÍCIO da sua resposta o token compacto [CONTATO:{"name":"<nome>","email":"<email>","phone":"<tel>"}] preenchendo APENAS os campos que o cliente efectivamente partilhou. Nunca invente dados. Exemplo: [CONTATO:{"name":"Ana Silva","phone":"+244912345678"}].';

  const referralContext = referral?.headline
    ? `- Este cliente chegou através do anúncio: "${referral.headline}". Adapte a primeira saudação a esse contexto de forma entusiasmada.`
    : '';

  // Contexto de URLs/anúncios extraído pelo sistema — NUNCA confundir com o que o cliente escreveu
  const urlContextSection = urlContext
    ? `\n═══ CONTEXTO DO ANÚNCIO / LINK (EXTRAÍDO PELO SISTEMA — NÃO ESCRITO PELO CLIENTE) ═══\n⚠️ O conteúdo abaixo foi extraído AUTOMATICAMENTE da página de destino do anúncio ou link que o cliente clicou. NÃO é uma mensagem do cliente. Use este contexto para compreender o produto/serviço pelo qual o cliente se interessou e direcione a conversa de forma pertinente.\n${urlContext}\n`
    : '';

  let returnGreetingRule = '';
  if (timeSinceLastMessageHours !== undefined && timeSinceLastMessageHours >= 1) {
    returnGreetingRule = `- O cliente esteve inativo por mais de 1 hora. Se a nova mensagem dele for uma saudação (ex: "Olá", "Bom dia"), dê uma saudação calorosa e breve, pergunte como pode ajudar e retome o assunto de forma cativante.`;
  }

  return `Você é ${botName}, assistente virtual oficial da empresa "${companyName}".
${sector ? `Sector de actividade: ${sector}.` : ''}

═══ SUA PERSONALIDADE E COMPORTAMENTO (DEFINIDOS PELO USUÁRIO NO PAINEL) ═══
${org?.ai_prompt ? org.ai_prompt : 'Você deve agir como um assistente extremamente simpático, cordial, prestativo, persuasivo e carismático.'}

═══ CONHECIMENTO ═══
${knowledge ? knowledge : 'Você deve agir como um assistente cordial e prestativo.'}

═══ FERRAMENTAS EXTERNAS (GROUNDING) ═══
- Você tem acesso à PESQUISA EXTERNA DO GOOGLE / DUCKDUCKGO em tempo real para pesquisar em instituições oficiais.
- Sempre que o cliente perguntar algo sobre leis, taxas atuais, vistos, regras de consulado, regulamentos do governo ou dados recentes que exijam dados actualizados precisos, UTILIZE e priorize as informações obtidas nas fontes oficiais pesquisadas.
${urlContextSection}
${selectedToneInstructions}

═══ REGRAS DE COMPORTAMENTO (DRÁSTICAS) ═══
- PROIBIDO VAZAR RACIOCÍNIO: NUNCA inclua o seu processo de pensamento interno (ex: textos em inglês como "The user wants...", "I need to...") na resposta. A resposta deve conter EXCLUSIVAMENTE a mensagem final em português que será lida pelo cliente.
- SEPARAÇÃO OBRIGATÓRIA — MENSAGEM DO CLIENTE vs. CONTEXTO DO SISTEMA: A secção "CONTEXTO DO ANÚNCIO / LINK" no sistema é informação de contexto extraída AUTOMATICAMENTE pelo servidor. NUNCA trate esse conteúdo como se fosse uma mensagem escrita pelo cliente. A mensagem real e exclusiva do cliente é APENAS o texto que aparece na conversa (no histórico de chat). Jamais confunda o conteúdo do sistema com o que o cliente escreveu.
- PRIMEIRA MENSAGEM (SAUDAÇÃO): Deve ser uma saudação super simpática, educada, entusiasmada e calorosa, perguntando como pode ajudar. NÃO faça interrogatórios de qualificação nem despeje o perfil da empresa na primeira resposta. Aja com muita simpatia e empatia!
- POSTURA: Seja sempre excepcionalmente educado, paciente, carismático e entusiasmado. Nunca seja rude, frio, seco ou robótico.
- EVITAR REPETIÇÕES: NUNCA repita a mesma pergunta se o cliente não a respondeu diretamente. Se o cliente disser apenas "Olá?" a meio da conversa, responda de forma natural e animada (ex: "Estou aqui! Como posso ajudar hoje?"), e nunca repetindo o texto anterior.
- PROIBIDO REPETIR SAUDAÇÕES: Se o histórico mostra que a conversa já começou, vá DIRETO à resposta sem dizer "Olá" novamente.
- EQUILÍBRIO & SIMPATIA: Seja objetivo e evite rodeios desnecessários, mas NUNCA à custa do carisma e da empatia. As respostas devem ter uma extensão natural, sendo sempre acolhedoras, carismáticas, fluidas e extremamente persuasivas.
- ENVIO DE ARQUIVOS/DOCUMENTOS: Sempre que o cliente solicitar, pedir ou demonstrar interesse claro em receber qualquer arquivo, catálogo, guia, documento ou PDF que esteja listado na secção "ARQUIVOS QUE VOCÊ PODE ENVIAR", você DEVE anexar o código correspondente [SEND_FILE: ID] exatamente no final da sua mensagem (exemplo: "Aqui tem o ficheiro solicitado: [SEND_FILE: 12345678-abcd-1234-abcd-1234567890ab]"). Nunca invente IDs de arquivos e nunca crie códigos para arquivos que não estão explicitamente na lista fornecida.
${returnGreetingRule}

═══ REGRAS DE IDENTIDADE ═══
- Seu NOME é "${botName}". Use-o apenas se perguntarem quem você é.
- NUNCA se identifique pelo nome da empresa "${companyName}". Você é o assistente.

REGRAS OBRIGATÓRIAS:
- Responda SEMPRE em português (angolano/europeu).
- ${emojiRules[emojiMode] || emojiRules.moderate}
- Seja prestável e resolva os problemas do cliente com eficiência.
- Se não souber a resposta, diga honestamente de forma simpática.
- Nunca revele que é uma IA.
${transferRule}
${bookingRule}
${proposalRule}
${contactRule}
${referralContext}`;
}

// ─────────────────────────────────────────────────────────
//  Construção do histórico de conversa para Gemini
// ─────────────────────────────────────────────────────────
function buildContents(
  history: ChatMessage[],
  message: string,
  media?: { base64: string; mimeType: string },
  extraImages?: { base64: string; mimeType: string }[]
): any[] {
  // 1. Construir a lista linear de mensagens (filtrando 'human' e deduzindo roles)
  const rawList: { role: 'user' | 'model'; text: string; media?: { base64: string; mimeType: string }; extraImages?: { base64: string; mimeType: string }[] }[] = [];

  for (const msg of history) {
    if (msg.sender === 'user') {
      rawList.push({ role: 'user', text: msg.text });
    } else if (msg.sender === 'bot') {
      rawList.push({ role: 'model', text: msg.text });
    }
  }

  // Verificar se o último item da rawList é exatamente igual à mensagem atual
  // para evitar duplicações de mensagens já salvas no banco
  const lastItem = rawList[rawList.length - 1];
  if (lastItem && lastItem.role === 'user' && lastItem.text === message) {
    if (media) {
      lastItem.media = media;
    }
    if (extraImages) {
      lastItem.extraImages = extraImages;
    }
  } else {
    rawList.push({ role: 'user', text: message, media, extraImages });
  }

  // 2. Agrupar mensagens consecutivas do mesmo role para cumprir a regra de alternância do Gemini
  const mergedList: { role: 'user' | 'model'; parts: any[] }[] = [];

  for (const item of rawList) {
    const lastMerged = mergedList[mergedList.length - 1];

    if (lastMerged && lastMerged.role === item.role) {
      // Se for o mesmo role, agrupar
      if (item.media && (
        item.media.mimeType.startsWith('image/') ||
        item.media.mimeType.startsWith('video/') ||
        item.media.mimeType.startsWith('audio/')
      )) {
        lastMerged.parts.push({
          inlineData: { mimeType: item.media.mimeType, data: item.media.base64 }
        });
      }

      if (item.extraImages && item.extraImages.length > 0) {
        item.extraImages.forEach(img => {
          lastMerged.parts.push({
            inlineData: { mimeType: img.mimeType, data: img.base64 }
          });
        });
      }
      
      // Adicionar o texto
      const lastPart = lastMerged.parts.find(p => p.text !== undefined);
      if (lastPart) {
        lastPart.text = `${lastPart.text}\n${item.text}`.trim();
      } else {
        lastMerged.parts.push({ text: item.text });
      }
    } else {
      // Novo role
      const parts: any[] = [];
      if (item.media && (
        item.media.mimeType.startsWith('image/') ||
        item.media.mimeType.startsWith('video/') ||
        item.media.mimeType.startsWith('audio/')
      )) {
        parts.push({
          inlineData: { mimeType: item.media.mimeType, data: item.media.base64 }
        });
      }
      if (item.extraImages && item.extraImages.length > 0) {
        item.extraImages.forEach(img => {
          parts.push({
            inlineData: { mimeType: img.mimeType, data: img.base64 }
          });
        });
      }
      parts.push({ text: item.text });
      mergedList.push({ role: item.role, parts });
    }
  }

  // 3. Garantir que a conversa sempre começa com o role 'user'
  while (mergedList.length > 0 && mergedList[0].role !== 'user') {
    mergedList.shift();
  }

  return mergedList;
}


// ─────────────────────────────────────────────────────────
//  Pesquisa Externa em Tempo Real (DuckDuckGo Lite Grounding)
// ─────────────────────────────────────────────────────────
async function performWebSearch(query: string): Promise<string> {
  try {
    console.log(`[Search] 🔍 A pesquisar em fontes oficiais: "${query}"...`);

    // 1. Obter URLs de resultados via DuckDuckGo (motor de busca)
    const searchResp = await axios.get(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query + ' site oficial')}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 8000
      }
    );

    const html = searchResp.data as string;

    // 2. Extrair URLs reais dos resultados (links de resultados com href externo)
    const urlPattern = /href="(https?:\/\/(?!duckduckgo)[^"&]+)"/gi;
    const foundUrls: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = urlPattern.exec(html)) !== null && foundUrls.length < 4) {
      const u = m[1];
      // Excluir rastreadores, anúncios e plataformas sociais menos oficiais
      if (!/facebook|instagram|twitter|youtube|tiktok|pinterest|reddit|amazon/i.test(u)) {
        foundUrls.push(u);
      }
    }

    if (foundUrls.length === 0) {
      console.warn('[Search] Nenhum URL encontrado nos resultados de pesquisa.');
      return '';
    }

    console.log(`[Search] 📄 ${foundUrls.length} fontes encontradas. A extrair conteúdo real...`);

    // 3. Ler o conteúdo real das páginas em paralelo (máx 3 fontes, 5s timeout)
    const pageResults = await Promise.all(
      foundUrls.slice(0, 3).map(async (url, idx) => {
        try {
          const pageResp = await axios.get(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 5000
          });
          let pageHtml = pageResp.data as string;
          // Limpar HTML → texto
          const text = pageHtml
            .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gim, '')
            .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gim, '')
            .replace(/<[^>]+>/gm, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 3000); // máx 3000 chars por fonte

          if (text.length > 50) {
            console.log(`[Search] ✅ Fonte ${idx + 1} lida: ${url.substring(0, 60)}...`);
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
      console.log(`[Search] ✅ Pesquisa concluída. ${validResults.length} fontes com conteúdo real.`);
      return `═══ INFORMAÇÕES REAIS EXTRAÍDAS DE FONTES OFICIAIS ═══\n${validResults.join('\n\n')}`;
    }

    return '';
  } catch (err: any) {
    console.warn('[Search] ⚠️ Falha na pesquisa externa:', err.message);
    return '';
  }
}

// ─────────────────────────────────────────────────────────
//  Serviço Principal
// ─────────────────────────────────────────────────────────
export class AIService {

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
    } = options;

    // 0. Extrair e ler o conteúdo de URLs presentes na mensagem (ex: links de anúncios do Facebook/Instagram)
    // O conteúdo é passado como CONTEXTO DO SISTEMA (não como mensagem do cliente) para evitar que a IA
    // confunda o conteúdo da página com o que o cliente escreveu.
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
    const detectedUrls = message.match(urlRegex) || [];
    let urlContextBlocks: string[] = [];
    let extractedImages: { base64: string; mimeType: string }[] = [];

    if (detectedUrls.length > 0) {
      console.log(`[AIService] 🔗 ${detectedUrls.length} URL(s) detectado(s) na mensagem. A extrair conteúdo de texto e imagens...`);
      const urlFetches = detectedUrls.slice(0, 3).map(async (url) => {
        const result = await DocumentService.extractPageContentAndImages(url);
        if (result && result.text) {
          if (result.images && result.images.length > 0) {
            extractedImages.push(...result.images);
          }
          return `[Página: ${url}]:\n${result.text}`;
        }
        return null;
      });
      const results = await Promise.all(urlFetches);
      urlContextBlocks = results.filter(Boolean) as string[];
    }

    // A mensagem do cliente mantém-se LIMPA — o contexto de URL vai para o sistema, NÃO para a mensagem
    const enrichedMessage = message;
    const urlSystemContext = urlContextBlocks.length > 0 ? urlContextBlocks.join('\n\n') : undefined;

    // 1. Carregar perfil da organização, Base de Conhecimento (RAG) e Assets
    let org: OrgProfile | null = null;
    let externalKnowledge = '';
    let availableAssets = '';

    if (orgId && mode !== 'support') {
      // Perfil básico
      const { data: orgData } = await supabaseAdmin
        .from('organizations')
        .select('name, social_object, product_description, chatbot_name, emoji_mode, handover_mode, ai_prompt, ai_tone, calendar_provider, calendar_link')
        .eq('id', orgId)
        .maybeSingle();
      org = orgData;

      // Documentos e Sites (Base de Conhecimento)
      const { data: docs } = await supabaseAdmin
        .from('knowledge_docs')
        .select('filename, content')
        .eq('org_id', orgId);

      if (docs && docs.length > 0) {
        externalKnowledge = docs
          .map(d => `--- DOCUMENTO: ${d.filename} ---\n${d.content}`)
          .join('\n\n');
      }

      // Instruções (Snippets)
      const { data: snippets } = await supabaseAdmin
        .from('bot_instructions')
        .select('content')
        .eq('org_id', orgId);

      const snippetsText = (snippets || []).map(s => s.content).join('\n');

      // Assets Públicos (Arquivos para enviar)
      const { data: assets } = await supabaseAdmin
        .from('public_assets')
        .select('id, filename, description')
        .eq('org_id', orgId);

      if (assets && assets.length > 0) {
        availableAssets = '\n═══ ARQUIVOS QUE VOCÊ PODE ENVIAR AO CLIENTE ═══\n' +
          assets.map(a => `- ID: ${a.id} | Descrição: ${a.description} | Arquivo: ${a.filename}`).join('\n') +
          '\nPara enviar um arquivo, responda exatamente com o código: [SEND_FILE: ID] no final da sua resposta.';
      }

      // Realizar pesquisa externa em tempo real em fontes oficiais se a mensagem do cliente exigir dados precisos/recentes
      let searchResults = '';
      const isSearchNeeded = /visto|consulado|taxa|preço|atual|hoje|requisito|oficial|governo|site|embaixada|documento|notícia/i.test(enrichedMessage);
      if (isSearchNeeded) {
        try {
          searchResults = await performWebSearch(enrichedMessage);
        } catch (err) {
          console.warn('[Search] Erro ao buscar informações em tempo real:', err);
        }
      }

      externalKnowledge = `${snippetsText}\n\n${externalKnowledge}\n\n${searchResults}`.trim();
    }

    // ── Função auxiliar: limpar texto e extrair apenas a resposta final ────────
    function extractCleanText(parts: any[]): string {
      // 1. Filtrar partes de "pensamento" da API (thought=true, code, etc.)
      const textParts = parts
        .filter((p: any) => !p.thought && !p.executableCode && !p.codeExecutionResult)
        .map((p: any) => (p.text ?? '').trim())
        .filter(Boolean);

      let raw = textParts.join('\n').trim();

      if (!raw) return '';

      // 2. Remover blocos <think>...</think> (raciocínio interno do modelo)
      raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');

      // 3. Remover padrões de raciocínio em inglês que vazam no output
      raw = raw.replace(/^(The user (is asking|wants|said|mentioned)|I need to|I should|Let me|I will|I'll|Okay,|Sure,|Certainly,).*$/gim, '');

            // 4. Remover blocos de código técnico (tool_code, python, etc.)
      raw = raw.replace(/```(?:python|tool_code|json|javascript|typescript)?[\s\S]*?```/gi, '');
      raw = raw.replace(/tool_code\s*[\s\S]*?(?=\n\n|$)/gi, '');
      raw = raw.replace(/print\(.*?\)/gi, '');

      // 5. Remover linhas de raciocínio típicas do Gemini 2.5 Thinking
      raw = raw.replace(/^(Thought:|Reasoning:|Step \d+:|Analysis:|Context:).*$/gim, '');

      // 6. Limpar linhas vazias excessivas
      raw = raw.replace(/\n{3,}/g, '\n\n').trim();

      return raw;
    }

    // 2. Construir sistema e conteúdos
    const fullKnowledge = `${org?.product_description || ''}\n\n${externalKnowledge}\n\n${availableAssets}`.trim();
    
    const systemPrompt = buildSystemPrompt(mode, { ...org, product_description: fullKnowledge } as any, botName, referral, timeSinceLastMessageHours, urlSystemContext);
    const contents     = buildContents(history, enrichedMessage, media, extractedImages);

    // 3. Payloads: com e sem Google Search
    const baseConfig = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.4, maxOutputTokens: 1500 },
    };

    const payloadWithSearch  = { ...baseConfig, tools: [{ google_search: {} }] };
    const payloadWithSearch2 = { ...baseConfig, tools: [{ googleSearch: {} }] }; // fallback de formato
    const payloadNoSearch    = { ...baseConfig };

    let lastError = '';

    // ─────────────────────────────────────────────────────────
    // 4. Tentar OpenAI gpt-4o-mini Primeiro (Se a chave estiver configurada)
    // ─────────────────────────────────────────────────────────
    try {
      const openaiKey = process.env.OPENAI_API_KEY?.replace(/^["']|["']$/g, '')?.trim();
      if (openaiKey && openaiKey.length > 10) {
        console.log(`[AIService] Tentando OpenAI gpt-4o-mini como motor principal...`);

        // Suporte multimodal para imagens no GPT-4o mini
        const lastUserContent: any[] = [{ type: 'text', text: enrichedMessage }];

        if (media && media.mimeType.startsWith('image/')) {
          console.log(`[AIService] Incluindo imagem (${media.mimeType}) no payload do GPT-4o mini...`);
          lastUserContent.push({
            type: 'image_url',
            image_url: {
              url: `data:${media.mimeType};base64,${media.base64}`,
            },
          });
        }

        if (extractedImages.length > 0) {
          console.log(`[AIService] Incluindo ${extractedImages.length} imagem(ns) extraída(s) de links no payload do GPT-4o mini...`);
          extractedImages.forEach((img) => {
            lastUserContent.push({
              type: 'image_url',
              image_url: {
                url: `data:${img.mimeType};base64,${img.base64}`,
              },
            });
          });
        }

        const openaiMessages = [
          { role: 'system', content: systemPrompt },
          ...history.map(h => ({
            role: h.sender === 'user' ? 'user' : 'assistant',
            content: h.text,
          })),
          { role: 'user', content: lastUserContent.length > 1 ? lastUserContent : enrichedMessage },
        ];

        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
          model: 'gpt-4o-mini',
          messages: openaiMessages,
          temperature: 0.4,
          max_tokens: 1500,
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`,
          },
          timeout: 25_000,
        });

        const rawText = response.data?.choices?.[0]?.message?.content?.trim();
        if (rawText) {
          const transfer      = rawText.includes('[TRANSFERIR_HUMANO]');
          const booking      = rawText.includes('[AGENDAR]');
          const proposal     = rawText.includes('[PROPOSTA]');
          const contactMatch = rawText.match(/\[CONTATO:(\{[^}]+\})\]/);
          const contactData  = contactMatch ? (() => { try { return JSON.parse(contactMatch[1]); } catch { return undefined; } })() : undefined;
          const cleanReply   = rawText.replace(/\[TRANSFERIR_HUMANO\]|\[AGENDAR\]|\[PROPOSTA\]|\[CONTATO:\{[^}]+\}\]/g, '').trim();
          console.log(`[AIService] ✅ Resposta gerada com sucesso via OpenAI gpt-4o-mini.`);
          if (contactData) console.log(`[AIService] 📋 Dados de contacto capturados:`, contactData);
          if (proposal) console.log(`[AIService] 📎 Proposta comercial detectada.`);
          return { reply: cleanReply || rawText, transfer, booking, proposal, contactData };
        }
      }
    } catch (openaiErr: any) {
      const errData = openaiErr.response?.data;
      lastError = errData?.error?.message || openaiErr.message;
      console.error(`[AIService] ❌ OpenAI falhou:`, lastError);
      if (errData) console.error(`[AIService] Detalhe API OpenAI:`, JSON.stringify(errData).substring(0, 400));
    }

    // ─────────────────────────────────────────────────────────
    // 5. Fallback automático para Gemini 2.5 Flash
    // ─────────────────────────────────────────────────────────
    try {
      console.log(`[AIService] Avançando para fallback Gemini 2.5 Flash...`);
      const apiKey = getApiKey(0);
      const url    = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

      const attempts = [
        { label: 'com google_search',  payload: payloadWithSearch  },
        { label: 'com googleSearch',   payload: payloadWithSearch2 },
        { label: 'sem tools',          payload: payloadNoSearch    },
      ];

      for (const { label, payload } of attempts) {
        try {
          console.log(`[AIService] Tentando chave Gemini ativa — formato ${label}...`);

          const response = await axios.post(url, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 35_000,
          });

          const parts: any[] = response.data?.candidates?.[0]?.content?.parts ?? [];
          const cleanText = extractCleanText(parts);

          if (!cleanText) {
            console.warn(`[AIService] Resposta vazia após limpeza no formato ${label}.`);
            continue;
          }

          const transfer      = cleanText.includes('[TRANSFERIR_HUMANO]');
          const booking      = cleanText.includes('[AGENDAR]');
          const proposal     = cleanText.includes('[PROPOSTA]');
          const contactMatch = cleanText.match(/\[CONTATO:(\{[^}]+\})\]/);
          const contactData  = contactMatch ? (() => { try { return JSON.parse(contactMatch[1]); } catch { return undefined; } })() : undefined;
          const cleanReply   = cleanText.replace(/\[TRANSFERIR_HUMANO\]|\[AGENDAR\]|\[PROPOSTA\]|\[CONTATO:\{[^}]+\}\]/g, '').trim();

          console.log(`[AIService] ✅ Resposta gerada com sucesso com formato ${label} via Gemini.`);
          if (contactData) console.log(`[AIService] 📋 Dados de contacto capturados:`, contactData);
          if (proposal) console.log(`[AIService] 📎 Proposta comercial detectada.`);
          return { reply: cleanReply || cleanText, transfer, booking, proposal, contactData };

        } catch (err: any) {
          const errData  = err.response?.data;
          lastError      = errData?.error?.message || err.message;
          const status   = err.response?.status ?? 'N/A';
          console.error(`[AIService] ❌ Gemini formato ${label} falhou (HTTP ${status}): ${lastError}`);
          if (errData) console.error(`[AIService] Detalhe API Gemini:`, JSON.stringify(errData).substring(0, 400));
          
          if (status === 429) {
            console.warn(`[AIService] ⚠️ Quota esgotada (429) na chave Gemini. Interrompendo tentativas Gemini.`);
            break;
          }
        }
      }
    } catch (geminiErr: any) {
      console.error(`[AIService] Falha crítica no fallback Gemini:`, geminiErr.message);
    }

    // 6. Último recurso: resposta genérica (apenas quando houver erro)
    if (lastError) {
      console.error(`[AIService] ⚠️ Todos os caminhos falharam. Gerando resposta genérica. Último erro: ${lastError}`);
      return {
        reply: 'Desculpe, não consegui processar sua mensagem neste momento. Por favor, tente novamente em breve.',
        transfer: false,
      };
    }
    // Caso inesperado sem erro registrado, devolver mensagem padrão neutra
    console.warn(`[AIService] Nenhum erro registrado, mas chegou ao fallback. Resposta padrão.`);
    return {
      reply: 'Desculpe, não consegui processar sua mensagem neste momento. Por favor, tente novamente em breve.',
      transfer: false,
    };
  }

  /**
   * Traduz um texto silenciosamente para a língua alvo (usado para gravar histórico em PT)
   */
  static async translateText(text: string, targetLanguage: string): Promise<string> {
    try {
      const openaiKey = process.env.OPENAI_API_KEY?.replace(/^["']|["']$/g, '')?.trim();
      if (openaiKey && openaiKey.length > 10) {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: `Traduza o seguinte texto para ${targetLanguage}. Retorne APENAS a tradução, sem comentários:\n\n${text}` }],
          temperature: 0.3,
        }, {
          headers: { 'Authorization': `Bearer ${openaiKey}` }
        });
        return response.data?.choices?.[0]?.message?.content?.trim() || text;
      }
      
      // Fallback Gemini
      const apiKey = getApiKey(0);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const response = await axios.post(url, {
        contents: [{ parts: [{ text: `Traduza o seguinte texto para ${targetLanguage}. Retorne APENAS a tradução:\n\n${text}` }] }],
      });
      return response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || text;
    } catch (err) {
      console.warn(`[AIService] Erro ao traduzir texto:`, err);
      return text; // fallback to original
    }
  }
}

