// src/backend/services/followup.service.ts
import { supabaseAdmin } from '../config/supabase';

// ─── Helper: converte "2h" / "3d" / "1w" / "2m" numa data futura ─────────────
export function parseDelay(delay: string): Date {
  const value = parseInt(delay.slice(0, -1), 10);
  const unit  = delay.slice(-1).toLowerCase();
  if (isNaN(value) || value <= 0) throw new Error(`Delay inválido: "${delay}"`);

  const date = new Date();
  switch (unit) {
    case 'h': date.setHours(date.getHours() + value);        break;
    case 'd': date.setDate(date.getDate() + value);          break;
    case 'w': date.setDate(date.getDate() + value * 7);      break;
    case 'm': date.setMonth(date.getMonth() + value);        break;
    default:  throw new Error(`Unidade desconhecida: "${unit}" (use h, d, w, m)`);
  }
  return date;
}

export interface FollowupContext {
  service?: string;
  benefit?: string;
  orgName?: string;
}

// ─── Mensagens do protocolo padrão de follow-up (condicionados ao contexto) ───
export const FOLLOWUP_MESSAGES = {
  /** Step 1 — após 12h sem resposta (condicionado ao cenário e contexto) */
  step1: (name: string, scenario: number = 4, ctx?: FollowupContext): string => {
    const n = name ? `Olá, ${name}!` : 'Olá!';
    const s = ctx?.service || 'processo';
    switch (scenario) {
      case 1: // 📄 Cenário 1: Aguardava documentos
        return `${n} Sei que a rotina é corrida, por isso passo só para saber se conseguiu ver a minha última mensagem sobre os documentos para o seu ${s} ou se prefere que conversemos noutro momento. Abraço!`;
      case 2: // 💰 Cenário 2: Enviou orçamento / valores
        return `${n} Sei que a rotina é corrida, por isso passo só para saber se conseguiu analisar a proposta e os valores do seu ${s} ou se prefere que conversemos noutro momento. Abraço!`;
      case 3: // 📅 Cenário 3: Faltava agendar consultoria
        return `${n} Sei que a rotina é corrida, por isso passo só para saber se conseguiu ver as opções de horário para agendarmos o seu atendimento ou se prefere conversar noutro momento. Abraço!`;
      default: // 🌍 Cenário 4: Abordagem geral
        return `${n} Sei que a rotina é corrida, por isso passo só para saber se conseguiu ver a minha última mensagem sobre o seu ${s} ou se prefere que conversemos noutro momento. Abraço!`;
    }
  },

  /** Step 2 — após +24h, contextualizado por cenário */
  step2: (name: string, scenario: number = 4, ctx?: FollowupContext): string => {
    const n = name ? `Olá, ${name}!` : 'Olá!';
    const s = ctx?.service || 'processo';
    switch (scenario) {
      case 1: // 📄 Cenário 1: Aguardava documentos, fotos ou informações do cliente
        return `${n} Passando para saber se conseguiu verificar os seus documentos ou as informações do seu perfil para darmos seguimento à análise do seu ${s}. Fico à sua disposição!`;
      case 2: // 💰 Cenário 2: Enviou orçamento / valores / modalidade pós-paga
        return `${n} Tudo bem? Queria saber se conseguiu analisar os valores e as condições da nossa assessoria para o seu ${s} (incluindo as opções de pagamento). Ficou com alguma dúvida sobre o investimento?`;
      case 3: // 📅 Cenário 3: Faltava agendar consultoria
        return `${n} Como a rotina pode estar corrida, passo para saber se conseguiu ver qual o melhor dia e horário para a sua consultoria presencial ou online. Ainda temos algumas vagas para esta semana!`;
      default: // 🌍 Cenário 4: Abordagem geral
        return `${n} Tudo bem? Passando só para saber se gostaria de avançar com o seu ${s} connosco ou esclarecer alguma dúvida. Conseguimos avançar?`;
    }
  },

  /** Step 3 — após +48h (condicionado ao cenário e contexto) */
  step3: (name: string, scenario: number = 4, ctx?: FollowupContext): string => {
    const n = name ? `Olá, ${name}!` : 'Olá!';
    const s = ctx?.service || 'processo';
    switch (scenario) {
      case 1: // 📄 Documentos
        return `${n} Não gostaria que perdesse os prazos da análise documental do seu ${s}. Caso precise de ajuda para reunir os papéis ou queira agendar um atendimento no escritório, avise-me por aqui!`;
      case 2: // 💰 Orçamento
        return `${n} Não gostaria que perdesse as condições e opções de investimento vigentes para o seu ${s}. Caso queira tirar dúvidas sobre valores ou opções flexíveis, avise-me por aqui!`;
      case 3: // 📅 Agendamento
        return `${n} Não gostaria que perdesse as vagas de atendimento desta semana para o seu ${s}. Caso queira que eu lhe sugira outros horários no escritório ou online, avise-me por aqui!`;
      default: // 🌍 Geral
        return `${n} Não gostaria que perdesse as oportunidades e prazos atuais para o seu ${s}. Caso queira conversar com um dos nossos consultores ou agendar um atendimento no escritório, avise-me por aqui!`;
    }
  },

  /** Step 4 — após +72h (condicionado ao cenário e contexto) */
  step4: (name: string, scenario: number = 4, ctx?: FollowupContext): string => {
    const n = name ? `Olá, ${name}!` : 'Olá!';
    const s = ctx?.service || 'processo';
    switch (scenario) {
      case 1: // 📄 Documentos
        return `${n} Tudo bem? Passando para deixar uma nota sobre a documentação do seu ${s}. Se ainda tiver interesse em enviar os dados ou tirar dúvidas, basta responder a esta mensagem!`;
      case 2: // 💰 Orçamento
        return `${n} Tudo bem? Passando para deixar uma nota sobre a proposta para o seu ${s}. Se ainda tiver interesse em avançar ou esclarecer condições de pagamento, basta responder a esta mensagem!`;
      case 3: // 📅 Agendamento
        return `${n} Tudo bem? Passando para deixar uma nota sobre o agendamento da sua consultoria. Se ainda desejar marcar um horário conveniente, basta responder a esta mensagem!`;
      default: // 🌍 Geral
        return `${n} Tudo bem? Passando para deixar uma nota sobre o seu ${s}. Se ainda tiver interesse em dar entrada ou tirar dúvidas, basta responder a esta mensagem quando for mais conveniente!`;
    }
  },

  /** Step 5 — encerramento cordial (condicionado ao cenário e empresa) */
  step5: (name: string, scenario: number = 4, ctx?: FollowupContext): string => {
    const n = name ? `Olá, ${name}!` : 'Olá!';
    const company = ctx?.orgName || 'nossa assessoria';
    switch (scenario) {
      case 1:
        return `${n} Vou encerrar os nossos lembretes automáticos sobre os documentos por aqui para não incomodar. Estaremos sempre à sua disposição na ${company} quando desejar dar o próximo passo. Tenha um excelente dia!`;
      case 2:
        return `${n} Vou encerrar os nossos lembretes automáticos sobre a proposta por aqui para não incomodar. Estaremos sempre à sua disposição na ${company} quando desejar avançar. Tenha um excelente dia!`;
      case 3:
        return `${n} Vou encerrar os nossos lembretes automáticos sobre o agendamento por aqui para não incomodar. Estaremos sempre à sua disposição na ${company} quando desejar agendar a sua consultoria. Tenha um excelente dia!`;
      default:
        return `${n} Vou encerrar os nossos lembretes automáticos por aqui para não incomodar. Estaremos sempre à sua disposição na ${company} quando desejar dar o próximo passo. Tenha um excelente dia!`;
    }
  }
};

