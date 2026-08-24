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

// ─── Mensagens fixas do protocolo de follow-up ─────────────────────────────────
export const FOLLOWUP_MESSAGES = {
  /** Step 1 — após 12h sem resposta */
  step1: (name: string) => {
    const greeting = name ? `Olá, ${name}!` : 'Olá!';
    return `${greeting} Sei que a rotina é corrida, por isso passo só para saber se conseguiu ver a minha última mensagem ou se prefere que conversamos noutro momento. Abraço!`;
  },

  /** Step 2 — após +24h, contextualizado por cenário */
  step2: (name: string, scenario: number): string => {
    const n = name ? `Olá, ${name}!` : 'Olá!';
    switch (scenario) {
      case 1: // 🛋️ Cenário 1: Aguardava fotos ou informações do sofá
        return `${n} Passando para saber se conseguiu tirar aquelas fotos do sofá ou verificar o tamanho dele para eu conseguir fechar o seu orçamento. Fico à espera!`;
      case 2: // 💰 Cenário 2: Enviou o orçamento e o cliente sumiu
        return `${n} Tudo bem? Só queria confirmar se conseguiu analisar o orçamento para a lavagem do seu sofá. Ficou com alguma dúvida sobre o valor ou sobre o nosso processo de limpeza?`;
      case 3: // 📅 Cenário 3: Faltava apenas agendar o dia/hora
        return `${n} Como a sua rotina deve estar corrida, passo para saber se conseguiu ver qual o melhor dia e horário para fazermos a lavagem do seu sofá. Ainda tenho algumas vagas para esta semana!`;
      default: // 🧼 Cenário 4: Abordagem ultra-rápida
        return `${n} Tudo bem? Passando só para alinhar o nosso contacto sobre a limpeza do seu sofá. Conseguimos avançar?`;
    }
  }
};

// ─── Detetar cenário da conversa ─────────────────────────────────────────────
export function detectScenario(history: { sender: string; text: string }[]): number {
  const allText = history.map(h => h.text).join(' ').toLowerCase();

  // Cenário 1 — aguardava fotos / informações / medidas / detalhes
  if (/foto|imagem|medida|tamanho|dimensão|dimensao|documento|verificar info|enviar info|conseguiu tirar|conseguiu verificar/.test(allText)) {
    return 1;
  }
  // Cenário 2 — orçamento enviado / valor / preço
  if (/orçamento|orcamento|valor|preço|preco|custo|proposta|€|kz|usd|mzn|cotação|cotacao/.test(allText)) {
    return 2;
  }
  // Cenário 3 — faltava agendar
  if (/agendar|marcar|marcação|agendamento|data|dia|horário|horario|disponibilidade|reservar/.test(allText)) {
    return 3;
  }
  return 4;
}

// ─── Calcular hora aleatória de envio (09:00–20:00, mínimo 12h no futuro) ────
export function randomScheduledTime(minHoursFromNow: number): Date {
  const base = new Date(Date.now() + minHoursFromNow * 60 * 60 * 1000);

  const randomHour   = 9 + Math.floor(Math.random() * 11); // 09 a 19
  const randomMinute = Math.floor(Math.random() * 60);

  base.setHours(randomHour, randomMinute, 0, 0);

  // Se a hora calculada ficou no passado (ex: delay pequeno e já são 22h), avançar para o dia seguinte
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
   * Ativa o protocolo automático de follow-up quando a IA terminou com uma pergunta.
   * Cancela follow-ups pendentes anteriores e cria step 1 para hora aleatória ~12h.
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
      // Cancelar eventuais follow-ups anteriores pendentes
      await this.cancelPendingForPhone(params.orgId, params.phone);

      // Buscar histórico para snapshot de contexto e detetar cenário
      const history = await this.fetchContext(params.orgId, params.phone);
      const scenario = detectScenario(history);
      const contextSnapshot = JSON.stringify({
        scenario,
        lastBotReply: params.botReply.substring(0, 500)
      });

      // Hora aleatória ~12h no futuro (09:00–20:00)
      const scheduledAt = randomScheduledTime(12);

      const payload: Record<string, any> = {
        org_id:           params.orgId,
        customer_phone:   params.phone,
        platform:         params.platform,
        scheduled_at:     scheduledAt.toISOString(),
        status:           'pending',
        followup_step:    1,
        context_snapshot: contextSnapshot,
      };
      if (params.customerName)  payload.customer_name   = params.customerName;
      if (params.lastMessageId) payload.last_message_id = params.lastMessageId;

      const { error } = await supabaseAdmin
        .from('followup_schedules')
        .insert(payload);

      if (error) throw error;

      console.log(`[FOLLOWUP] ✅ Follow-up inteligente (step 1) agendado para ${params.phone} em ${scheduledAt.toISOString()} (cenário ${scenario})`);
    } catch (err: any) {
      console.warn(`[FOLLOWUP] Aviso ao agendar follow-up inteligente para ${params.phone}:`, err.message);
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
}
