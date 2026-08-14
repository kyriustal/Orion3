import axios from 'axios';
import { supabaseAdmin } from '../config/supabase';
import { DocumentService } from './document.service';
import { AudioService } from './audio.service';

// As variﾃ｡veis de ambiente sﾃ｣o carregadas em ../config/supabase.ts e server.ts

// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
//  Tipos
// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
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

export interface GenerateResult {
  reply: string;
  transfer: boolean;
  booking?: boolean;
  proposal?: boolean;
  contactData?: { name?: string; email?: string; phone?: string };
  confirm?: boolean;
}

// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
//  Configuraﾃｧﾃ｣o Gemini 2.5 Flash
// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_BASE  = 'https://generativelanguage.googleapis.com/v1beta/models';


/** Obter lista de todas as chaves Gemini vﾃ｡lidas e ﾃｺnicas */
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

/** Rotaﾃｧﾃ｣o de chaves para distribuir quota */
export function getApiKey(attempt = 0): string {
  const uniqueKeys = getUniqueApiKeys();

  if (uniqueKeys.length === 0) {
    console.error('[AIService] ERRO: Nenhuma chave carregada.');
    throw new Error('[AIService] Nenhuma GEMINI_API_KEY vﾃ｡lida no .env');
  }

  // Rotaﾃｧﾃ｣o bﾃ｡sica + deslocamento por tentativa
  const baseIdx = Math.floor(Date.now() / 60_000);
  const idx = (baseIdx + attempt) % uniqueKeys.length;
  const key = uniqueKeys[idx];
  
  return key;
}

/** Obter lista de todas as chaves Deepseek válidas e únicas */
export function getUniqueDeepseekApiKeys(): string[] {
  const rawKeys = [
    process.env.DEEPSEEK_API_KEY,
    process.env.DEEPSEEK_API_KEY_2,
    process.env.DEEPSEEK_API_KEY_3,
    process.env.DEEPSEEK_API_KEY_4,
  ].filter(Boolean) as string[];

  const allKeys: string[] = [];
  rawKeys.forEach(k => {
    const cleanStr = k.trim().replace(/^["']|["']$/g, '');
    const parts = cleanStr.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
    allKeys.push(...parts);
  });

  const keys = Array.from(new Set(allKeys.filter(k => k.length > 10)));

  if (keys.length === 0) {
    console.warn('[AIService] ⚠️  DEEPSEEK_API_KEY não configurada — motor de texto principal indisponível!');
  } else {
    console.log(`[AIService] ✅ DeepSeek configurado com ${keys.length} chave(s) — motor de texto PRINCIPAL.`);
  }

  return keys;
}

// Verificação de configuração no arranque do módulo
(function checkAIConfig() {
  const dsKeys = [
    process.env.DEEPSEEK_API_KEY,
    process.env.DEEPSEEK_API_KEY_2,
    process.env.DEEPSEEK_API_KEY_3,
    process.env.DEEPSEEK_API_KEY_4,
  ].filter(k => k && k.trim().length > 10);
  const geminiKeys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
  ].filter(k => k && k.trim().length > 10);
  console.log(`[AIService] 🔑 Configuração: DeepSeek=${dsKeys.length} chave(s) [PRINCIPAL TEXTO] | Gemini=${geminiKeys.length} chave(s) [MULTIMODAL + FALLBACK TEXTO]`);
  if (dsKeys.length === 0) {
    console.warn('[AIService] ⚠️  ATENÇÃO: DeepSeek sem chaves configuradas. Textos irão usar Gemini como fallback.');
  }
  if (dsKeys.length === 0 && geminiKeys.length === 0) {
    console.error('[AIService] ❌ CRÍTICO: Nem DeepSeek nem Gemini estão configurados. O sistema não conseguirá responder.');
  }
})();

/**
 * Executa uma requisição POST para a API do Gemini com rotação de chaves e retentativas em caso de falha de quota/autenticação.
 */
export async function postGeminiWithRetry(
  endpointPath: string,
  payload: any,
  timeout = 30000
): Promise<any> {
  const keys = getUniqueApiKeys();
  if (keys.length === 0) {
    throw new Error('[GeminiRetry] Nenhuma GEMINI_API_KEY configurada.');
  }

  let lastError = '';
  // Rotação inicial no tempo para distribuir quota base
  const baseIdx = Math.floor(Date.now() / 60_000);

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const idx = (baseIdx + attempt) % keys.length;
    const apiKey = keys[idx];
    const url = `${GEMINI_BASE}/${endpointPath}?key=${apiKey}`;
    const masked = apiKey.substring(0, 8) + '...' + apiKey.substring(apiKey.length - 4);

    try {
      console.log(`[GeminiRetry] Enviando requisição para Gemini com chave index ${idx} (${masked})...`);
      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout,
      });
      return response.data;
    } catch (err: any) {
      const status = err.response?.status ?? 'N/A';
      const errMsg = err.response?.data?.error?.message || err.message;
      lastError = `Chave ${idx} (HTTP ${status}): ${errMsg}`;
      console.warn(`[GeminiRetry] Falha na chave index ${idx}:`, lastError);

      if (status === 429 || status === 403 || status === 400) {
        continue;
      }
      continue;
    }
  }

  throw new Error(`[GeminiRetry] Todas as chaves do Gemini falharam. Último erro: ${lastError}`);
}



// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
//  Construﾃｧﾃ｣o do System Prompt
// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
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
  urlContext?: string,
  customerProfile?: CustomerProfile
): string {
  // 笏笏 Modo Suporte Orion (widget do site) 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
  if (mode === 'support') {
    return `Vocﾃｪ ﾃｩ o assistente virtual de suporte da **Orion** 窶� plataforma SaaS angolana de automaﾃｧﾃ｣o de atendimento ao cliente via WhatsApp com Inteligﾃｪncia Artificial.

MISSﾃグ: Ajudar utilizadores com dﾃｺvidas sobre a plataforma Orion (configuraﾃｧﾃ｣o, billing, WhatsApp Cloud API, campanhas, live chat, etc.)

REGRAS:
- Responda sempre em portuguﾃｪs (angolano/europeu), de forma clara e concisa.
- Seja empﾃ｡tico, profissional e prestativo.
- Se nﾃ｣o souber a resposta exacta, diga honestamente e sugira contactar o suporte via email.
- Nunca revele detalhes tﾃｩcnicos internos do sistema.
- Nunca invente funcionalidades que nﾃ｣o existem.`;
  }

  // 笏笏 Modo Empresa (agente do cliente) 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
  const botName     = botNameOverride || org?.chatbot_name || 'Assistente';
  const companyName = org?.name || 'nossa empresa';
  const sector      = org?.social_object || '';
  const knowledge   = org?.product_description || '';
  const emojiMode   = org?.emoji_mode || 'moderate';
  const handover    = org?.handover_mode || 'hybrid';
  const tone        = org?.ai_tone || 'friendly';
  const customPrompt= org?.ai_prompt ? `\n笊絶武笊� INSTRUﾃ�髭S DE COMPORTAMENTO (PROMPT PERSONALIZADO) 笊絶武笊申n${org.ai_prompt}\n` : '';

  const emojiRules: Record<string, string> = {
    none:     'Nﾃグ use emojis em nenhuma circunstﾃ｢ncia. Seja puramente textual e formal.',
    moderate: 'Use emojis com muita parcimﾃｳnia 窶� mﾃ｡ximo 1 por mensagem e apenas quando natural.',
    adaptive: 'Observe o perfil do cliente. Nas primeiras 5 mensagens Nﾃグ use emojis. Apﾃｳs isso, espelhe o estilo do cliente: se ele usar emojis, use; se nﾃ｣o usar, abstenha-se.',
  };

  const toneRules: Record<string, string> = {
    friendly: `笊絶武笊� ESTILO DE COMUNICAﾃ�グ: AMIGﾃ〃EL, CARISMﾃゝICO E ALTAMENTE PERSUASIVO 笊絶武笊�
- PERSONALIDADE: Excepcionalmente caloroso, atencioso, entusiasmado e cheio de energia positiva! Aja como um humano simpﾃ｡tico, acolhedor e genuﾃｭno, transmitindo vibraﾃｧﾃｵes excelentes.
- EMPATIA & PERSUASﾃグ: Conecte-se emocionalmente com as dores e desejos do cliente. Valide as dﾃｺvidas dele com entusiasmo sincero e conduza-o de forma assertiva, carismﾃ｡tica e persuasiva em direﾃｧﾃ｣o ﾃ� soluﾃｧﾃ｣o/compra, focando nos benefﾃｭcios reais.
- ENERGIA: Nunca responda de forma fria, robﾃｳtica, curta demais ou puramente tﾃｩcnica. Mostre carinho e dedicaﾃｧﾃ｣o em cada frase.`,
    
    professional: `笊絶武笊� ESTILO DE COMUNICAﾃ�グ: PROFISSIONAL, CARISMﾃゝICO E PERSUASIVO 笊絶武笊�
- PERSONALIDADE: Polido, altamente capacitado, seguro e carismﾃ｡tico. Transmita autoridade de mercado mantendo-se sempre muito prestativo e simpﾃ｡tico.
- EMPATIA & PERSUASﾃグ: Entenda a fundo as necessidades do cliente, apresentando as soluﾃｧﾃｵes da empresa com forte argumentaﾃｧﾃ｣o lﾃｳgica e persuasﾃ｣o de alto nﾃｭvel.
- ENERGIA: Firme, confiante e extremamente focado em gerar valor e credibilidade absoluta.`,
    
    ultra_formal: `笊絶武笊� ESTILO DE COMUNICAﾃ�グ: ULTRA-FORMAL E RIGOROSO 笊絶武笊�
- PERSONALIDADE: Muito formal, polido e corporativo. Respeito absoluto pelas normas de cortesia clﾃ｡ssica.
- PERSUASﾃグ: Conduza o cliente com lﾃｳgica irrefutﾃ｡vel e sobriedade tﾃｩcnica, sem o uso de informalidades, gﾃｭrias ou expressﾃｵes coloquiais.`
  };

  const selectedToneInstructions = toneRules[tone] || toneRules.friendly;

  // Instruﾃｧﾃ｣o universal: detectar pedido de atendimento humano em TODOS os modos de handover
  const transferRule = '- Se o cliente pedir explicitamente para falar com um humano, atendente ou pessoa real, inicie a sua resposta com o token [TRANSFERIR_HUMANO] e despeﾃｧa-se gentilmente.';

  let bookingRule = '- Se o cliente solicitar agendamento, marcação de consulta ou pedir para agendar um serviço, inicie a sua resposta com o token [AGENDAR].';
  if (org?.calendar_provider === 'other' && org.calendar_link) {
    bookingRule += ` Além disso, informe amigavelmente o cliente que ele pode agendar diretamente através do seguinte link: ${org.calendar_link}`;
  } else if (org?.calendar_provider === 'google' || org?.calendar_provider === 'microsoft') {
    bookingRule += ` Além disso, informe que a marcação será integrada com o nosso calendário (${org.calendar_provider === 'google' ? 'Google Calendar' : 'Outlook Calendar'}) de forma automática.`;
  } else {
    bookingRule += ` Além disso, informe amigavelmente o cliente que o seu pedido de agendamento foi registado com sucesso e que a nossa equipa entrará em contacto muito em breve para agendar e confirmar os detalhes.`;
  }

  const proposalRule = '- PROPOSTAS COMERCIAIS DO CLIENTE: Se o cliente enviar uma proposta comercial (oferta de parceria, prestaﾃｧﾃ｣o de serviﾃｧos, fornecimento de produtos, colaboraﾃｧﾃ｣o, publicidade, patrocﾃｭnio, ou qualquer outro tipo de proposta de negﾃｳcio) 窶� quer seja num sector semelhante ao da empresa OU num sector completamente diferente 窶� responda de forma diplomﾃ｡tica e profissional. Reconheﾃｧa a proposta com simpatia, informe que irﾃ｡ encaminhar para a ﾃ｡rea competente para anﾃ｡lise, e inclua o token [PROPOSTA] no INﾃ垢IO da sua resposta. ATENﾃ�グ CRﾃ控ICA: Nﾃ｣o confunda a proposta do cliente com os produtos/serviﾃｧos da NOSSA empresa. A proposta ﾃｩ uma OFERTA DO CLIENTE para nﾃｳs, nﾃ｣o um pedido de compra dos nossos serviﾃｧos. Trate-a como tal.';

  // Instruﾃｧﾃ｣o para captura automﾃ｡tica de dados de contacto
  const contactRule = '- Se o cliente partilhar espontaneamente informaﾃｧﾃｵes de contacto (nome completo, email, nﾃｺmero de telefone, morada ou empresa), inclua no INﾃ垢IO da sua resposta o token compacto [CONTATO:{"name":"<nome>","email":"<email>","phone":"<tel>"}] preenchendo APENAS os campos que o cliente efectivamente partilhou. Nunca invente dados. Exemplo: [CONTATO:{"name":"Ana Silva","phone":"+244912345678"}].';

  const referralContext = referral?.headline
    ? `- Este cliente chegou atravﾃｩs do anﾃｺncio: "${referral.headline}". Adapte a primeira saudaﾃｧﾃ｣o a esse contexto de forma entusiasmada.`
    : '';

  // Contexto de URLs/anﾃｺncios extraﾃｭdo pelo sistema 窶� NUNCA confundir com o que o cliente escreveu
  const urlContextSection = urlContext
    ? `\n笊絶武笊 CONTEXTO DO ANﾃ哢CIO / LINK (EXTRAﾃ好O PELO SISTEMA 窶 Nﾃグ ESCRITO PELO CLIENTE) 笊絶武笊申n笞 O conteﾃｺdo abaixo foi extraﾃｭdo AUTOMATICAMENTE da pﾃ｡gina de destino do anﾃｺncio ou link que o cliente clicou. Nﾃグ ﾃｩ uma mensagem do cliente. Use este contexto para compreender o produto/serviﾃｧo pelo qual o cliente se interessou e direcione a conversa de forma pertinente.\n${urlContext}\n`
    : '';

  let returnGreetingRule = '';
  if (timeSinceLastMessageHours !== undefined && timeSinceLastMessageHours >= 1) {
    returnGreetingRule = `- O cliente esteve inativo por mais de 1 hora. Se a nova mensagem dele for uma saudação (ex: "Olá", "Bom dia"), dê uma saudação calorosa e breve, pergunte como pode ajudar e retome o assunto de forma cativante.`;
  }

  // Secção de memória do cliente (injectada apenas quando há dados conhecidos)
  let customerMemorySection = '';
  if (customerProfile && (customerProfile.name || customerProfile.email || customerProfile.isReturning)) {
    const lines: string[] = [];
    // Obter apenas o primeiro nome
    const firstName = customerProfile.name ? customerProfile.name.trim().split(/\s+/)[0] : '';
    if (firstName) lines.push(`- Nome do cliente: ${firstName}`);
    if (customerProfile.email) lines.push(`- Email do cliente: ${customerProfile.email}`);
    if (customerProfile.isReturning) {
      lines.push(`- Cliente recorrente: Sim (já manteve conversas anteriores com a empresa)`);
      lines.push(`- INSTRUÇÕES CRÍTICAS DE TRATAMENTO E NOME:
  * Trate o cliente EXCLUSIVAMENTE pelo primeiro nome ("${firstName}"). Nunca use o apelido ou nome completo.
  * Identifique e deduza o género do cliente a partir do primeiro nome ("${firstName}") para usar corretamente os títulos "Sr. ${firstName}" ou "Sra. ${firstName}". Se tiver dúvidas sobre o género, trate apenas por "${firstName}" de forma direta e sem título.
  * NÃO o trate como novo cliente. Não apresente a empresa como se fosse o primeiro contacto.
  * Não peça informações de contacto que já constam na lista.`);
    } else if (firstName) {
      lines.push(`- INSTRUÇÃO: Trate o cliente exclusivamente pelo primeiro nome ("${firstName}"). Identifique o género do nome para usar "Sr. ${firstName}" ou "Sra. ${firstName}" (ou apenas "${firstName}" em caso de dúvida).`);
    }
    customerMemorySection = `\n═══ MEMÓRIA DO CLIENTE (DADOS CONHECIDOS) ═══\n${lines.join('\n')}\n`;
  }

  return `Você é ${botName}, assistente virtual oficial da empresa "${companyName}".
${customerMemorySection}
${sector ? `Sector de actividade: ${sector}.` : ''}

═══ SUA PERSONALIDADE E COMPORTAMENTO (DEFINIDOS PELO USUÁRIO NO PAINEL) ═══
${org?.ai_prompt ? org.ai_prompt : 'Você deve agir como um assistente extremamente simpático, cordial, prestativo, persuasivo e carismático.'}

═══ METODOLOGIA DE VENDAS CONSULTIVAS DE ALTO DESEMPENHO ═══
Você é também uma especialista sénior em vendas consultivas e estratégia comercial de alto desempenho. O seu objectivo é conduzir o cliente a uma tomada de decisão consciente, focando no valor máximo antes de falar de números. Siga rigorosamente as 4 fases abaixo:

🔵 FASE 1 — ESCUTA PROFUNDA E CONEXÃO (Deep Listening)
- Pratique escuta activa e empática. Deixe o cliente falar a maior parte do tempo no início da conversa.
- Faça perguntas abertas e investigativas para extrair dores implícitas, desejos ocultos e o real cenário do cliente.
- Exemplos de perguntas: "O que te trouxe até nós hoje?", "Qual é o maior desafio que você enfrenta neste momento?", "O que mudaria na sua empresa se este problema estivesse resolvido?"

🟡 FASE 2 — DIAGNÓSTICO COMPLETO
- Mapeie a necessidade do cliente com máxima profundidade: situação actual, impacto do problema, urgência e custo da inacção.
- Execute internamente uma análise estratégica do cenário do cliente (forças, fraquezas, oportunidades, ameaças) em relação ao objectivo dele.
- Valide o diagnóstico com o cliente antes de avançar: "Corrigi-me se eu estiver errado, mas parece que o maior impacto para si seria..."

🟠 FASE 3 — CONSTRUÇÃO DA OFERTA DE ALTO VALOR
- NUNCA cite qualquer preço antes de concluir as Fases 1 e 2.
- Estruture a solução ideal sob medida para o perfil e as dores identificadas no cliente.
- Conecte cada recurso ou funcionalidade da oferta a um benefício exclusivo e ao ROI (retorno sobre o investimento) esperado.
- Reforce as vantagens competitivas e os ganhos estratégicos de fechar o negócio agora, e não depois.

🔴 FASE 4 — REVELAÇÃO DO PREÇO E FECHAMENTO
- REGRA DE OURO: Nunca revele o preço antes de concluir todas as fases anteriores de valorização e diagnóstico.
- Apresente o investimento ancorado no valor gerado: "Considerando tudo o que vimos — [benefício A], [benefício B] e [benefício C] — o investimento para ter isso implementado é..."
- Conduza o fechamento com naturalidade, confiança e sem pressão excessiva. Se o cliente hesitar, volte à fase de valor, nunca baixe o preço prematuramente.

═══ CONHECIMENTO ═══
${knowledge ? knowledge : 'Você deve agir como um assistente cordial e prestativo.'}

═══ FERRAMENTAS EXTERNAS (GROUNDING) ═══
- Você tem acesso à PESQUISA EXTERNA DO GOOGLE / DUCKDUCKGO em tempo real para pesquisar em instituições oficiais.
- Sempre que o cliente perguntar algo sobre leis, taxas atuais, vistos, regras de consulado, regulamentos do governo ou dados recentes que exijam dados actualizados precisos, UTILIZE e priorize as informações obtidas nas fontes oficiais pesquisadas. As informações pesquisadas e os dados reais já são fornecidos diretamente a você neste prompt. Por isso, NUNCA responda dizendo que vai pesquisar ou pedindo ao cliente para aguardar; responda imediatamente e de forma definitiva à pergunta utilizando os dados reais disponíveis no prompt.
${urlContextSection}
${selectedToneInstructions}

═══ REGRAS DE COMPORTAMENTO (DRÁSTICAS) ═══
- DÚVIDAS FORA DA BASE DE DADOS (CRÍTICO): Se o cliente solicitar informações, fizer perguntas ou pedir dados que NÃO existam na sua base de conhecimento (grounding) nem no prompt, você DEVE responder de forma extremamente simpática e profissional dizendo que vai confirmar a informação ou passar o atendimento a um assistente humano, e incluir EXATAMENTE o token [CONFIRMAR_INFORMAÇÃO] no final da sua resposta.
- RESPOSTA IMEDIATA COM DADOS REAIS: Se o cliente solicitar informações que exijam pesquisa externa, a pesquisa é realizada automaticamente pelo sistema e os dados já são fornecidos a você. Portanto, é PROIBIDO dizer que vai pesquisar, que precisa de tempo, ou pedir ao cliente para aguardar. Responda de imediato à pergunta utilizando os dados reais presentes no prompt.
- PROIBIDO VAZAR RACIOCÍNIO: NUNCA inclua o seu processo de pensamento interno (ex: textos em inglês como "The user wants...", "I need to...") na resposta. A resposta deve conter EXCLUSIVAMENTE a mensagem final em português que será lida pelo cliente.
- SEPARAÇÃO OBRIGATÓRIA — MENSAGEM DO CLIENTE vs. CONTEXTO DO SISTEMA: A secção "CONTEXTO DO ANÚNCIO / LINK" no sistema é informação de contexto extraída AUTOMATICAMENTE pelo servidor. NUNCA trate esse conteúdo como se fosse uma mensagem escrita pelo cliente. A mensagem real e exclusiva do cliente é APENAS o texto que aparece na conversa (no histórico de chat). Jamais confunda o conteúdo do sistema com o que o cliente escreveu.

- ISOLAMENTO DE SERVIÇOS E GEOGRAFIA (CRÍTICO): Foque-se exclusivamente no país e serviço específico solicitado pelo cliente na conversa. É ESTREITAMENTE PROIBIDO misturar regras, processos, órgãos emissores (ex: AIMA de Portugal, SEF, etc.) ou requisitos de outros países que não o país de destino solicitado pelo cliente (ex: Espanha). Nunca confunda ou cruze informações de diferentes serviços ou destinos.
- PRIMEIRA MENSAGEM (SAUDAÇÃO): Deve ser uma saudação super simpática, diretamente. Se o cliente disser apenas "Olá?" a meio da conversa, responda de forma natural e animada (ex: "Estou aqui! Como posso ajudar hoje?"), e nunca repetindo o texto anterior.
- PROIBIDO REPETIR SAUDAÇÕES: Se o histórico mostra que a conversa já começou, vá direto à resposta sem dizer "Olá" novamente.
- ENVIO DE ARQUIVOS/DOCUMENTOS: Sempre que o cliente solicitar, pedir ou demonstrar interesse em receber qualquer arquivo, catálogo, guia, documento, tabela ou PDF listado na secção "ARQUIVOS QUE VOCÊ PODE ENVIAR", você DEVE anexar o código correspondente [SEND_FILE: ID] na sua mensagem. Se o cliente pedir MÚLTIPLOS ficheiros ou todas as tabelas, inclua o código [SEND_FILE: ID] de cada um dos ficheiros solicitados na mesma resposta (exemplo: "Aqui estão os ficheiros: [SEND_FILE: id1] [SEND_FILE: id2]"). Nunca invente IDs de arquivos e nunca crie códigos para arquivos que não estão explicitamente na lista fornecida.
- RESPOSTAS CURTAS E PRECISAS (MANDATÓRIO): As suas respostas devem ser diretas, curtas e precisas, evitando parágrafos longos ou explicações excessivas. Apenas escreva respostas longas se for estritamente necessário para explicar um processo detalhado. Economize o tempo do utilizador.
- FORMATAÇÃO E REALCE DE TEXTO (CRÍTICO):
  * Realce as partes importantes do texto em **negrito**.
  * EVITE qualquer ruído de markdown como asteriscos avulsos (*), símbolos de cabeçalho (#) ou barras no meio das mensagens enviadas ao WhatsApp. O texto deve ser extremamente limpo e legível.
  * Sempre que listar passos, requisitos ou opções, utilize listas numeradas (1, 2, 3...) ou marcadores claros (hífens ou alíneas como a), b), c)...) para facilitar a leitura.
${returnGreetingRule}

笊絶武笊� REGRAS DE IDENTIDADE 笊絶武笊�
- Seu NOME ﾃｩ "${botName}". Use-o apenas se perguntarem quem vocﾃｪ ﾃｩ.
- NUNCA se identifique pelo nome da empresa "${companyName}". Vocﾃｪ ﾃｩ o assistente.

REGRAS OBRIGATﾃ迭IAS:
- Responda SEMPRE em portuguﾃｪs (angolano/europeu).
- ${emojiRules[emojiMode] || emojiRules.moderate}
- Seja prestﾃ｡vel e resolva os problemas do cliente com eficiﾃｪncia.
- Se nﾃ｣o souber a resposta, diga honestamente de forma simpﾃ｡tica.
- Nunca revele que ﾃｩ uma IA.
${transferRule}
${bookingRule}
${proposalRule}
${contactRule}
${referralContext}`;
}

// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
//  Construﾃｧﾃ｣o do histﾃｳrico de conversa para Gemini
// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
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

  // Verificar se o ﾃｺltimo item da rawList ﾃｩ exatamente igual ﾃ� mensagem atual
  // para evitar duplicaﾃｧﾃｵes de mensagens jﾃ｡ salvas no banco
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

  // 2. Agrupar mensagens consecutivas do mesmo role para cumprir a regra de alternﾃ｢ncia do Gemini
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

  // 3. Garantir que a conversa sempre comeﾃｧa com o role 'user'
  while (mergedList.length > 0 && mergedList[0].role !== 'user') {
    mergedList.shift();
  }

  return mergedList;
}


// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
//  Pesquisa Externa em Tempo Real (DuckDuckGo Lite Grounding)
// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
async function performWebSearch(query: string): Promise<string> {
  try {
    console.log(`[Search] �剥 A pesquisar em fontes oficiais: "${query}"...`);

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
      // Excluir rastreadores, anﾃｺncios e plataformas sociais menos oficiais
      if (!/facebook|instagram|twitter|youtube|tiktok|pinterest|reddit|amazon/i.test(u)) {
        foundUrls.push(u);
      }
    }

    if (foundUrls.length === 0) {
      console.warn('[Search] Nenhum URL encontrado nos resultados de pesquisa.');
      return '';
    }

    console.log(`[Search] �塘 ${foundUrls.length} fontes encontradas. A extrair conteﾃｺdo real...`);

    // 3. Ler o conteﾃｺdo real das pﾃ｡ginas em paralelo (mﾃ｡x 3 fontes, 5s timeout)
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
          // Limpar HTML 竊� texto
          const text = pageHtml
            .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gim, '')
            .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gim, '')
            .replace(/<[^>]+>/gm, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 3000); // mﾃ｡x 3000 chars por fonte

          if (text.length > 50) {
            console.log(`[Search] 笨� Fonte ${idx + 1} lida: ${url.substring(0, 60)}...`);
            return `[Fonte ${idx + 1} 窶� ${url}]:\n${text}`;
          }
          return null;
        } catch {
          return null;
        }
      })
    );

    const validResults = pageResults.filter(Boolean) as string[];

    if (validResults.length > 0) {
      console.log(`[Search] 笨� Pesquisa concluﾃｭda. ${validResults.length} fontes com conteﾃｺdo real.`);
      return `笊絶武笊� INFORMAﾃ�髭S REAIS EXTRAﾃ好AS DE FONTES OFICIAIS 笊絶武笊申n${validResults.join('\n\n')}`;
    }

    return '';
  } catch (err: any) {
    console.warn('[Search] 笞��� Falha na pesquisa externa:', err.message);
    return '';
  }
}

// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
//  Serviﾃｧo Principal
// 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
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
              text: 'Descreva esta imagem detalhadamente em português, identificando qualquer texto escrito, documentos, informações relevantes, etc. Retorne apenas a descrição direta da imagem para ser usada como contexto.'
            }
          ]
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1000,
        }
      });

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

    // 0. Extrair e ler o conteﾃｺdo de URLs presentes na mensagem (ex: links de anﾃｺncios do Facebook/Instagram)
    // O conteﾃｺdo ﾃｩ passado como CONTEXTO DO SISTEMA (nﾃ｣o como mensagem do cliente) para evitar que a IA
    // confunda o conteﾃｺdo da pﾃ｡gina com o que o cliente escreveu.
    //
    // NOTA: Domínios de redireccionamento de anúncios (fb.me, l.facebook.com, etc.) são IGNORADOS
    // porque bloqueiam bots com 403/redirect-loop e causariam falha de toda a resposta.
    const AD_REDIRECT_DOMAINS = [
      'fb.me', 'l.facebook.com', 'lm.facebook.com', 'web.facebook.com',
      'l.instagram.com', 'ig.me', 'wa.me', 'whatsapp.com',
      'bit.ly', 'tinyurl.com', 'short.io', 'rebrand.ly', 't.co',
    ];
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
    const allDetectedUrls = message.match(urlRegex) || [];
    const detectedUrls = allDetectedUrls.filter(url => {
      try {
        const host = new URL(url).hostname.replace(/^www\./, '');
        return !AD_REDIRECT_DOMAINS.some(d => host === d || host.endsWith('.' + d));
      } catch (_) { return false; }
    });
    let urlContextBlocks: string[] = [];
    let extractedImages: { base64: string; mimeType: string }[] = [];

    if (allDetectedUrls.length > detectedUrls.length) {
      console.log(`[AIService] 🚫 ${allDetectedUrls.length - detectedUrls.length} URL(s) de anúncio/redirect ignorado(s) (domínio bloqueado).`);
    }

    if (detectedUrls.length > 0) {
      console.log(`[AIService] 🔗 ${detectedUrls.length} URL(s) detectado(s) na mensagem. A extrair conteﾃｺdo de texto e imagens...`);
      const urlFetches = detectedUrls.slice(0, 3).map(async (url) => {
        try {
          const result = await DocumentService.extractPageContentAndImages(url);
          if (result && result.text) {
            if (result.images && result.images.length > 0) {
              extractedImages.push(...result.images);
            }
            return `[Página: ${url}]:\n${result.text}`;
          }
        } catch (urlErr: any) {
          console.warn(`[AIService] ⚠️  Falha ao extrair conteúdo de ${url} (não crítico): ${urlErr.message}`);
        }
        return null;
      });
      const results = await Promise.all(urlFetches);
      urlContextBlocks = results.filter(Boolean) as string[];
    }

    // ── Pré-processamento multimodal via Gemini (EXCLUSIVO para áudio, imagens e documentos) ──
    // O conteúdo multimodal é sempre convertido para texto aqui pelo Gemini.
    // O motor de texto (DeepSeek) recebe apenas texto enriquecido.
    let enrichedMessage = message;
    let mediaForAI: { base64: string; mimeType: string } | undefined = media;

    if (mediaForAI) {
      if (mediaForAI.mimeType.startsWith('audio/')) {
        console.log(`[AIService] 🎙️  [Gemini Multimodal] Transcrevendo áudio...`);
        try {
          const { AudioService } = await import('./audio.service');
          const stt = await AudioService.speechToTextFromBase64(mediaForAI.base64, mediaForAI.mimeType);
          if (stt?.text) {
            enrichedMessage = `${enrichedMessage}\n\n[Áudio transcrito]:\n${stt.text}`.trim();
            console.log(`[AIService] ✅ Áudio transcrito com sucesso (${stt.text.length} chars).`);
          } else {
            console.warn('[AIService] ⚠️  Transcrição de áudio retornou vazia.');
          }
        } catch (e: any) {
          console.error('[AIService] ❌ Falha ao transcrever áudio via Gemini:', e.message);
        }
        mediaForAI = undefined; // convertido para texto — não passar para o motor de texto

      } else if (
        mediaForAI.mimeType.includes('pdf') ||
        mediaForAI.mimeType.includes('word') ||
        mediaForAI.mimeType.includes('docx') ||
        mediaForAI.mimeType.startsWith('text/')
      ) {
        console.log(`[AIService] 📄 [Gemini Multimodal] Extraindo texto de documento (${mediaForAI.mimeType})...`);
        try {
          const docText = await DocumentService.extractTextFromBase64(mediaForAI.base64, mediaForAI.mimeType);
          if (docText) {
            enrichedMessage = `${enrichedMessage}\n\n[Documento anexo]:\n${docText}`.trim();
            console.log(`[AIService] ✅ Documento extraído com sucesso (${docText.length} chars).`);
          } else {
            console.warn('[AIService] ⚠️  Extracção de documento retornou vazia.');
          }
        } catch (e: any) {
          console.error('[AIService] ❌ Falha ao extrair documento via Gemini:', e.message);
        }
        mediaForAI = undefined;

      } else if (mediaForAI.mimeType.startsWith('image/')) {
        console.log(`[AIService] 🖼️  [Gemini Multimodal] Descrevendo imagem (${mediaForAI.mimeType})...`);
        try {
          const description = await AIService.describeImageWithGemini(mediaForAI.base64, mediaForAI.mimeType);
          if (description) {
            enrichedMessage = `${enrichedMessage}\n\n[Imagem anexa - descrição]:\n${description}`.trim();
            console.log(`[AIService] ✅ Imagem descrita com sucesso (${description.length} chars).`);
          } else {
            console.warn('[AIService] ⚠️  Descrição de imagem retornou vazia.');
          }
        } catch (e: any) {
          console.error('[AIService] ❌ Falha ao descrever imagem via Gemini:', e.message);
        }
        mediaForAI = undefined;
      }
    }

    // Descrever imagens extraídas de URLs com Gemini
    if (extractedImages.length > 0) {
      console.log(`[AIService] Descrevendo ${extractedImages.length} imagem(ns) extraída(s) de URLs com Gemini...`);
      for (const img of extractedImages.slice(0, 3)) {
        try {
          const desc = await AIService.describeImageWithGemini(img.base64, img.mimeType);
          if (desc) enrichedMessage = `${enrichedMessage}\n\n[Imagem de URL - descrição]:\n${desc}`.trim();
        } catch (_) { /* silêncio */ }
      }
      extractedImages = [];
    }

    const urlSystemContext = urlContextBlocks.length > 0 ? urlContextBlocks.join('\n\n') : undefined;


    // 1. Carregar perfil da organizaﾃｧﾃ｣o, Base de Conhecimento (RAG) e Assets
    let org: OrgProfile | null = null;
    let externalKnowledge = '';
    let availableAssets = '';

    if (orgId && mode !== 'support') {
      // Perfil bﾃ｡sico
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

      // Instruﾃｧﾃｵes (Snippets)
      const { data: snippets } = await supabaseAdmin
        .from('bot_instructions')
        .select('content')
        .eq('org_id', orgId);

      const snippetsText = (snippets || []).map(s => s.content).join('\n');

      // Assets Pﾃｺblicos (Arquivos para enviar)
      const { data: assets } = await supabaseAdmin
        .from('public_assets')
        .select('id, filename, description')
        .eq('org_id', orgId);

      if (assets && assets.length > 0) {
        availableAssets = '\n笊絶武笊� ARQUIVOS QUE VOCﾃ� PODE ENVIAR AO CLIENTE 笊絶武笊申n' +
          assets.map(a => `- ID: ${a.id} | Descriﾃｧﾃ｣o: ${a.description} | Arquivo: ${a.filename}`).join('\n') +
          '\nPara enviar um arquivo, responda exatamente com o cﾃｳdigo: [SEND_FILE: ID] no final da sua resposta.';
      }

      // Realizar pesquisa externa em tempo real em fontes oficiais se a mensagem do cliente exigir dados precisos/recentes
      let searchResults = '';
      const isSearchNeeded = /visto|consulado|taxa|preﾃｧo|atual|hoje|requisito|oficial|governo|site|embaixada|documento|notﾃｭcia/i.test(enrichedMessage);
      if (isSearchNeeded) {
        try {
          searchResults = await performWebSearch(enrichedMessage);
        } catch (err) {
          console.warn('[Search] Erro ao buscar informaﾃｧﾃｵes em tempo real:', err);
        }
      }

      externalKnowledge = `${snippetsText}\n\n${externalKnowledge}\n\n${searchResults}`.trim();
    }

    // 笏€笏€ Funﾃｧﾃ｣o auxiliar: limpar texto e extrair apenas a resposta final 笏€笏€笏€笏€笏€笏€笏€笏€
    function extractCleanText(parts: any[]): string {
      // 1. Filtrar partes de "pensamento" da API (thought=true, code, etc.)
      const textParts = parts
        .filter((p: any) => !p.thought && !p.executableCode && !p.codeExecutionResult)
        .map((p: any) => (p.text ?? '').trim())
        .filter(Boolean);

      let raw = textParts.join('\n').trim();

      if (!raw) return '';

      // 2. Remover blocos <think>...</think> (raciocﾃｭnio interno do modelo)
      raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');

      // 3. Remover padrﾃｵes de raciocﾃｭnio em inglﾃｪs que vazam no output
      raw = raw.replace(/^(The user (is asking|wants|said|mentioned)|I need to|I should|Let me|I will|I'll|Okay,|Sure,|Certainly,).*$/gim, '');

            // 4. Remover blocos de cﾃｳdigo tﾃｩcnico (tool_code, python, etc.)
      raw = raw.replace(/```(?:python|tool_code|json|javascript|typescript)?[\s\S]*?```/gi, '');
      raw = raw.replace(/tool_code\s*[\s\S]*?(?=\n\n|$)/gi, '');
      raw = raw.replace(/print\(.*?\)/gi, '');

      // 5. Remover linhas de raciocﾃｭnio tﾃｭpicas do Gemini 2.5 Thinking
      raw = raw.replace(/^(Thought:|Reasoning:|Step \d+:|Analysis:|Context:).*$/gim, '');

      // 6. Limpar linhas vazias excessivas
      raw = raw.replace(/\n{3,}/g, '\n\n').trim();

      return raw;
    }

    // 2. Construir system prompt e conteúdos (Gemini format — reutilizado também no fallback Gemini)
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

    // contents no formato Gemini (usado apenas se Gemini for chamado como fallback de texto)
    const contents = buildContents(history, enrichedMessage, media, extractedImages);

        let lastError = '';

    // ──────────────────────────────────────────────────────────────────────────────────────────────────
    // MOTOR 1 — DeepSeek (PRINCIPAL para texto)
    // ──────────────────────────────────────────────────────────────────────────────────────────────────
    const dsKeys = getUniqueDeepseekApiKeys();
    if (dsKeys.length === 0) {
      console.warn(`[AIService] ⚠️  DeepSeek sem chaves. A tentar Gemini como fallback de texto...`);
    } else {
      console.log(`[AIService] 🚀 DeepSeek [PRINCIPAL] — ${dsKeys.length} chave(s) disponível(is).`);
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
          console.log(`[AIService] 🔄 DeepSeek — chave ${idx} (${maskedKey}), tentativa ${attempt + 1}/${dsKeys.length}...`);
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
            console.warn(`[AIService] ⚠️  DeepSeek chave ${idx} retornou resposta vazia.`);
            continue;
          }

          // Remover blocos de raciocínio <think>...</think> que o deepseek-reasoner pode emitir
          const cleanedText  = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
          const confirm      = cleanedText.includes('[CONFIRMAR_INFORMAÇÃO]');
          const transfer     = cleanedText.includes('[TRANSFERIR_HUMANO]');
          const booking      = cleanedText.includes('[AGENDAR]');
          const proposal     = cleanedText.includes('[PROPOSTA]');
          const contactMatch = cleanedText.match(/\[CONTATO:(\{[^}]+\})\]/);
          const contactData  = contactMatch
            ? (() => { try { return JSON.parse(contactMatch[1]); } catch { return undefined; } })()
            : undefined;
          const cleanReply = cleanedText
            .replace(/\[TRANSFERIR_HUMANO\]|\[AGENDAR\]|\[PROPOSTA\]|\[CONFIRMAR_INFORMAÇÃO\]|\[CONTATO:\{[^}]+\}\]/g, '')
            .trim();

          console.log(`[AIService] ✅ Resposta via DeepSeek [PRINCIPAL] (chave ${idx}) — ${cleanReply.length} chars.`);
          return { reply: cleanReply || cleanedText, transfer, booking, proposal, contactData, confirm };

        } catch (dsErr: any) {
          const httpStatus = dsErr.response?.status ?? 'N/A';
          const isTimeout  = dsErr.code === 'ECONNABORTED' || dsErr.message?.includes('timeout');
          lastError = dsErr.response?.data?.error?.message || dsErr.message || String(dsErr);

          if (isTimeout) {
            console.warn(`[AIService] ⏱️  DeepSeek chave ${idx} TIMEOUT após 20s. A tentar próxima chave...`);
          } else if (httpStatus === 401 || httpStatus === 402) {
            console.error(`[AIService] ❌ DeepSeek chave ${idx} sem saldo/inválida (HTTP ${httpStatus}). A parar DeepSeek.`);
            break; // sem saldo — inutilizar todas as chaves restantes
          } else if (httpStatus === 429) {
            console.warn(`[AIService] ⏳ DeepSeek chave ${idx} rate-limited (HTTP 429). A tentar próxima chave...`);
          } else {
            console.error(`[AIService] ❌ DeepSeek chave ${idx} HTTP ${httpStatus}: ${lastError}`);
          }
        }
      }
      console.warn(`[AIService] ⚠️  DeepSeek esgotou todas as chaves. A passar para Gemini como fallback de texto.`);
    }

    // ──────────────────────────────────────────────────────────────────────────────────────────────────
    // MOTOR 2 — Gemini 2.5 Flash (FALLBACK de texto, sempre usado para multimodal)
    // ──────────────────────────────────────────────────────────────────────────────────────────────────
    const geminiKeysText = getUniqueApiKeys();
    if (geminiKeysText.length === 0) {
      console.warn(`[AIService] ⚠️  Nenhuma GEMINI_API_KEY configurada. A tentar OpenAI...`);
    } else {
      console.log(`[AIService] 🔁 Gemini 2.5 Flash [FALLBACK TEXTO] — ${geminiKeysText.length} chave(s)...`);
      const baseConfig = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.4, maxOutputTokens: 1500 },
      };
      const formatsGemini = [
        { label: 'com google_search',  payload: { ...baseConfig, tools: [{ google_search: {} }] } },
        { label: 'com googleSearch',   payload: { ...baseConfig, tools: [{ googleSearch: {} }] } },
        { label: 'sem tools',          payload: { ...baseConfig } },
      ];

      for (let keyIdx = 0; keyIdx < geminiKeysText.length; keyIdx++) {
        const apiKey = geminiKeysText[keyIdx];
        const url    = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
        const masked = apiKey.substring(0, 8) + '...' + apiKey.substring(apiKey.length - 4);
        let keyFailed = false;

        for (const { label, payload } of formatsGemini) {
          try {
            console.log(`[AIService] 🔄 Gemini fallback — chave ${keyIdx} (${masked}) ${label}...`);
            const response = await axios.post(url, payload, {
              headers: { 'Content-Type': 'application/json' },
              timeout: 25_000,
            });
            const parts: any[] = response.data?.candidates?.[0]?.content?.parts ?? [];
            const cleanText = extractCleanText(parts);
            if (!cleanText) { continue; }

            const confirm      = cleanText.includes('[CONFIRMAR_INFORMAÇÃO]');
            const transfer     = cleanText.includes('[TRANSFERIR_HUMANO]');
            const booking      = cleanText.includes('[AGENDAR]');
            const proposal     = cleanText.includes('[PROPOSTA]');
            const contactMatch = cleanText.match(/\[CONTATO:(\{[^}]+\})\]/);
            const contactData  = contactMatch
              ? (() => { try { return JSON.parse(contactMatch[1]); } catch { return undefined; } })()
              : undefined;
            const cleanReply = cleanText
              .replace(/\[TRANSFERIR_HUMANO\]|\[AGENDAR\]|\[PROPOSTA\]|\[CONFIRMAR_INFORMAÇÃO\]|\[CONTATO:\{[^}]+\}\]/g, '')
              .trim();

            console.log(`[AIService] ✅ Resposta via Gemini [FALLBACK TEXTO] chave ${keyIdx}.`);
            return { reply: cleanReply || cleanText, transfer, booking, proposal, contactData, confirm };

          } catch (err: any) {
            const status  = err.response?.status ?? 'N/A';
            lastError     = err.response?.data?.error?.message || err.message || String(err);
            if (status === 429 || status === 403 ||
                lastError.toLowerCase().includes('quota') ||
                lastError.toLowerCase().includes('denied') ||
                lastError.toLowerCase().includes('not valid')) {
              console.warn(`[AIService] ⚠️  Gemini chave ${keyIdx} bloqueada/sem quota (HTTP ${status}). A tentar próxima...`);
              keyFailed = true;
              break;
            }
            console.error(`[AIService] ❌ Gemini chave ${keyIdx} ${label} (HTTP ${status}): ${lastError}`);
          }
        }
        if (keyFailed) continue;
      }
      console.warn(`[AIService] ⚠️  Gemini esgotou todas as chaves. Todos os motores de texto falharam.`);
    }

    // Todos os motores falharam (DeepSeek + Gemini)
    console.error(`[AIService] ❌ TODOS os motores de IA falharam (DeepSeek + Gemini). Último erro: ${lastError}`);
    return {
      reply: 'Desculpe, não consegui processar a sua mensagem neste momento. Por favor, tente novamente em breve.',
      transfer: false,
    };
  }

  /**
   * Traduz um texto silenciosamente para a lﾃｭngua alvo (usado para gravar histﾃｳrico em PT)
   */
  static async translateText(text: string, targetLanguage: string): Promise<string> {
    // 1. Tentar DeepSeek (motor principal de texto)
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
          timeout: 15_000,
        });
        const result = response.data?.choices?.[0]?.message?.content?.trim();
        if (result) return result;
      }
    } catch (err: any) {
      console.warn(`[AIService] ⚠️  DeepSeek falhou na tradução: ${err.message}. A tentar Gemini...`);
    }

    // 2. Fallback: Gemini
    try {
      const apiKey = getApiKey(0);
      const url = `${GEMINI_BASE}/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const response = await axios.post(url, {
        contents: [{ parts: [{ text: `Traduza o seguinte texto para ${targetLanguage}. Retorne APENAS a tradução:\n\n${text}` }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 500 },
      }, { timeout: 15_000 });
      const result = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (result) return result;
    } catch (err: any) {
      console.warn(`[AIService] ⚠️  Gemini também falhou na tradução: ${err.message}.`);
    }

    return text; // fallback: devolver o original sem tradução
  }
}

