import axios from 'axios';
import { supabaseAdmin } from '../config/supabase';

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
}

// ─────────────────────────────────────────────────────────
//  Configuração Gemini 2.5 Flash
// ─────────────────────────────────────────────────────────
const GEMINI_MODEL = 'gemini-2.5-flash-preview-04-17';
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
    const parts = k.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
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
}

function buildSystemPrompt(
  mode: 'simulation' | 'support',
  org: OrgProfile | null,
  botNameOverride?: string,
  referral?: any,
  timeSinceLastMessageHours?: number
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
  const customPrompt= org?.ai_prompt ? `\n═══ INSTRUÇÕES DE COMPORTAMENTO (PROMPT PERSONALIZADO) ═══\n${org.ai_prompt}\n` : '';

  const emojiRules: Record<string, string> = {
    none:     'NÃO use emojis em nenhuma circunstância. Seja puramente textual e formal.',
    moderate: 'Use emojis com muita parcimónia — máximo 1 por mensagem e apenas quando natural.',
    adaptive: 'Observe o perfil do cliente. Nas primeiras 5 mensagens NÃO use emojis. Após isso, espelhe o estilo do cliente: se ele usar emojis, use; se não usar, abstenha-se.',
  };

  const transferRule = handover === 'transfer'
    ? '- Se o cliente pedir explicitamente para falar com um humano/atendente, inicie a sua resposta com o token [TRANSFERIR_HUMANO] e despedisse gentilmente.'
    : '';

  const referralContext = referral?.headline
    ? `- Este cliente chegou através do anúncio: "${referral.headline}". Adapte a primeira saudação a esse contexto.`
    : '';

  let returnGreetingRule = '';
  if (timeSinceLastMessageHours !== undefined && timeSinceLastMessageHours >= 1) {
    returnGreetingRule = `- O cliente esteve inativo por mais de 1 hora. Se a nova mensagem dele for uma saudação (ex: "Olá", "Bom dia"), dê uma saudação MUITO BREVE, pergunte como pode ajudar e retome o assunto anterior se necessário. NÃO despeje um longo texto sobre o seu perfil ou a empresa.`;
  }

  return `Você é ${botName}, assistente virtual oficial da empresa "${companyName}".
${sector ? `Sector de actividade: ${sector}.` : ''}

═══ CONHECIMENTO ═══
${knowledge ? knowledge : 'Você deve agir como um assistente cordial e prestativo.'}

═══ FERRAMENTAS EXTERNAS (GROUNDING) ═══
- Você tem acesso à PESQUISA GOOGLE em tempo real.
- Sempre que o cliente perguntar algo que exija dados actualizados (ex: taxas de visto actuais, requisitos de entrada de um país, moradas de consulados ou notícias recentes), UTILIZE a ferramenta de pesquisa para consultar sites oficiais e instituições relacionadas.
${customPrompt}
═══ REGRAS DE COMPORTAMENTO (DRÁSTICAS) ═══
- PROIBIDO VAZAR RACIOCÍNIO: NUNCA inclua o seu processo de pensamento interno (ex: textos em inglês como "The user wants...", "I need to...") na resposta. A resposta deve conter EXCLUSIVAMENTE a mensagem final em português que será lida pelo cliente.
- PRIMEIRA MENSAGEM (SAUDAÇÃO): Deve ser apenas uma saudação educada, entusiasmada e calorosa, perguntando como pode ajudar. NÃO faça interrogatórios de qualificação nem despeje o perfil da empresa na primeira resposta. Aja com muita simpatia!
- POSTURA: Seja sempre excepcionalmente educado, paciente e entusiasmado. Nunca seja rude, frio ou robótico.
- EVITAR REPETIÇÕES: NUNCA repita a mesma pergunta (ex: perguntas de qualificação) se o cliente não a respondeu diretamente. Se o cliente disser apenas "Olá?" a meio da conversa, responda de forma natural (ex: "Estou aqui! Como posso ajudar?"), e nunca repetindo a mensagem anterior.
- PROIBIDO REPETIR SAUDAÇÕES: Se o histórico mostra que a conversa já começou, vá DIRETO à resposta sem dizer "Olá" novamente.
- BREVIDADE: Seja direto ao ponto. Use o mínimo de palavras possível nas respostas subsequentes, mas sem perder a simpatia.
${returnGreetingRule}

═══ REGRAS DE IDENTIDADE ═══
- Seu NOME é "${botName}". Use-o apenas se perguntarem quem você é.
- NUNCA se identifique pelo nome da empresa "${companyName}". Você é o assistente.

REGRAS OBRIGATÓRIAS:
- Responda SEMPRE em português (angolano/europeu).
- ${emojiRules[emojiMode] || emojiRules.moderate}
- Seja prestável e resolva os problemas do cliente com eficiência.
- Se não souber a resposta, diga honestamente.
- Nunca revele que é uma IA.
${transferRule}
${referralContext}`;
}

