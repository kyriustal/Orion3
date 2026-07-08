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

/** Obter lista de todas as chaves Deepseek vﾃ｡lidas e ﾃｺnicas */
export function getUniqueDeepseekApiKeys(): string[] {
  const rawKeys = [
    process.env.DEEPSEEK_API_KEY,
    process.env.DEEPSEEK_API_KEY_2,
    process.env.DEEPSEEK_API_KEY_3,
    process.env.DEEPSEEK_API_KEY_4,
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
  urlContext?: string
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

  let bookingRule = '- Se o cliente solicitar agendamento, marcaﾃｧﾃ｣o de consulta ou pedir para agendar um serviﾃｧo, inicie a sua resposta com o token [AGENDAR].';
  if (org?.calendar_provider === 'other' && org.calendar_link) {
    bookingRule += ` Alﾃｩm disso, informe amigavelmente o cliente que ele pode agendar diretamente atravﾃｩs do seguinte link: ${org.calendar_link}`;
  } else if (org?.calendar_provider === 'google' || org?.calendar_provider === 'microsoft') {
    bookingRule += ` Alﾃｩm disso, informe que a marcaﾃｧﾃ｣o serﾃ｡ integrada com o nosso calendﾃ｡rio (${org.calendar_provider === 'google' ? 'Google Calendar' : 'Outlook Calendar'}) de forma automﾃ｡tica.`;
  }

  const proposalRule = '- PROPOSTAS COMERCIAIS DO CLIENTE: Se o cliente enviar uma proposta comercial (oferta de parceria, prestaﾃｧﾃ｣o de serviﾃｧos, fornecimento de produtos, colaboraﾃｧﾃ｣o, publicidade, patrocﾃｭnio, ou qualquer outro tipo de proposta de negﾃｳcio) 窶� quer seja num sector semelhante ao da empresa OU num sector completamente diferente 窶� responda de forma diplomﾃ｡tica e profissional. Reconheﾃｧa a proposta com simpatia, informe que irﾃ｡ encaminhar para a ﾃ｡rea competente para anﾃ｡lise, e inclua o token [PROPOSTA] no INﾃ垢IO da sua resposta. ATENﾃ�グ CRﾃ控ICA: Nﾃ｣o confunda a proposta do cliente com os produtos/serviﾃｧos da NOSSA empresa. A proposta ﾃｩ uma OFERTA DO CLIENTE para nﾃｳs, nﾃ｣o um pedido de compra dos nossos serviﾃｧos. Trate-a como tal.';

  // Instruﾃｧﾃ｣o para captura automﾃ｡tica de dados de contacto
  const contactRule = '- Se o cliente partilhar espontaneamente informaﾃｧﾃｵes de contacto (nome completo, email, nﾃｺmero de telefone, morada ou empresa), inclua no INﾃ垢IO da sua resposta o token compacto [CONTATO:{"name":"<nome>","email":"<email>","phone":"<tel>"}] preenchendo APENAS os campos que o cliente efectivamente partilhou. Nunca invente dados. Exemplo: [CONTATO:{"name":"Ana Silva","phone":"+244912345678"}].';

  const referralContext = referral?.headline
    ? `- Este cliente chegou atravﾃｩs do anﾃｺncio: "${referral.headline}". Adapte a primeira saudaﾃｧﾃ｣o a esse contexto de forma entusiasmada.`
    : '';

  // Contexto de URLs/anﾃｺncios extraﾃｭdo pelo sistema 窶� NUNCA confundir com o que o cliente escreveu
  const urlContextSection = urlContext
    ? `\n笊絶武笊� CONTEXTO DO ANﾃ哢CIO / LINK (EXTRAﾃ好O PELO SISTEMA 窶� Nﾃグ ESCRITO PELO CLIENTE) 笊絶武笊申n笞��� O conteﾃｺdo abaixo foi extraﾃｭdo AUTOMATICAMENTE da pﾃ｡gina de destino do anﾃｺncio ou link que o cliente clicou. Nﾃグ ﾃｩ uma mensagem do cliente. Use este contexto para compreender o produto/serviﾃｧo pelo qual o cliente se interessou e direcione a conversa de forma pertinente.\n${urlContext}\n`
    : '';

  let returnGreetingRule = '';
  if (timeSinceLastMessageHours !== undefined && timeSinceLastMessageHours >= 1) {
    returnGreetingRule = `- O cliente esteve inativo por mais de 1 hora. Se a nova mensagem dele for uma saudaﾃｧﾃ｣o (ex: "Olﾃ｡", "Bom dia"), dﾃｪ uma saudaﾃｧﾃ｣o calorosa e breve, pergunte como pode ajudar e retome o assunto de forma cativante.`;
  }

  return `Você é ${botName}, assistente virtual oficial da empresa "${companyName}".
${sector ? `Sector de actividade: ${sector}.` : ''}

═══ SUA PERSONALIDADE E COMPORTAMENTO (DEFINIDOS PELO USUÁRIO NO PAINEL) ═══
${org?.ai_prompt ? org.ai_prompt : 'Você deve agir como um assistente extremamente simpático, cordial, prestativo, persuasivo e carismático.'}

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
- - PRIMEIRA MENSAGEM (SAUDAÇÃO): Deve ser uma saudação super simpática, diretamente. Se o cliente disser apenas "Olá?" a meio da conversa, responda de forma natural e animada (ex: "Estou aqui! Como posso ajudar hoje?"), e nunca repetindo o texto anterior.
- PROIBIDO REPETIR SAUDAÇÕES: Se o histórico mostra que a conversa já começou, vá direto à resposta sem dizer "Olá" novamente.
- EQUILÍBRIO & SIMPATIA: Seja objetivo e evite rodeios desnecessários, mas NUNCA à custa do carisma e da empatia. As respostas devem ter uma extens�o natural, sendo sempre acolhedoras, carismﾃ｡ticas, fluidas e extremamente persuasivas.
- ENVIO DE ARQUIVOS/DOCUMENTOS: Sempre que o cliente solicitar, pedir ou demonstrar interesse claro em receber qualquer arquivo, catﾃ｡logo, guia, documento ou PDF que esteja listado na secﾃｧﾃ｣o "ARQUIVOS QUE VOCﾃ� PODE ENVIAR", vocﾃｪ DEVE anexar o cﾃｳdigo correspondente [SEND_FILE: ID] exatamente no final da sua mensagem (exemplo: "Aqui tem o ficheiro solicitado: [SEND_FILE: 12345678-abcd-1234-abcd-1234567890ab]"). Nunca invente IDs de arquivos e nunca crie cﾃｳdigos para arquivos que nﾃ｣o estﾃ｣o explicitamente na lista fornecida.
${returnGreetingRule} diretamente. Se o cliente disser apenas "Olﾃ｡?" a meio da conversa, responda de forma natural e animada (ex: "Estou aqui! Como posso ajudar hoje?"), e nunca repetindo o texto anterior.
- PROIBIDO REPETIR SAUDAﾃ�髭S: Se o histﾃｳrico mostra que a conversa jﾃ｡ comeﾃｧou, vﾃ｡ DIRETO ﾃ� resposta sem dizer "Olﾃ｡" novamente.
- EQUILﾃ坑RIO & SIMPATIA: Seja objetivo e evite rodeios desnecessﾃ｡rios, mas NUNCA ﾃ� custa do carisma e da empatia. As respostas devem ter uma extensﾃ｣o natural, sendo sempre acolhedoras, carismﾃ｡ticas, fluidas e extremamente persuasivas.
- ENVIO DE ARQUIVOS/DOCUMENTOS: Sempre que o cliente solicitar, pedir ou demonstrar interesse claro em receber qualquer arquivo, catﾃ｡logo, guia, documento ou PDF que esteja listado na secﾃｧﾃ｣o "ARQUIVOS QUE VOCﾃ� PODE ENVIAR", vocﾃｪ DEVE anexar o cﾃｳdigo correspondente [SEND_FILE: ID] exatamente no final da sua mensagem (exemplo: "Aqui tem o ficheiro solicitado: [SEND_FILE: 12345678-abcd-1234-abcd-1234567890ab]"). Nunca invente IDs de arquivos e nunca crie cﾃｳdigos para arquivos que nﾃ｣o estﾃ｣o explicitamente na lista fornecida.
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

    // 0. Extrair e ler o conteﾃｺdo de URLs presentes na mensagem (ex: links de anﾃｺncios do Facebook/Instagram)
    // O conteﾃｺdo ﾃｩ passado como CONTEXTO DO SISTEMA (nﾃ｣o como mensagem do cliente) para evitar que a IA
    // confunda o conteﾃｺdo da pﾃ｡gina com o que o cliente escreveu.
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
    const detectedUrls = message.match(urlRegex) || [];
    let urlContextBlocks: string[] = [];
    let extractedImages: { base64: string; mimeType: string }[] = [];

    if (detectedUrls.length > 0) {
      console.log(`[AIService] �迫 ${detectedUrls.length} URL(s) detectado(s) na mensagem. A extrair conteﾃｺdo de texto e imagens...`);
      const urlFetches = detectedUrls.slice(0, 3).map(async (url) => {
        const result = await DocumentService.extractPageContentAndImages(url);
        if (result && result.text) {
          if (result.images && result.images.length > 0) {
            extractedImages.push(...result.images);
          }
          return `[Pﾃ｡gina: ${url}]:\n${result.text}`;
        }
        return null;
      });
      const results = await Promise.all(urlFetches);
      urlContextBlocks = results.filter(Boolean) as string[];
    }

    // A mensagem do cliente mantﾃｩm-se LIMPA 窶� o contexto de URL vai para o sistema, Nﾃグ para a mensagem
    const enrichedMessage = message;
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

    // 笏笏 Funﾃｧﾃ｣o auxiliar: limpar texto e extrair apenas a resposta final 笏笏笏笏笏笏笏笏
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

    // 2. Construir sistema e conteﾃｺdos
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

    // ------------------------------------------------------------------------------------------------------------------
    // 3.5. Tentar Deepseek Primeiro (Se a chave estiver configurada)
    // ------------------------------------------------------------------------------------------------------------------
    const dsKeys = getUniqueDeepseekApiKeys();
    if (dsKeys.length > 0) {
      console.log(`[AIService] Tentando Deepseek como motor principal (${dsKeys.length} chave(s) configurada(s))...`);
      const dsModel = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
      const dsBaseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';

      // Pre-processamento multimodal para o Deepseek:
      // Se a mídia for um áudio, transcrevemos
      // Se for um documento, extraímos o texto
      let dsEnrichedMessage = enrichedMessage;
      let dsMedia: { base64: string; mimeType: string } | undefined = media;

      if (dsMedia) {
        if (dsMedia.mimeType.startsWith('audio/')) {
          console.log(`[AIService] Transcrevendo áudio para Deepseek...`);
          const stt = await AudioService.speechToTextFromBase64(dsMedia.base64, dsMedia.mimeType);
          if (stt && stt.text) {
            dsEnrichedMessage = `${dsEnrichedMessage}\n\n[Áudio anexo transcrito]:\n${stt.text}`.trim();
          }
          dsMedia = undefined; // não enviar áudio binário
        } else if (
          dsMedia.mimeType.includes('pdf') ||
          dsMedia.mimeType.includes('word') ||
          dsMedia.mimeType.includes('docx') ||
          dsMedia.mimeType.startsWith('text/')
        ) {
          console.log(`[AIService] Extraindo texto de documento para Deepseek...`);
          const docText = await DocumentService.extractTextFromBase64(dsMedia.base64, dsMedia.mimeType);
          if (docText) {
            dsEnrichedMessage = `${dsEnrichedMessage}\n\n[Documento anexo]:\n${docText}`.trim();
          }
          dsMedia = undefined; // nﾃ｣o enviar documento binﾃ｡rio
        }
      }

      const lastUserContent: any[] = [{ type: 'text', text: dsEnrichedMessage }];

      if (dsMedia && dsMedia.mimeType.startsWith('image/')) {
        console.log(`[AIService] Incluindo imagem (${dsMedia.mimeType}) no payload do Deepseek...`);
        lastUserContent.push({
          type: 'image_url',
          image_url: {
            url: `data:${dsMedia.mimeType};base64,${dsMedia.base64}`,
          },
        });
      }

      if (extractedImages.length > 0) {
        console.log(`[AIService] Incluindo ${extractedImages.length} imagem(ns) extraﾃｭda(s) de links no payload do Deepseek...`);
        extractedImages.forEach((img) => {
          lastUserContent.push({
            type: 'image_url',
            image_url: {
              url: `data:${img.mimeType};base64,${img.base64}`,
            },
          });
        });
      }

      const deepseekMessages = [
        { role: 'system', content: systemPrompt },
        ...history.map(h => ({
          role: h.sender === 'user' ? 'user' : 'assistant',
          content: h.text,
        })),
        { role: 'user', content: lastUserContent.length > 1 ? lastUserContent : dsEnrichedMessage },
      ];

      for (let attempt = 0; attempt < dsKeys.length; attempt++) {
        // Rotaﾃｧﾃ｣o inicial no tempo + deslocamento por tentativa
        const baseIdx = Math.floor(Date.now() / 60_000);
        const idx = (baseIdx + attempt) % dsKeys.length;
        const deepseekKey = dsKeys[idx];

        try {
          console.log(`[AIService] Enviando requisiﾃｧﾃ｣o Deepseek com chave index ${idx} (tentativa ${attempt + 1}/${dsKeys.length})...`);
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
            timeout: 25_000,
          });

          const rawText = response.data?.choices?.[0]?.message?.content?.trim();
          if (rawText) {
            const confirm      = rawText.includes('[CONFIRMAR_INFORMAÇÃO]');
            const transfer      = rawText.includes('[TRANSFERIR_HUMANO]');
            const booking      = rawText.includes('[AGENDAR]');
            const proposal     = rawText.includes('[PROPOSTA]');
            const contactMatch = rawText.match(/\[CONTATO:(\{[^}]+\})\]/);
            const contactData  = contactMatch ? (() => { try { return JSON.parse(contactMatch[1]); } catch { return undefined; } })() : undefined;
            const cleanReply   = rawText.replace(/\[TRANSFERIR_HUMANO\]|\[AGENDAR\]|\[PROPOSTA\]|\[CONFIRMAR_INFORMAÇÃO\]|\[CONTATO:\{[^}]+\}\]/g, '').trim();
            console.log(`[AIService] 笨� Resposta gerada com sucesso via Deepseek (chave index ${idx}).`);
            if (contactData) console.log(`[AIService] �搭 Dados de contacto capturados:`, contactData);
            if (proposal) console.log(`[AIService] �梼 Proposta comercial detectada.`);
            return { reply: cleanReply || rawText, transfer, booking, proposal, contactData, confirm };
          }
        } catch (deepseekErr: any) {
          const errData = deepseekErr.response?.data;
          lastError = errData?.error?.message || deepseekErr.message;
          console.error(`[AIService] 笶� Deepseek com chave index ${idx} falhou:`, lastError);
          if (errData) console.error(`[AIService] Detalhe API Deepseek:`, JSON.stringify(errData).substring(0, 400));
        }
      }
    }

    // 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
    // 4. Tentar OpenAI gpt-4o-mini Primeiro (Se a chave estiver configurada)
    // 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

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
          console.log(`[AIService] Incluindo ${extractedImages.length} imagem(ns) extraﾃｭda(s) de links no payload do GPT-4o mini...`);
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
          const confirm      = rawText.includes('[CONFIRMAR_INFORMAÇÃO]');
          const transfer      = rawText.includes('[TRANSFERIR_HUMANO]');
          const booking      = rawText.includes('[AGENDAR]');
          const proposal     = rawText.includes('[PROPOSTA]');
          const contactMatch = rawText.match(/\[CONTATO:(\{[^}]+\})\]/);
          const contactData  = contactMatch ? (() => { try { return JSON.parse(contactMatch[1]); } catch { return undefined; } })() : undefined;
          const cleanReply   = rawText.replace(/\[TRANSFERIR_HUMANO\]|\[AGENDAR\]|\[PROPOSTA\]|\[CONFIRMAR_INFORMAÇÃO\]|\[CONTATO:\{[^}]+\}\]/g, '').trim();
          console.log(`[AIService] 笨� Resposta gerada com sucesso via OpenAI gpt-4o-mini.`);
          if (contactData) console.log(`[AIService] �搭 Dados de contacto capturados:`, contactData);
          if (proposal) console.log(`[AIService] �梼 Proposta comercial detectada.`);
          return { reply: cleanReply || rawText, transfer, booking, proposal, contactData, confirm };
        }
      }
    } catch (openaiErr: any) {
      const errData = openaiErr.response?.data;
      lastError = errData?.error?.message || openaiErr.message;
      console.error(`[AIService] 笶� OpenAI falhou:`, lastError);
      if (errData) console.error(`[AIService] Detalhe API OpenAI:`, JSON.stringify(errData).substring(0, 400));
    }

    // 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
    // 5. Fallback automﾃ｡tico para Gemini 2.5 Flash
    // 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
    try {
      console.log(`[AIService] Avanﾃｧando para fallback Gemini 2.5 Flash...`);
      const apiKey = getApiKey(0);
      const url    = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

      const attempts = [
        { label: 'com google_search',  payload: payloadWithSearch  },
        { label: 'com googleSearch',   payload: payloadWithSearch2 },
        { label: 'sem tools',          payload: payloadNoSearch    },
      ];

      for (const { label, payload } of attempts) {
        try {
          console.log(`[AIService] Tentando chave Gemini ativa 窶� formato ${label}...`);

          const response = await axios.post(url, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 35_000,
          });

          const parts: any[] = response.data?.candidates?.[0]?.content?.parts ?? [];
          const cleanText = extractCleanText(parts);

          if (!cleanText) {
            console.warn(`[AIService] Resposta vazia apﾃｳs limpeza no formato ${label}.`);
            continue;
          }

          const confirm      = cleanText.includes('[CONFIRMAR_INFORMAÇÃO]');
          const transfer      = cleanText.includes('[TRANSFERIR_HUMANO]');
          const booking      = cleanText.includes('[AGENDAR]');
          const proposal     = cleanText.includes('[PROPOSTA]');
          const contactMatch = cleanText.match(/\[CONTATO:(\{[^}]+\})\]/);
          const contactData  = contactMatch ? (() => { try { return JSON.parse(contactMatch[1]); } catch { return undefined; } })() : undefined;
          const cleanReply   = cleanText.replace(/\[TRANSFERIR_HUMANO\]|\[AGENDAR\]|\[PROPOSTA\]|\[CONFIRMAR_INFORMAÇÃO\]|\[CONTATO:\{[^}]+\}\]/g, '').trim();
 
          console.log(`[AIService] 笨� Resposta gerada com sucesso com formato ${label} via Gemini.`);
          if (contactData) console.log(`[AIService] �搭 Dados de contacto capturados:`, contactData);
          if (proposal) console.log(`[AIService] �梼 Proposta comercial detectada.`);
          return { reply: cleanReply || cleanText, transfer, booking, proposal, contactData, confirm };

        } catch (err: any) {
          const errData  = err.response?.data;
          lastError      = errData?.error?.message || err.message;
          const status   = err.response?.status ?? 'N/A';
          console.error(`[AIService] 笶� Gemini formato ${label} falhou (HTTP ${status}): ${lastError}`);
          if (errData) console.error(`[AIService] Detalhe API Gemini:`, JSON.stringify(errData).substring(0, 400));
          
          if (status === 429) {
            console.warn(`[AIService] 笞��� Quota esgotada (429) na chave Gemini. Interrompendo tentativas Gemini.`);
            break;
          }
        }
      }
    } catch (geminiErr: any) {
      console.error(`[AIService] Falha crﾃｭtica no fallback Gemini:`, geminiErr.message);
    }

    // 6. ﾃ嗟timo recurso: resposta genﾃｩrica (apenas quando houver erro)
    if (lastError) {
      console.error(`[AIService] 笞��� Todos os caminhos falharam. Gerando resposta genﾃｩrica. ﾃ嗟timo erro: ${lastError}`);
      return {
        reply: 'Desculpe, nﾃ｣o consegui processar sua mensagem neste momento. Por favor, tente novamente em breve.',
        transfer: false,
      };
    }
    // Caso inesperado sem erro registrado, devolver mensagem padrﾃ｣o neutra
    console.warn(`[AIService] Nenhum erro registrado, mas chegou ao fallback. Resposta padrﾃ｣o.`);
    return {
      reply: 'Desculpe, nﾃ｣o consegui processar sua mensagem neste momento. Por favor, tente novamente em breve.',
      transfer: false,
    };
  }

  /**
   * Traduz um texto silenciosamente para a lﾃｭngua alvo (usado para gravar histﾃｳrico em PT)
   */
  static async translateText(text: string, targetLanguage: string): Promise<string> {
    try {
      const deepseekKey = process.env.DEEPSEEK_API_KEY?.replace(/^["']|["']$/g, '')?.trim();
      if (deepseekKey && deepseekKey.length > 10) {
        const dsModel = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
        const dsBaseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
        const response = await axios.post(`${dsBaseUrl}/chat/completions`, {
          model: dsModel,
          messages: [{ role: 'user', content: `Traduza o seguinte texto para ${targetLanguage}. Retorne APENAS a traduﾃｧﾃ｣o, sem comentﾃ｡rios:\n\n${text}` }],
          temperature: 0.3,
        }, {
          headers: { 'Authorization': `Bearer ${deepseekKey}` }
        });
        return response.data?.choices?.[0]?.message?.content?.trim() || text;
      }

      const openaiKey = process.env.OPENAI_API_KEY?.replace(/^["']|["']$/g, '')?.trim();
      if (openaiKey && openaiKey.length > 10) {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: `Traduza o seguinte texto para ${targetLanguage}. Retorne APENAS a traduﾃｧﾃ｣o, sem comentﾃ｡rios:\n\n${text}` }],
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
        contents: [{ parts: [{ text: `Traduza o seguinte texto para ${targetLanguage}. Retorne APENAS a traduﾃｧﾃ｣o:\n\n${text}` }] }],
      });
      return response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || text;
    } catch (err) {
      console.warn(`[AIService] Erro ao traduzir texto:`, err);
      return text; // fallback to original
    }
  }
}