// ─── Protocolo de Objeções (B2C e B2B) ───────────────────────────────────────
export interface ObjectionButton {
  id: string;
  fullTitle: string;   // Texto exibido na mensagem de texto (ex: "📝 Ver resumo da proposta")
  buttonTitle: string; // Título no botão interativo do WhatsApp (máx 20 caracteres da Meta)
}

export interface ObjectionProtocolConfig {
  textTemplate: string;
  buttons: ObjectionButton[];
}

export const OBJECTION_PROTOCOLS: Record<'b2c' | 'b2b', Record<'spouse' | 'budget_prepare' | 'tomorrow' | 'partner_director', ObjectionProtocolConfig | null>> = {
  b2c: {
    // 1. Objeção: "Vou falar com a esposa/marido" (3 dias depois)
    spouse: {
      textTemplate: "Olá, [Nome]! Aqui é o/a [Nome_do_Chatbot]. Passando para saber se conseguiu conversar com o seu par sobre o [Produto/Serviço]. Ficou alguma dúvida em que eu possa ajudar?",
      buttons: [
        { id: 'btn_resumo',      fullTitle: '📝 Ver resumo da proposta', buttonTitle: '📝 Ver resumo' },
        { id: 'btn_atendimento', fullTitle: '🗣️ Falar com atendimento', buttonTitle: '🗣️ Falar c/ atendente' },
        { id: 'btn_decidir',     fullTitle: '⏳ Ainda a decidir',        buttonTitle: '⏳ Ainda a decidir' },
      ],
    },
    // 2. Objeção: "Vou me preparar melhor" (7 dias depois, 30 dias depois, 3 meses depois)
    budget_prepare: {
      textTemplate: "Oi, [Nome]! Tudo bem? Passando para lembrar que o seu plano para [Benefício] continua guardado aqui. Quer uma ajuda para se organizar e dar o próximo passo?",
      buttons: [
        { id: 'btn_comecar',       fullTitle: '🚀 Quero começar hoje',  buttonTitle: '🚀 Começar hoje' },
        { id: 'btn_como_funciona', fullTitle: '📚 Ver como funciona',   buttonTitle: '📚 Como funciona' },
        { id: 'btn_lembrar',       fullTitle: '⏰ Lembrar mais tarde',  buttonTitle: '⏰ Lembrar depois' },
      ],
    },
    // 3. Objeção: "Amanhã eu volto" (No final do dia seguinte)
    tomorrow: {
      textTemplate: "Olá, [Nome]! Conforme o combinado ontem, passei para saber se quer continuar o seu atendimento.",
      buttons: [
        { id: 'btn_continuar', fullTitle: '▶️ Continuar o atendimento', buttonTitle: '▶️ Continuar' },
        { id: 'btn_agora_nao', fullTitle: '❌ Agora não posso',          buttonTitle: '❌ Agora não posso' },
      ],
    },
    partner_director: null,
  },
  b2b: {
    // 1. Objeção: "Vou falar com o sócio/diretoria" (24h depois)
    partner_director: {
      textTemplate: "Olá, [Nome]. Tudo bem? Passando para saber se a vossa diretoria conseguiu analisar a proposta do [Serviço]. Como preferem proceder?",
      buttons: [
        { id: 'btn_reuniao',  fullTitle: '📅 Agendar reunião rápida',   buttonTitle: '📅 Agendar reunião' },
        { id: 'btn_reenviar', fullTitle: '📥 Reenviar proposta em PDF', buttonTitle: '📥 Reenviar proposta' },
        { id: 'btn_analise',  fullTitle: '🕒 Ainda em análise interna', buttonTitle: '🕒 Em análise interna' },
      ],
    },
    // 2. Objeção: "Vou me preparar melhor / Orçamento" (7 dias depois)
    budget_prepare: {
      textTemplate: "Olá, [Nome]. Compreendo que o timing financeiro precisa de ser perfeito. Para ajudar no vosso planeamento, quando gostaria de receber um novo contacto?",
      buttons: [
        { id: 'btn_15_dias',  fullTitle: '🗓️ Daqui a 15 dias',     buttonTitle: '🗓️ Daqui a 15 dias' },
        { id: 'btn_opcoes',   fullTitle: '📊 Ver opções flexíveis', buttonTitle: '📊 Opções flexíveis' },
        { id: 'btn_encerrar', fullTitle: '📨 Encerrar por agora',   buttonTitle: '📨 Encerrar agora' },
      ],
    },
    // 3. Objeção: "Amanhã eu volto" (Manhã do dia seguinte)
    tomorrow: {
      textTemplate: "Bom dia, [Nome]. Passando para darmos seguimento à contratação do [Serviço/Produto] para a sua empresa. Avançamos?",
      buttons: [
        { id: 'btn_avancar',    fullTitle: '✅ Sim, vamos avançar', buttonTitle: '✅ Sim, avançar' },
        { id: 'btn_detalhes',   fullTitle: '🛠️ Ajustar detalhes',  buttonTitle: '🛠️ Ajustar detalhes' },
        { id: 'btn_mais_tarde', fullTitle: '⏳ Falar mais tarde',   buttonTitle: '⏳ Falar mais tarde' },
      ],
    },
    spouse: null,
  },
};

