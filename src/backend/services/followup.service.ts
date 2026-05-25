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

// ─── Serviço principal ────────────────────────────────────────────────────────
export class FollowupService {

  /** Agenda um novo follow-up */
  static async schedule(params: {
    orgId:         string;
    phone:         string;
    platform:      'whatsapp' | 'facebook';
    delay:         string;          // ex.: "2h", "3d", "1w", "2m"
    customPrompt?: string;
    lastMessageId?: string;
  }) {
    const scheduledAt = parseDelay(params.delay);

    const payload: Record<string, any> = {
      org_id:         params.orgId,
      customer_phone: params.phone,
      platform:       params.platform,
      scheduled_at:   scheduledAt.toISOString(),
      status:         'pending',
    };

    if (params.customPrompt)    payload.custom_prompt    = params.customPrompt;
    if (params.lastMessageId)   payload.last_message_id  = params.lastMessageId;

    const { error } = await supabaseAdmin
      .from('followup_schedules')
      .insert(payload);

    if (error) throw error;
    console.log(`[FOLLOWUP] Agendado para ${params.phone} em ${scheduledAt.toISOString()} (${params.delay})`);
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
      .update({ status })
      .eq('id', id);
    if (error) throw error;
  }

  /** Devolve o histórico de conversa (últimas 30 msgs) para contexto da IA */
  static async fetchContext(orgId: string, phone: string) {
    const { data, error } = await supabaseAdmin
      .from('conversation_history')
      .select('sender, text, metadata')
      .eq('org_id', orgId)
      .eq('customer_phone', phone)
      .order('created_at', { ascending: true })
      .limit(30);

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