// ─────────────────────────────────────────────────────────
//  Construção do histórico de conversa para Gemini
// ─────────────────────────────────────────────────────────
function buildContents(
  history: ChatMessage[],
  message: string,
  media?: { base64: string; mimeType: string }
): any[] {
  // 1. Construir a lista linear de mensagens (filtrando 'human' e deduzindo roles)
  const rawList: { role: 'user' | 'model'; text: string; media?: { base64: string; mimeType: string } }[] = [];

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
  } else {
    rawList.push({ role: 'user', text: message, media });
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

    // 1. Carregar perfil da organização, Base de Conhecimento (RAG) e Assets
    let org: OrgProfile | null = null;
    let externalKnowledge = '';
    let availableAssets = '';

    if (orgId && mode !== 'support') {
      // Perfil básico
      const { data: orgData } = await supabaseAdmin
        .from('organizations')
        .select('name, social_object, product_description, chatbot_name, emoji_mode, handover_mode, ai_prompt')
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

      externalKnowledge = `${snippetsText}\n\n${externalKnowledge}`;
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
    
    const systemPrompt = buildSystemPrompt(mode, { ...org, product_description: fullKnowledge } as any, botName, referral, timeSinceLastMessageHours);
    const contents     = buildContents(history, message, media);

    // 3. Payloads: com e sem Google Search
    // gemini-2.5-flash-preview usa "google_search" (underscore) como tool key
    const baseConfig = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.4, maxOutputTokens: 1500 },
    };

    const payloadWithSearch  = { ...baseConfig, tools: [{ google_search: {} }] };
    const payloadWithSearch2 = { ...baseConfig, tools: [{ googleSearch: {} }] }; // fallback de formato
    const payloadNoSearch    = { ...baseConfig };


    // 4. Obter todas as chaves Gemini configuradas no .env e ordená-las de forma rotativa
    const uniqueKeys = getUniqueApiKeys();
    if (uniqueKeys.length === 0) {
      console.error('[AIService] ERRO: Nenhuma chave Gemini configurada no .env.');
    }

    // Rotacionar o ponto de partida das chaves com base no minuto atual
    const baseIdx = Math.floor(Date.now() / 60_000);
    const rotatedKeys: string[] = [];
    for (let i = 0; i < uniqueKeys.length; i++) {
      const idx = (baseIdx + i) % uniqueKeys.length;
      rotatedKeys.push(uniqueKeys[idx]);
    }

    let lastError = '';

    // Tentar todas as chaves Gemini configuradas antes de avançar para o fallback OpenAI
    for (let attempt = 0; attempt < rotatedKeys.length; attempt++) {
      const apiKey = rotatedKeys[attempt];
      const url    = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

      // ── Tentativas ordenadas por prioridade ──────────────────────────────────
      const attempts = [
        { label: 'com google_search',  payload: payloadWithSearch  },
        { label: 'com googleSearch',   payload: payloadWithSearch2 },
        { label: 'sem tools',          payload: payloadNoSearch    },
      ];

      for (const { label, payload } of attempts) {
        try {
          console.log(`[AIService] Tentando chave Gemini ${attempt + 1}/${rotatedKeys.length} — formato ${label}...`);

          const response = await axios.post(url, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 35_000,
          });

          const parts: any[] = response.data?.candidates?.[0]?.content?.parts ?? [];
          const cleanText = extractCleanText(parts);

          if (!cleanText) {
            console.warn(`[AIService] Chave ${attempt + 1}/${rotatedKeys.length} ${label}: resposta vazia após limpeza.`);
            continue; // tenta próxima variante
          }

          const transfer   = cleanText.includes('[TRANSFERIR_HUMANO]');
          const cleanReply = cleanText.replace('[TRANSFERIR_HUMANO]', '').trim();

          console.log(`[AIService] ✅ Resposta gerada com sucesso — chave Gemini ${attempt + 1}/${rotatedKeys.length}, formato ${label}.`);
          return { reply: cleanReply || cleanText, transfer };

        } catch (err: any) {
          const errData  = err.response?.data;
          lastError      = errData?.error?.message || err.message;
          const status   = err.response?.status ?? 'N/A';
          console.error(`[AIService] ❌ Chave Gemini ${attempt + 1}/${rotatedKeys.length} ${label} falhou (HTTP ${status}): ${lastError}`);
          if (errData) console.error(`[AIService] Detalhe API:`, JSON.stringify(errData).substring(0, 400));
          // continua para a próxima variante
        }
      }

      console.warn(`[AIService] Chave Gemini ${attempt + 1}/${rotatedKeys.length} esgotada. Tentando próxima...`);
    }

    // 5. Fallback OpenAI (gpt-4o-mini)
    try {
      const openaiKey = process.env.OPENAI_API_KEY?.replace(/^["']|["']$/g, '')?.trim();
      if (openaiKey && openaiKey.length > 10) {
        console.log(`[AIService] Todas as chaves Gemini falharam. Tentando OpenAI gpt-4o-mini...`);

        const openaiMessages = [
          { role: 'system', content: systemPrompt },
          ...history.map(h => ({
            role: h.sender === 'user' ? 'user' : 'assistant',
            content: h.text,
          })),
          { role: 'user', content: message },
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
          const transfer   = rawText.includes('[TRANSFERIR_HUMANO]');
          const cleanReply = rawText.replace('[TRANSFERIR_HUMANO]', '').trim();
          console.log(`[AIService] ✅ Resposta gerada via fallback OpenAI.`);
          return { reply: cleanReply || rawText, transfer };
        }
      }
    } catch (openaiErr: any) {
      console.error(`[AIService] Fallback OpenAI falhou:`, openaiErr.response?.data || openaiErr.message);
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
}