// ─── Preenchimento Neutro de Variáveis e Placeholders ─────────────────────────
export function fillPlaceholders(
  template: string,
  data: {
    clientName?: string;
    botName?: string;
    productOrService?: string;
    service?: string;
    benefit?: string;
  }
): string {
  let result = template;

  const rawName = (data.clientName || '').trim();
  const firstName = rawName ? rawName.split(/\s+/)[0] : '';

  if (firstName) {
    result = result.replace(/\[Nome\]/g, firstName);
  } else {
    // Tratar saudações com elegância se o nome não for conhecido
    result = result.replace(/(?:Olá|Oi|Bom dia),\s*\[Nome\]([!\.])/g, (_match, punc) => {
      if (_match.startsWith('Bom dia')) return `Bom dia${punc}`;
      if (_match.startsWith('Oi')) return `Oi${punc}`;
      return `Olá${punc}`;
    });
    result = result.replace(/\[Nome\]/g, '');
  }

  const botName = data.botName?.trim() || 'Assistente';
  result = result.replace(/\[Nome_do_Chatbot\]/g, botName);

  const productOrService = data.productOrService?.trim() || 'nosso serviço';
  result = result.replace(/\[Produto\/Serviço\]/g, productOrService);
  result = result.replace(/\[Serviço\/Produto\]/g, productOrService);

  const service = data.service?.trim() || productOrService;
  result = result.replace(/\[Serviço\]/g, service);

  const benefit = data.benefit?.trim() || 'o seu processo';
  result = result.replace(/\[Benefício\]/g, benefit);

  return result.replace(/\s{2,}/g, ' ').trim();
}

// ─── Formatação do Texto com Lista de Botões ──────────────────────────────────
export function formatFollowupWithButtons(bodyText: string, buttons: { fullTitle: string }[]): string {
  const buttonLines = buttons.map((b, idx) => `[Botão ${idx + 1}] ${b.fullTitle}`).join('\n');
  return `${bodyText}\n\n${buttonLines}`;
}

// ─── Deteção de Objeções ──────────────────────────────────────────────────────
export interface DetectedObjection {
  type: 'spouse' | 'partner_director' | 'budget_prepare' | 'tomorrow';
  audience: 'b2c' | 'b2b';
  matchedText: string;
}

export function detectObjectionText(text: string): { type: 'spouse' | 'partner_director' | 'budget_prepare' | 'tomorrow'; matchedText: string } | null {
  if (!text) return null;
  const clean = text.trim();

  // 1. Objeção: "Vou falar com a esposa/marido" (B2C)
  const spousePatterns = [
    /\b(?:vou|preciso|tenho\s*que|quero|vou\s*ter\s*que|iria)\s*(?:ir\s*)?(?:falar|conversar|alinhar|discutir|ver|combinar|consultar)\s*com\s*(?:a|o|minha|meu|o\s*meu|a\s*minha)?\s*(?:esposa|marido|esposo|patroa|mulher|c[oô]njuge|namorada|namorado|par|parceir[ao])\b/i,
    /\b(?:falar|conversar|ver|combinar|alinhar|consultar)\s*com\s*(?:a\s*esposa|o\s*marido|o\s*esposo|a\s*mulher|o\s*par|a\s*patroa|o\s*c[oô]njuge|minha\s*esposa|meu\s*marido)\b/i,
    /\b(?:ver|conversar)\s*com\s*(?:o\s*meu\s*par|o\s*par|a\s*esposa|o\s*marido)\b/i,
  ];
  for (const p of spousePatterns) {
    if (p.test(clean)) return { type: 'spouse', matchedText: clean };
  }

  // 2. Objeção: "Vou falar com o sócio/diretoria" (B2B)
  const directorPatterns = [
    /\b(?:vou|preciso|tenho\s*que|quero|iria)\s*(?:ir\s*)?(?:falar|conversar|alinhar|discutir|ver|apresentar|passar|reunir|consultar)\s*com\s*(?:o|a|os|as|meu|minha|nossos|nossas|o\s*nosso|a\s*nossa)?\s*(?:s[oó]cio|s[oó]cios|diretoria|dire[cç][aã]o|ger[eê]ncia|conselho|administra[cç][aã]o|equipa|equipe|empresa|board)\b/i,
    /\b(?:passar|apresentar|submeter|enviar)\s*(?:a|à|para\s*a)\s*(?:diretoria|dire[cç][aã]o|ger[eê]ncia|administra[cç][aã]o|reuni[aã]o\s*de\s*s[oó]cios)\b/i,
    /\b(?:a\s*diretoria|o\s*s[oó]cio|os\s*s[oó]cios|a\s*dire[cç][aã]o)\s*(?:precisa|vai|v[aã]o|tem\s*que)\s*(?:analisar|avaliar|aprovar|decidir)\b/i,
  ];
  for (const p of directorPatterns) {
    if (p.test(clean)) return { type: 'partner_director', matchedText: clean };
  }

  // 3. Objeção: "Amanhã eu volto" (B2C & B2B)
  const tomorrowPatterns = [
    /\b(?:amanh[aã]\s*(?:eu\s*)?volto|volto\s*amanh[aã])\b/i,
    /\b(?:amanh[aã]\s*(?:a\s*gente\s*)?(?:fala|conversa|continua|retoma|combina|vemos))\b/i,
    /\b(?:amanh[aã]\s*(?:eu\s*)?(?:chamo|mando\s*(?:mensagem)?|dou\s*um\s*retorno|entro\s*em\s*contato|entro\s*em\s*contacto|escrevo|retorno|ligo))\b/i,
    /\b(?:deixa\s*para\s*amanh[aã]|vemos\s*isso\s*amanh[aã]|falamos\s*amanh[aã])\b/i,
    /\b(?:amanh[aã]\s*(?:eu\s*)?termino|amanh[aã]\s*eu\s*concluo|amanh[aã]\s*vejo\s*isso)\b/i,
  ];
  for (const p of tomorrowPatterns) {
    if (p.test(clean)) return { type: 'tomorrow', matchedText: clean };
  }

  // 4. Objeção: "Vou me preparar melhor / Orçamento" (B2C & B2B)
  const budgetPreparePatterns = [
    /\b(?:vou|preciso|quero|vamos)\s*(?:me\s*|nos\s*)?(?:preparar|organizar|estruturar|planejar|planear)\s*melhor\b/i,
    /\b(?:ainda\s*n[aã]o\s*estou|n[aã]o\s*estamos|n[aã]o\s*estou)\s*preparad[ao]s?\b/i,
    /\b(?:organizar|estruturar|preparar)\s*(?:financeiramente|o\s*or[cç]amento|as\s*finan[cç]as|o\s*dinheiro)\b/i,
    /\b(?:juntar|guardar|conseguir|arranjar)\s*(?:o\s*)?(?:dinheiro|valor|capital|verba)\b/i,
    /\b(?:sem\s*or[cç]amento|sem\s*budget|sem\s*verba|fora\s*do\s*(?:nosso\s*)?(?:or[cç]amento|budget))\b/i,
    /\b(?:or[cç]amento\s*(?:apertado|fechado|estourado)|timing\s*financeiro)\b/i,
    /\b(?:quando\s*(?:eu\s*)?tiver\s*(?:o\s*)?dinheiro|quando\s*melhorar\s*a\s*situa[cç][aã]o\s*financeira)\b/i,
    /\b(?:por\s*enquanto\s*n[aã]o\s*tenho\s*condi[cç][oõ]es|n[aã]o\s*tenho\s*condi[cç][oõ]es\s*agora)\b/i,
    /\b(?:est[aá]\s*muito\s*apertado\s*agora|momento\s*financeiro\s*dif[ií]cil)\b/i,
  ];
  for (const p of budgetPreparePatterns) {
    if (p.test(clean)) return { type: 'budget_prepare', matchedText: clean };
  }

  return null;
}

export function detectObjection(
  history: { sender: string; text: string }[],
  orgSettings?: any
): DetectedObjection | null {
  if (!history || history.length === 0) return null;

  const userMsgs = history.filter(h => 
    h.sender === 'user' && 
    !h.text.startsWith('[ERRO INTERNO') && 
    !h.text.startsWith('[ATENDIMENTO CONFIRMADO')
  );
  if (userMsgs.length === 0) return null;

  const lastUserMsg = userMsgs[userMsgs.length - 1];
  const detected = detectObjectionText(lastUserMsg.text);
  if (!detected) return null;

  let audience: 'b2c' | 'b2b' = 'b2c';

  if (detected.type === 'spouse') {
    audience = 'b2c';
  } else if (detected.type === 'partner_director') {
    audience = 'b2b';
  } else {
    // Para 'budget_prepare' e 'tomorrow', checar indicadores B2B na conversa ou organização
    const allText = history.map(h => h.text).join(' ').toLowerCase();
    const b2bIndicators = /\b(empresa|s[oó]cio|s[oó]cios|diretoria|dire[cç][aã]o|ger[eê]ncia|nossa\s*empresa|minha\s*empresa|para\s*a\s*empresa|pj|cnpj|nif\s*coletivo|budget|corporativ[ao]|b2b|fatura[cç][aã]o|contrata[cç][aã]o\s*para\s*a\s*empresa|colaboradores)\b/i;
    
    if (b2bIndicators.test(allText) || orgSettings?.ai_tone === 'ultra_formal') {
      audience = 'b2b';
    } else {
      audience = 'b2c';
    }
  }

  return {
    type: detected.type,
    audience,
    matchedText: detected.matchedText,
  };
}

// ─── Data Agendada para Cada Objeção ─────────────────────────────────────────
export function getObjectionScheduledDate(audience: 'b2c' | 'b2b', objectionType: string, step = 1): Date {
  const now = new Date();

  if (audience === 'b2c') {
    if (objectionType === 'spouse') {
      // 3 dias depois (72h) às 14:00
      const d = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      d.setHours(14, Math.floor(Math.random() * 30), 0, 0);
      return d;
    }
    if (objectionType === 'budget_prepare') {
      // Step 1: 7 dias depois; Step 2: 30 dias; Step 3: 90 dias (3 meses)
      const days = step === 1 ? 7 : step === 2 ? 30 : 90;
      const d = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      d.setHours(14, Math.floor(Math.random() * 30), 0, 0);
      return d;
    }
    if (objectionType === 'tomorrow') {
      // No final do dia seguinte (~18:00)
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(18, 0, 0, 0);
      return d;
    }
  } else {
    // B2B
    if (objectionType === 'partner_director') {
      // 24h depois (durante expediente comercial)
      const d = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const h = d.getHours();
      if (h < 9 || h > 17) d.setHours(11, 0, 0, 0);
      return d;
    }
    if (objectionType === 'budget_prepare') {
      // 7 dias depois
      const d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      d.setHours(10, 30, 0, 0);
      return d;
    }
    if (objectionType === 'tomorrow') {
      // Amanhã de manhã ("Bom dia, [Nome]..." ~ 09:30)
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(9, 30, 0, 0);
      return d;
    }
  }

  // Fallback seguro: 24h
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}

// ─── Deteção de Despedida e Encerramento ──────────────────────────────────────
export function isFarewellText(text: string): boolean {
  if (!text) return false;
  const clean = text.trim().toLowerCase();

  // Mensagens longas (> 160 chars) raramente são apenas despedidas
  if (clean.length > 160) return false;

  // Se o cliente fez uma pergunta, NÃO é despedida
  if (clean.includes('?') || /\b(quanto|quando|como|onde|qual|quais|porque|por que|mas|porem|porém)\b/i.test(clean)) {
    return false;
  }

  // Se for uma objeção conhecida (esposa, sócio, preparar melhor, amanhã volto), NÃO é despedida
  if (detectObjectionText(clean)) {
    return false;
  }

  // Apenas emojis de encerramento / joinha / agradecimento
  if (/^[👍👋🙏🤝✨👌👏🌹❤️]+$/u.test(clean)) {
    return true;
  }

  const farewellPatterns = [
    /\b(tchau|tchauzinho|xau|xauzinho|chau|chauzinho|adeus)\b/i,
    /\b(at[eé]\s*(logo|mais|breve|[aà]\s*pr[oó]xima|j[aá]|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo))\b/i,
    /\b(obrigad[ao]|obg|obgd|obgda|muito\s*obrigad[ao]|agradecid[ao]|grato|grata)\b/i,
    /\b(bom\s*descanso|bom\s*fim\s*de\s*semana|bom\s*final\s*de\s*semana|boa\s*semana|bom\s*trabalho)\b/i,
    /\b(continua[cç][aã]o\s*de\s*(um\s*)?(bom|boa))\b/i,
    /\b(um\s*abra[cç]o|abra[cç]os?|forte\s*abra[cç]o|beijo|beijos?|beijinhos?|bjs)\b/i,
    /\b(valeu|vlw|falou|flw)\b/i,
    /\b(foi\s*um\s*prazer|igualmente|foi\s*[oó]timo|foi\s*bom\s*falar)\b/i,
    /\b(n[aã]o\s*(preciso|quero|tenho\s*interesse)|deixa\s*(pra|para)\s*l[aá]|pode\s*(cancelar|fechar)|encerrar?|dispensad[ao]|n[aã]o\s*quero\s*mais)\b/i,
    /^(perfeito|combinado|entendido|tudo\s*certo|est[aá]\s*bem|t[aá]\s*bom|ok)\s*(,?|\.|\!)?\s*(obrigad[ao]|obg|agradecid[ao]|valeu|abra[cç]o)?$/i,
  ];

  for (const pattern of farewellPatterns) {
    if (pattern.test(clean)) return true;
  }

  if (/\b(boa\s*noite)\b/i.test(clean) && !/\b(tudo\s*bem|ol[aá]|oi|como\s*vai)\b/i.test(clean)) {
    return true;
  }
  if (/\b(boa\s*tarde)\b/i.test(clean) && /\b(obrigad[ao]|obg|at[eé]|abra[cç]o|valeu)\b/i.test(clean)) {
    return true;
  }

  return false;
}

/**
 * Detecta se a conversa terminou em despedida,
 * MESMO QUE a última mensagem na base de dados seja da IA (resposta cordial à despedida do cliente).
 */
export function isConversationEndedInFarewell(
  history: { sender: string; text: string }[],
  _currentBotReply?: string
): boolean {
  if (!history || history.length === 0) return false;

  const validMsgs = history.filter(h => 
    !h.text.startsWith('[ERRO INTERNO') && 
    !h.text.startsWith('[ATENDIMENTO CONFIRMADO')
  );
  if (validMsgs.length === 0) return false;

  const userMsgs = validMsgs.filter(m => m.sender === 'user');
  if (userMsgs.length === 0) return false;

  const lastUserMsg = userMsgs[userMsgs.length - 1];
  const lastUserText = (lastUserMsg.text || '').trim();

  // Se a última mensagem do cliente foi uma despedida
  if (isFarewellText(lastUserText)) {
    return true;
  }

  // Verificar se o bot encerrou formalmente os lembretes ou o atendimento
  const lastMsg = validMsgs[validMsgs.length - 1];
  if (lastMsg.sender === 'bot') {
    const lastBotText = (lastMsg.text || '').toLowerCase();
    if (
      lastBotText.includes('vou encerrar os nossos lembretes') || 
      lastBotText.includes('atendimento encerrado') || 
      lastBotText.includes('estaremos sempre à sua disposição na on visa quando desejar')
    ) {
      return true;
    }
  }

  return false;
}

// Mantido para compatibilidade retroativa
export function detectFarewell(history: { sender: string; text: string }[]): boolean {
  return isConversationEndedInFarewell(history);
}

// ─── Detetar cenário da conversa ─────────────────────────────────────────────
export function detectScenario(history: { sender: string; text: string }[]): number {
  const allText = history.map(h => h.text).join(' ').toLowerCase();

  if (/(foto|imagem|documento|passaporte|curriculo|currículo|registo criminal|registro criminal|dados|informações|informacoes|detalhes|perfil)/i.test(allText)) {
    return 1;
  }
  if (/(orçamento|orcamento|valor|preço|preco|custo|proposta|kz|kwanza|eur|usd|pós-paga|pos-paga|pagamento|investimento)/i.test(allText)) {
    return 2;
  }
  if (/(agendar|marcar|marcação|marcacao|consultoria|agendamento|horário|horario|disponibilidade|escritório|escritorio)/i.test(allText)) {
    return 3;
  }
  return 4;
}

// ─── Inferir Produto, Serviço e Benefício do Histórico e Organização ─────────
export function inferServiceAndBenefit(
  history: { sender: string; text: string }[],
  org?: any
): { service: string; product: string; benefit: string } {
  const allText = history.map(h => h.text).join(' ').toLowerCase();

  let service = 'processo de visto';
  let product = 'processo de visto';
  let benefit = 'o seu visto';

  if (/(visto|passaporte|nacionalidade|cidadania|consulado|embaixada|turismo|estudo)/i.test(allText)) {
    service = 'processo de visto';
    product = 'processo de visto';
    benefit = 'o seu visto';
  } else if (/(consultoria|assessoria|consulta)/i.test(allText)) {
    service = 'assessoria especializada';
    product = 'serviço de assessoria';
    benefit = 'a sua assessoria';
  } else if (/(curso|forma[cç][aã]o|treinamento|capacita[cç][aã]o)/i.test(allText)) {
    service = 'formação';
    product = 'curso';
    benefit = 'a sua qualificação';
  } else if (/(im[oó]vel|apartamento|casa|terreno)/i.test(allText)) {
    service = 'imóvel';
    product = 'imóvel';
    benefit = 'a sua conquista';
  } else if (org?.social_object || org?.product_description) {
    const desc = (org.social_object || org.product_description || '').toLowerCase();
    if (desc.includes('visto')) {
      service = 'processo de visto';
      product = 'processo de visto';
      benefit = 'o seu visto';
    } else if (desc.includes('consult')) {
      service = 'consultoria';
      product = 'serviço de consultoria';
      benefit = 'a sua consultoria';
    } else {
      service = org.social_object || 'serviço';
      product = org.product_description?.substring(0, 30) || 'nosso serviço';
    }
  }

  return { service, product, benefit };
}

// ─── Calcular hora aleatória de envio (09:00–20:00, mínimo N horas no futuro) ─
export function randomScheduledTime(minHoursFromNow: number): Date {
  const base = new Date(Date.now() + minHoursFromNow * 60 * 60 * 1000);

  const randomHour   = 9 + Math.floor(Math.random() * 11); // 09 a 19
  const randomMinute = Math.floor(Math.random() * 60);

  base.setHours(randomHour, randomMinute, 0, 0);

  if (base.getTime() < Date.now() + 30 * 60 * 1000) {
    base.setDate(base.getDate() + 1);
    base.setHours(randomHour, randomMinute, 0, 0);
  }

  return base;
}

// ─── Serviço principal ────────────────────────────────────────────────────────
export class FollowupService {

  /** Agenda um novo follow-up (uso geral pela API) */
  static async schedule(params: {
    orgId:          string;
    phone:          string;
    platform:       'whatsapp' | 'facebook' | 'instagram';
    delay:          string;          // ex.: "2h", "3d", "1w", "2m"
    customPrompt?:  string;
    lastMessageId?: string;
    followupStep?:  number;
    contextSnapshot?: string;
    customerName?:  string;
  }) {
    const scheduledAt = parseDelay(params.delay);

    const payload: Record<string, any> = {
      org_id:          params.orgId,
      customer_phone:  params.phone,
      platform:        params.platform,
      scheduled_at:    scheduledAt.toISOString(),
      status:          'pending',
      followup_step:   params.followupStep ?? 1,
    };

    if (params.customPrompt)     payload.custom_prompt     = params.customPrompt;
    if (params.lastMessageId)    payload.last_message_id   = params.lastMessageId;
    if (params.contextSnapshot)  payload.context_snapshot  = params.contextSnapshot;
    if (params.customerName)     payload.customer_name     = params.customerName;

    const { error } = await supabaseAdmin
      .from('followup_schedules')
      .insert(payload);

    if (error) throw error;
    console.log(`[FOLLOWUP] Agendado step ${params.followupStep ?? 1} para ${params.phone} em ${scheduledAt.toISOString()} (${params.delay})`);
  }

  /**
   * Ativa o protocolo de follow-up (inteligente ou de objeções).
   * Regras estritas:
   * 1. NÃO envia/agenda se o cliente tiver algum agendamento marcado.
   * 2. NÃO envia/agenda se a conversa tiver terminada em despedida, mesmo que a última mensagem seja da IA.
   * 3. Se a conversa terminou com objeção, agenda o protocolo específico de objeção (B2C/B2B com botões).
   */
  static async scheduleSmartFollowup(params: {
    orgId:         string;
    phone:         string;
    platform:      'whatsapp' | 'facebook' | 'instagram';
    customerName?: string;
    botReply:      string;
    lastMessageId?: string;
  }) {
    try {
      // 1. Cancelar eventuais follow-ups anteriores pendentes
      await this.cancelPendingForPhone(params.orgId, params.phone);

      // 2. REGRA 1: Verificar se o cliente tem agendamento marcado ativo ou futuro
      const hasBooking = await this.hasActiveBooking(params.orgId, params.phone);
      if (hasBooking) {
        console.log(`[FOLLOWUP] ℹ️ Cliente ${params.phone} já possui agendamento marcado/ativo. Follow-up cancelado/ignorado.`);
        return;
      }

      // 3. Buscar histórico para snapshot de contexto e verificação
      const history = await this.fetchContext(params.orgId, params.phone);

      // Resolver nome do cliente se não tiver sido fornecido
      let clientName = (params.customerName || '').trim();
      if (!clientName) {
        const { data: contact } = await supabaseAdmin
          .from('contacts')
          .select('name')
          .eq('org_id', params.orgId)
          .eq('phone', params.phone)
          .maybeSingle();
        if (contact?.name) clientName = contact.name.trim().split(/\s+/)[0];
      }

      // 4. REGRA 2: Não enviar se a conversa terminou em despedida, mesmo que a última mensagem seja da IA
      if (isConversationEndedInFarewell(history, params.botReply)) {
        console.log(`[FOLLOWUP] ℹ️ Conversa com ${params.phone} terminada em despedida. Follow-up não agendado.`);
        await this.concludeConversation({
          orgId: params.orgId,
          phone: params.phone,
          platform: params.platform,
          customerName: clientName,
          reason: 'farewell_detected',
        });
        return;
      }

      // 5. Buscar dados da organização para nomes e tom de voz
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('name, chatbot_name, product_description, social_object, ai_tone')
        .eq('id', params.orgId)
        .maybeSingle();

      // 6. PROTOCOLO DE OBJEÇÕES: Verificar se o cliente terminou a conversa com uma objeção
      const objection = detectObjection(history, org);

      if (objection) {
        console.log(`[FOLLOWUP] 🎯 Objeção detectada para ${params.phone}: ${objection.type} (${objection.audience.toUpperCase()})`);

        const scheduledAt = getObjectionScheduledDate(objection.audience, objection.type, 1);
        const { service, product, benefit } = inferServiceAndBenefit(history, org);

        const contextSnapshot = JSON.stringify({
          flow:          'objection',
          audience:      objection.audience,
          objectionType: objection.type,
          step:          1,
          botName:       org?.chatbot_name || 'Assistente',
          customerName:  clientName || '',
          service,
          product,
          benefit,
          lastBotReply:  params.botReply.substring(0, 500),
        });

        const payload: Record<string, any> = {
          org_id:           params.orgId,
          customer_phone:   params.phone,
          platform:         params.platform,
          scheduled_at:     scheduledAt.toISOString(),
          status:           'pending',
          followup_step:    1,
          context_snapshot: contextSnapshot,
        };
        if (clientName)            payload.customer_name   = clientName;
        if (params.lastMessageId) payload.last_message_id = params.lastMessageId;

        const { error } = await supabaseAdmin
          .from('followup_schedules')
          .insert(payload);

        if (error) throw error;

        console.log(`[FOLLOWUP] ✅ Follow-up de objeção (${objection.audience}/${objection.type}) agendado para ${params.phone} em ${scheduledAt.toISOString()}`);
        return;
      }

      // 7. Fluxo Normal de Vendas: se não houve objeção nem despedida, agenda Step 1 padrão (~12h)
      const scenario = detectScenario(history);
      const scheduledAt = randomScheduledTime(12);

      const contextSnapshot = JSON.stringify({
        flow: 'standard',
        scenario,
        lastBotReply: params.botReply.substring(0, 500),
      });

      const payload: Record<string, any> = {
        org_id:           params.orgId,
        customer_phone:   params.phone,
        platform:         params.platform,
        scheduled_at:     scheduledAt.toISOString(),
        status:           'pending',
        followup_step:    1,
        context_snapshot: contextSnapshot,
      };
      if (clientName)            payload.customer_name   = clientName;
      if (params.lastMessageId) payload.last_message_id = params.lastMessageId;

      const { error } = await supabaseAdmin
        .from('followup_schedules')
        .insert(payload);

      if (error) throw error;

      console.log(`[FOLLOWUP] ✅ Follow-up inteligente padrão (step 1) agendado para ${params.phone} em ${scheduledAt.toISOString()} (cenário ${scenario})`);
    } catch (err: any) {
      console.warn(`[FOLLOWUP] Aviso ao agendar smart follow-up para ${params.phone}:`, err.message);
    }
  }

  /** Cancela todos os follow-ups pendentes de um número (cliente voltou a responder) */
  static async cancelPendingForPhone(orgId: string, phone: string) {
    const { error } = await supabaseAdmin
      .from('followup_schedules')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('org_id', orgId)
      .eq('customer_phone', phone)
      .eq('status', 'pending');

    if (error) {
      console.warn(`[FOLLOWUP] Aviso ao cancelar follow-ups de ${phone}:`, error.message);
    } else {
      console.log(`[FOLLOWUP] ✅ Follow-ups pendentes cancelados para ${phone} (cliente respondeu)`);
    }
  }

  /** Devolve todos os agendamentos pendentes cujo horário já passou */
  static async getDue() {
    const { data, error } = await supabaseAdmin
      .from('followup_schedules')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString());

    if (error) throw error;
    return data ?? [];
  }

  /** Lista todos os agendamentos de uma organização (para a UI) */
  static async listByOrg(orgId: string, status?: string) {
    let query = supabaseAdmin
      .from('followup_schedules')
      .select('*')
      .eq('org_id', orgId)
      .order('scheduled_at', { ascending: true });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  /** Muda o status de um registo */
  static async setStatus(id: string, status: 'sent' | 'cancelled') {
    const { error } = await supabaseAdmin
      .from('followup_schedules')
      .update({
        status,
        ...(status === 'cancelled' ? { cancelled_at: new Date().toISOString() } : {})
      })
      .eq('id', id);
    if (error) throw error;
  }

  /** Devolve o histórico de conversa (últimas 40 msgs) para contexto */
  static async fetchContext(orgId: string, phone: string) {
    const { data, error } = await supabaseAdmin
      .from('conversation_history')
      .select('sender, text, metadata')
      .eq('org_id', orgId)
      .eq('customer_phone', phone)
      .order('created_at', { ascending: true })
      .limit(40);

    if (error) throw error;
    return (data ?? []).map(m => ({ sender: m.sender as 'user' | 'bot', text: m.text }));
  }

  /** Verifica com precisão se o cliente tem agendamento ativo (hoje ou futuro, não cancelado) */
  static async hasActiveBooking(orgId: string, phone: string): Promise<boolean> {
    try {
      const todayIso = new Date().toISOString().split('T')[0];
      const rawDigits = (phone || '').replace(/\D/g, '');
      const last8 = rawDigits.slice(-8);

      // 1. Tabela bookings (a coluna correta é appointment_date)
      const { data: bookings, error: bErr } = await supabaseAdmin
        .from('bookings')
        .select('id, phone, appointment_date, status')
        .eq('org_id', orgId)
        .gte('appointment_date', todayIso);

      if (!bErr && bookings && bookings.length > 0) {
        const hasMatch = bookings.some(b => {
          if (b.status === 'cancelled') return false;
          const bDigits = (b.phone || '').replace(/\D/g, '');
          if (!bDigits) return false;
          if (b.phone === phone || bDigits === rawDigits) return true;
          if (last8.length >= 8 && bDigits.endsWith(last8)) return true;
          if (bDigits.length >= 8 && rawDigits.endsWith(bDigits.slice(-8))) return true;
          return false;
        });
        if (hasMatch) return true;
      }

      // 2. Tabela appointment_reminders
      const { data: reminders, error: rErr } = await supabaseAdmin
        .from('appointment_reminders')
        .select('id, customer_phone, appointment_date, status')
        .eq('org_id', orgId)
        .gte('appointment_date', todayIso)
        .neq('status', 'cancelled');

      if (!rErr && reminders && reminders.length > 0) {
        const hasMatch = reminders.some(r => {
          const rDigits = (r.customer_phone || '').replace(/\D/g, '');
          if (!rDigits) return false;
          if (r.customer_phone === phone || rDigits === rawDigits) return true;
          if (last8.length >= 8 && rDigits.endsWith(last8)) return true;
          return false;
        });
        if (hasMatch) return true;
      }

      return false;
    } catch (err: any) {
      console.warn('[FOLLOWUP] Erro ao verificar agendamentos ativos:', err.message);
      return false;
    }
  }

  /** Verifica se a conversa com o cliente terminou em despedida (mesmo que a última msg seja da IA) */
  static async clientSaidFarewell(orgId: string, phone: string): Promise<boolean> {
    const history = await this.fetchContext(orgId, phone);
    return isConversationEndedInFarewell(history);
  }

  /** Verifica se o cliente respondeu após a data de agendamento */
  static async clientRepliedAfter(orgId: string, phone: string, since: string): Promise<boolean> {
    const { data } = await supabaseAdmin
      .from('conversation_history')
      .select('id')
      .eq('org_id', orgId)
      .eq('customer_phone', phone)
      .eq('sender', 'user')
      .gt('created_at', since)
      .limit(1);

    return (data?.length ?? 0) > 0;
  }

  /**
   * Dá o atendimento e ciclo de follow-up por concluído.
   * - Insere marco no conversation_history
   * - Emite Socket.IO para atualizar o painel Live Chat em tempo real
   * - Cancela eventuais follow-ups pendentes para o cliente
   * - Sincroniza com Google Sheets com status 'Concluído'
   */
  static async concludeConversation(params: {
    orgId:         string;
    phone:         string;
    platform?:     string;
    customerName?: string;
    reason?:       string;
  }): Promise<void> {
    try {
      const { orgId, phone, platform = 'whatsapp', customerName = '', reason = 'followup_concluded' } = params;

      // 1. Cancelar todos os follow-ups pendentes deste cliente
      await this.cancelPendingForPhone(orgId, phone);

      // 2. Inserir registo no histórico de conversa
      const noteText = reason.includes('objection')
        ? '[ATENDIMENTO CONCLUÍDO — CICLO DE OBJEÇÃO FINALIZADO]'
        : reason.includes('farewell')
        ? '[ATENDIMENTO CONCLUÍDO — CONVERSA TERMINADA COM DESPEDIDA]'
        : reason.includes('review')
        ? '[ATENDIMENTO CONCLUÍDO — AVALIAÇÃO FINALIZADA]'
        : '[ATENDIMENTO CONCLUÍDO — CICLO DE FOLLOW-UP FINALIZADO]';

      await supabaseAdmin.from('conversation_history').insert({
        org_id:         orgId,
        customer_phone: phone,
        sender:         'system',
        text:           noteText,
        metadata: {
          attended:      true,
          concluded:     true,
          internal_note: true,
          reason,
          platform,
        },
      });

      // 3. Emitir evento Socket.IO em tempo real para Live Chat
      try {
        const { getIo } = await import('../socket');
        getIo().to(`org:${orgId}`).emit('chat_status_updated', {
          phone,
          attended:        true,
          concluded:       true,
          needs_confirm:   false,
          has_exclamation: false,
        });

        getIo().to(`org:${orgId}`).emit('new_message', {
          phone,
          sender:    'system',
          text:      noteText,
          time:      new Date().toLocaleTimeString('pt-PT', { timeZone: 'Africa/Luanda', hour: '2-digit', minute: '2-digit' }),
          timestamp: new Date().toISOString(),
          platform,
          metadata: {
            attended:      true,
            concluded:     true,
            internal_note: true,
            reason,
          },
        });
      } catch (_) {
        // Silencioso se o socket não estiver ativo
      }

      // 4. Sincronizar com Google Sheets se configurado
      try {
        const { GoogleSheetsService } = await import('./google_sheets.service');
        GoogleSheetsService.syncInteraction({
          orgId,
          channel: (platform as any) || 'whatsapp',
          phoneOrId: phone,
          name: customerName || 'Cliente',
          text: noteText,
          status: 'Concluído',
        }).catch(err => console.warn('[FOLLOWUP] Aviso ao sincronizar conclusão com Google Sheets:', err.message));
      } catch (_) {}

      console.log(`[FOLLOWUP] 🏁 Atendimento dado por CONCLUÍDO para ${phone} (motivo: ${reason})`);
    } catch (err: any) {
      console.warn(`[FOLLOWUP] Erro ao concluir conversa para ${params.phone}:`, err.message);
    }
  }
}
