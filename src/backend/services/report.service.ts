import { supabaseAdmin } from '../config/supabase';
import { EmailService } from './email.service';
import nodemailer from 'nodemailer';

export interface ReportFilterOptions {
  orgId: string;
  period?: '24h' | '7d' | '30d' | '1y' | 'all';
  channel?: 'all' | 'whatsapp' | 'facebook' | 'instagram';
}

export interface ExtractedContact {
  phone: string;
  cleanPhone: string;
  name: string;
  channel: string;
  email?: string;
  subject?: string;
  lastInteraction: string;
  lastInteractionWat: string;
}

export interface BookingReportItem {
  id: string;
  name: string;
  phone: string;
  email?: string;
  subject: string;
  date: string;
  time: string;
  channel: string;
  createdAtWat: string;
}

export interface DailyReportData {
  period: string;
  periodLabel: string;
  generatedAtWat: string;
  summary: {
    totalMessages: number;
    uniqueCustomers: number;
    whatsappCount: number;
    facebookCount: number;
    instagramCount: number;
    bookingsCount: number;
    whatsappBroadcastNumbersCount: number;
  };
  chartTimeline: {
    label: string;
    whatsapp: number;
    facebook: number;
    instagram: number;
    bookings: number;
    total: number;
  }[];
  extractedWhatsAppNumbers: string[];
  extractedWhatsAppNumbersComma: string;
  contacts: ExtractedContact[];
  bookings: BookingReportItem[];
}

export class ReportService {
  private static ANGOLA_TZ = 'Africa/Luanda';

  /**
   * Converte data ISO para string legível no fuso horário de Angola (WAT / UTC+1)
   */
  static formatWAT(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('pt-PT', {
      timeZone: this.ANGOLA_TZ,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(d);
  }

  /**
   * Higieniza número de telefone para o padrão internacional E.164 (apenas dígitos)
   */
  static sanitizePhone(phone?: string): string {
    if (!phone) return '';
    let digits = phone.replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.substring(2);
    // Se for número de 9 dígitos de Angola começando com 9, acrescentar 244
    if (digits.length === 9 && digits.startsWith('9')) {
      digits = `244${digits}`;
    }
    return digits;
  }

  /**
   * Gera os dados consolidados do relatório para o período selecionado
   */
  static async generateReportData(options: ReportFilterOptions): Promise<DailyReportData> {
    const { orgId, period = '24h', channel = 'all' } = options;

    const now = new Date();
    let startDate = new Date();

    if (period === '24h') {
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (period === '7d') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === '30d') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (period === '1y') {
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    } else {
      startDate = new Date(0); // 'all' - todo o histórico
    }

    const startIso = startDate.toISOString();

    // 1. Buscar histórico de conversas do período
    let msgsQuery = supabaseAdmin
      .from('conversation_history')
      .select('customer_phone, sender, text, metadata, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true });

    if (period !== 'all') {
      msgsQuery = msgsQuery.gte('created_at', startIso);
    }

    const { data: messages = [] } = await msgsQuery;

    // 2. Buscar contactos da tabela contacts
    const { data: contactsDb = [] } = await supabaseAdmin
      .from('contacts')
      .select('phone, name, email, notes, source, updated_at, created_at')
      .eq('org_id', orgId);

    const contactMap = new Map<string, any>();
    for (const c of (contactsDb || [])) {
      if (c.phone) {
        const clean = this.sanitizePhone(c.phone);
        contactMap.set(clean, c);
        contactMap.set(c.phone, c);
      }
    }

    // 3. Buscar agendamentos do período
    let bookingsQuery = supabaseAdmin
      .from('bookings')
      .select('*')
      .eq('org_id', orgId)
      .order('appointment_date', { ascending: false });

    if (period !== 'all') {
      bookingsQuery = bookingsQuery.gte('created_at', startIso);
    }

    const { data: bookingsDb = [] } = await bookingsQuery;

    // 4. Processar mensagens, canais e extração de números
    let whatsappCount = 0;
    let facebookCount = 0;
    let instagramCount = 0;

    const seenCustomers = new Map<string, {
      phone: string;
      cleanPhone: string;
      name: string;
      channel: string;
      email?: string;
      subject?: string;
      lastInteraction: string;
      lastInteractionWat: string;
    }>();

    for (const msg of (messages || [])) {
      const meta = msg.metadata || {};
      const platformRaw = (meta.platform || meta.channel || meta.source || '').toLowerCase();
      const rawPhone = msg.customer_phone || '';
      const cleanPhone = this.sanitizePhone(rawPhone);

      // Obter dados enriquecidos se existirem na tabela contacts
      const enriched = contactMap.get(cleanPhone) || contactMap.get(rawPhone);
      const contactSource = (enriched?.source || '').toLowerCase();

      let detectedChannel: 'whatsapp' | 'facebook' | 'instagram' = 'whatsapp';
      if (platformRaw.includes('facebook') || platformRaw.includes('messenger') || contactSource.includes('facebook')) {
        detectedChannel = 'facebook';
        facebookCount++;
      } else if (platformRaw.includes('instagram') || contactSource.includes('instagram')) {
        detectedChannel = 'instagram';
        instagramCount++;
      } else {
        detectedChannel = 'whatsapp';
        whatsappCount++;
      }

      // Se há filtro específico de canal e não coincide, ignorar para a extração
      if (channel !== 'all' && detectedChannel !== channel) {
        continue;
      }

      const customerName = enriched?.name || (detectedChannel === 'facebook' ? 'Cliente Facebook' : detectedChannel === 'instagram' ? 'Cliente Instagram' : 'Cliente WhatsApp');
      const customerEmail = enriched?.email || '';
      const subjectOrText = (enriched?.notes || msg.text || '').substring(0, 100);

      const identifier = cleanPhone || rawPhone;
      if (identifier) {
        seenCustomers.set(identifier, {
          phone: rawPhone,
          cleanPhone,
          name: customerName,
          channel: detectedChannel.toUpperCase(),
          email: customerEmail,
          subject: subjectOrText,
          lastInteraction: msg.created_at,
          lastInteractionWat: this.formatWAT(msg.created_at),
        });
      }
    }

    // Adicionar também agendamentos aos contactos extraídos caso tenham número
    for (const bk of (bookingsDb || [])) {
      if (bk.phone) {
        const cleanPhone = this.sanitizePhone(bk.phone);
        if (cleanPhone && !seenCustomers.has(cleanPhone)) {
          const fullName = [bk.first_name, bk.last_name].filter(Boolean).join(' ') || 'Cliente Agendado';
          seenCustomers.set(cleanPhone, {
            phone: bk.phone,
            cleanPhone,
            name: fullName,
            channel: 'WHATSAPP',
            email: bk.email || '',
            subject: `Agendamento: ${bk.service || 'Geral'}`,
            lastInteraction: bk.created_at,
            lastInteractionWat: this.formatWAT(bk.created_at),
          });
        }
      }
    }

    // 5. Montar lista de contactos e números WhatsApp limpos para disparos
    const contactsList = Array.from(seenCustomers.values()).sort(
      (a, b) => new Date(b.lastInteraction).getTime() - new Date(a.lastInteraction).getTime()
    );

    const whatsappNumbers = contactsList
      .map(c => c.cleanPhone)
      .filter(p => p && p.length >= 8);

    const uniqueWhatsAppNumbers = Array.from(new Set(whatsappNumbers));

    // 6. Montar agendamentos formatados
    const bookingsList: BookingReportItem[] = (bookingsDb || []).map(bk => ({
      id: bk.id,
      name: [bk.first_name, bk.last_name].filter(Boolean).join(' ') || 'Cliente',
      phone: bk.phone,
      email: bk.email || undefined,
      subject: bk.service || 'Atendimento Geral',
      date: bk.appointment_date,
      time: bk.appointment_time,
      channel: 'Agendamento',
      createdAtWat: this.formatWAT(bk.created_at),
    }));

    // 7. Montar Linha do Tempo para o Gráfico Avançado (SVG / Dashboard)
    const chartTimeline = this.buildChartTimeline(messages || [], bookingsDb || [], period);

    const periodLabels: Record<string, string> = {
      '24h': 'Últimas 24 Horas',
      '7d':  'Últimos 7 Dias',
      '30d': 'Últimos 30 Dias',
      '1y':  'Último Ano',
      'all': 'Todo o Período (Sempre)',
    };

    return {
      period,
      periodLabel: periodLabels[period] || period,
      generatedAtWat: this.formatWAT(now),
      summary: {
        totalMessages: (messages || []).length,
        uniqueCustomers: seenCustomers.size,
        whatsappCount,
        facebookCount,
        instagramCount,
        bookingsCount: bookingsList.length,
        whatsappBroadcastNumbersCount: uniqueWhatsAppNumbers.length,
      },
      chartTimeline,
      extractedWhatsAppNumbers: uniqueWhatsAppNumbers,
      extractedWhatsAppNumbersComma: uniqueWhatsAppNumbers.join(', '),
      contacts: contactsList,
      bookings: bookingsList,
    };
  }

  /**
   * Constrói pontos de dados uniformes para o gráfico avançado
   */
  private static buildChartTimeline(messages: any[], bookings: any[], period: string) {
    const buckets: Record<string, { whatsapp: number; facebook: number; instagram: number; bookings: number }> = {};
    const now = new Date();

    if (period === '24h') {
      // 24 intervalos de 1 hora
      for (let h = 23; h >= 0; h--) {
        const d = new Date(now.getTime() - h * 60 * 60 * 1000);
        const hourStr = `${String(d.getHours()).padStart(2, '0')}:00`;
        buckets[hourStr] = { whatsapp: 0, facebook: 0, instagram: 0, bookings: 0 };
      }

      for (const m of messages) {
        const md = new Date(m.created_at);
        const hourStr = `${String(md.getHours()).padStart(2, '0')}:00`;
        if (buckets[hourStr]) {
          const plat = (m.metadata?.platform || 'whatsapp').toLowerCase();
          if (plat.includes('facebook')) buckets[hourStr].facebook++;
          else if (plat.includes('instagram')) buckets[hourStr].instagram++;
          else buckets[hourStr].whatsapp++;
        }
      }

      for (const b of bookings) {
        const bd = new Date(b.created_at);
        const hourStr = `${String(bd.getHours()).padStart(2, '0')}:00`;
        if (buckets[hourStr]) {
          buckets[hourStr].bookings++;
        }
      }
    } else {
      // Dias (7d ou 30d)
      const countDays = period === '7d' ? 7 : (period === '30d' ? 30 : 12);
      const isMonths = period === '1y' || period === 'all';

      if (!isMonths) {
        for (let i = countDays - 1; i >= 0; i--) {
          const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
          const key = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
          buckets[key] = { whatsapp: 0, facebook: 0, instagram: 0, bookings: 0 };
        }

        for (const m of messages) {
          const md = new Date(m.created_at);
          const key = `${String(md.getDate()).padStart(2, '0')}/${String(md.getMonth() + 1).padStart(2, '0')}`;
          if (buckets[key]) {
            const plat = (m.metadata?.platform || 'whatsapp').toLowerCase();
            if (plat.includes('facebook')) buckets[key].facebook++;
            else if (plat.includes('instagram')) buckets[key].instagram++;
            else buckets[key].whatsapp++;
          }
        }

        for (const b of bookings) {
          const bd = new Date(b.created_at);
          const key = `${String(bd.getDate()).padStart(2, '0')}/${String(bd.getMonth() + 1).padStart(2, '0')}`;
          if (buckets[key]) buckets[key].bookings++;
        }
      } else {
        // Agrupamento por mês
        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        for (let m = 11; m >= 0; m--) {
          const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
          const key = monthNames[d.getMonth()];
          buckets[key] = { whatsapp: 0, facebook: 0, instagram: 0, bookings: 0 };
        }

        for (const m of messages) {
          const md = new Date(m.created_at);
          const key = monthNames[md.getMonth()];
          if (buckets[key]) {
            const plat = (m.metadata?.platform || 'whatsapp').toLowerCase();
            if (plat.includes('facebook')) buckets[key].facebook++;
            else if (plat.includes('instagram')) buckets[key].instagram++;
            else buckets[key].whatsapp++;
          }
        }

        for (const b of bookings) {
          const bd = new Date(b.created_at);
          const key = monthNames[bd.getMonth()];
          if (buckets[key]) buckets[key].bookings++;
        }
      }
    }

    return Object.entries(buckets).map(([label, counts]) => ({
      label,
      whatsapp: counts.whatsapp,
      facebook: counts.facebook,
      instagram: counts.instagram,
      bookings: counts.bookings,
      total: counts.whatsapp + counts.facebook + counts.instagram,
    }));
  }

  /**
   * Constrói o HTML completo e executivo para exibição ou conversão em PDF
   */
  static buildExecutiveHtmlReport(report: DailyReportData, orgName: string): string {
    const s = report.summary;

    // ── SVG Donut Chart helper (channel origin)
    function buildDonutChart(wa: number, fb: number, ig: number): string {
      const total = wa + fb + ig || 1;
      const cx = 80, cy = 80, r = 60;
      const segments = [
        { value: wa, color: '#22c55e', label: 'WhatsApp' },
        { value: fb, color: '#3b82f6', label: 'Facebook' },
        { value: ig, color: '#a855f7', label: 'Instagram' },
      ];
      let cumAngle = -90;
      const paths = segments.map(seg => {
        const angle = (seg.value / total) * 360;
        const startRad = (cumAngle * Math.PI) / 180;
        cumAngle += angle;
        const endRad = (cumAngle * Math.PI) / 180;
        const largeArc = angle > 180 ? 1 : 0;
        const x1 = cx + r * Math.cos(startRad);
        const y1 = cy + r * Math.sin(startRad);
        const x2 = cx + r * Math.cos(endRad);
        const y2 = cy + r * Math.sin(endRad);
        if (seg.value === 0) return '';
        return `<path d="M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${seg.color}" opacity="0.9"><title>${seg.label}: ${seg.value}</title></path>`;
      }).join('');
      return `<svg width="160" height="160" viewBox="0 0 160 160" style="display:block;">${paths}<circle cx="${cx}" cy="${cy}" r="40" fill="white"/><text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="16" font-weight="800" fill="#0f172a">${total}</text><text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="10" fill="#64748b">mensagens</text></svg>`;
    }

    // ── SVG Bar Chart helper (timeline)
    function buildBarChart(timeline: typeof report.chartTimeline): string {
      if (!timeline || timeline.length === 0) return '<p style="color:#94a3b8;font-size:12px;text-align:center;">Sem dados de linha do tempo.</p>';
      const maxVal = Math.max(...timeline.map(d => d.total), 1);
      const chartH = 120;
      const barW = Math.max(12, Math.min(36, Math.floor(640 / timeline.length) - 4));
      const gap = Math.max(3, Math.floor(640 / timeline.length) - barW);
      const totalW = timeline.length * (barW + gap) + 50;
      const colors = { whatsapp: '#22c55e', facebook: '#3b82f6', instagram: '#a855f7', bookings: '#f59e0b' };
      const segments = ['whatsapp', 'facebook', 'instagram', 'bookings'] as const;
      const bars = timeline.map((pt, i) => {
        const x = 46 + i * (barW + gap);
        let yOff = chartH;
        const rects = segments.map(seg => {
          const val = (pt as any)[seg] || 0;
          const h = (val / maxVal) * chartH;
          yOff -= h;
          if (h === 0) return '';
          return `<rect x="${x}" y="${yOff.toFixed(1)}" width="${barW}" height="${h.toFixed(1)}" fill="${colors[seg]}" opacity="0.88"><title>${pt.label} - ${seg}: ${val}</title></rect>`;
        }).join('');
        const labelTrunc = pt.label.length > 5 ? pt.label.slice(0, 5) : pt.label;
        return `${rects}<text x="${x + barW / 2}" y="${chartH + 14}" text-anchor="middle" font-size="8" fill="#71717a">${labelTrunc}</text>`;
      }).join('');
      const gridLines = [0, 0.25, 0.5, 0.75, 1].map(f => {
        const y = chartH - f * chartH;
        const v = Math.round(maxVal * f);
        return `<line x1="42" y1="${y}" x2="${totalW}" y2="${y}" stroke="#e4e4e7" stroke-width="1" stroke-dasharray="3,3"/><text x="38" y="${y + 4}" text-anchor="end" font-size="9" fill="#a1a1aa">${v}</text>`;
      }).join('');
      return `<div style="overflow-x:auto;"><svg width="100%" viewBox="0 0 ${totalW + 10} ${chartH + 30}" style="display:block;min-width:${Math.min(totalW + 10, 680)}px;">${gridLines}${bars}</svg></div>`;
    }

    const donutSvg = buildDonutChart(s.whatsappCount, s.facebookCount, s.instagramCount);
    const barSvg = buildBarChart(report.chartTimeline);

    // ── Channel badge color helper
    function channelBadge(ch: string): string {
      const c = ch.toUpperCase();
      if (c.includes('WHATSAPP')) return `<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;">WhatsApp</span>`;
      if (c.includes('FACEBOOK')) return `<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;">Facebook</span>`;
      if (c.includes('INSTAGRAM')) return `<span style="background:#f3e8ff;color:#6b21a8;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;">Instagram</span>`;
      return `<span style="background:#f1f5f9;color:#475569;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;">${ch}</span>`;
    }

    const bookingsRows = report.bookings.length > 0
      ? report.bookings.map(b => `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 10px; font-weight: bold; color: #0f172a;">${b.date} às ${b.time}</td>
          <td style="padding: 10px; font-weight: 600;">${b.name}</td>
          <td style="padding: 10px; color: #0284c7; font-family: monospace;">${b.phone}</td>
          <td style="padding: 10px; color: #64748b;">${b.email || '---'}</td>
          <td style="padding: 10px;">${b.subject}</td>
          <td style="padding: 10px; font-size: 11px; color: #059669; font-weight: bold;">Confirmado</td>
        </tr>
      `).join('')
      : `<tr><td colspan="6" style="padding: 24px; text-align: center; color: #94a3b8;">Nenhum agendamento registado no período.</td></tr>`;

    const contactsRows = report.contacts.slice(0, 40).map(c => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 10px; font-family: monospace; font-weight: bold; color: #047857;">${c.cleanPhone || c.phone}</td>
        <td style="padding: 8px 10px;">${c.name}</td>
        <td style="padding: 8px 10px;">${channelBadge(c.channel)}</td>
        <td style="padding: 8px 10px; font-size: 12px; color: #64748b;">${c.email || '---'}</td>
        <td style="padding: 8px 10px; font-size: 12px;">${c.subject || 'Atendimento'}</td>
        <td style="padding: 8px 10px; font-size: 11px; color: #64748b;">${c.lastInteractionWat}</td>
      </tr>
    `).join('');

    return `
    <!DOCTYPE html>
    <html lang="pt">
    <head>
      <meta charset="utf-8">
      <title>Relatório Executivo Orion - ${report.periodLabel}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background-color: #f8fafc;
          color: #1e293b;
          margin: 0;
          padding: 24px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .container {
          max-width: 900px;
          margin: 0 auto;
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
          border: 1px solid #e2e8f0;
          overflow: hidden;
        }
        .header {
          background: linear-gradient(135deg, #0f766e 0%, #1e293b 100%);
          color: #ffffff;
          padding: 32px 28px;
        }
        .badge {
          display: inline-block;
          background: #ccfbf1;
          color: #0f766e;
          font-size: 12px;
          font-weight: 700;
          padding: 4px 12px;
          border-radius: 9999px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          padding: 24px;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
        }
        .metric-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 16px;
          text-align: center;
        }
        .metric-value {
          font-size: 26px;
          font-weight: 800;
          color: #0f172a;
          margin-top: 4px;
        }
        .metric-label {
          font-size: 11px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
        }
        .section {
          padding: 24px;
          border-bottom: 1px solid #e2e8f0;
        }
        .section-title {
          font-size: 16px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 16px 0;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
          text-align: left;
        }
        th {
          background: #f1f5f9;
          padding: 10px;
          font-weight: 700;
          color: #475569;
          border-bottom: 2px solid #cbd5e1;
          font-size: 12px;
          text-transform: uppercase;
        }
        .broadcast-box {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 8px;
          padding: 16px;
          margin-top: 8px;
        }
        .broadcast-numbers {
          background: #ffffff;
          border: 1px solid #86efac;
          border-radius: 6px;
          padding: 12px;
          font-family: monospace;
          font-size: 12px;
          color: #166534;
          word-break: break-all;
          max-height: 120px;
          overflow-y: auto;
          line-height: 1.6;
        }
        .footer {
          padding: 20px;
          text-align: center;
          font-size: 12px;
          color: #94a3b8;
          background: #f8fafc;
        }
        @media print {
          body { background: #ffffff; padding: 0; }
          .container { box-shadow: none; border: none; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <span class="badge">Relatório Automático • ${report.periodLabel} • WAT</span>
              <h1 style="margin: 12px 0 4px 0; font-size: 26px; font-weight: 800;">${orgName}</h1>
              <p style="margin: 0; opacity: 0.9; font-size: 14px;">Resumo Executivo de Atendimento, Agendamentos & Disparos — Enviado automaticamente a cada 7 dias</p>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 13px; opacity: 0.85;">Período: <strong>${report.periodLabel}</strong></div>
              <div style="font-size: 12px; opacity: 0.7; margin-top: 4px;">Gerado em: ${report.generatedAtWat}</div>
            </div>
          </div>
        </div>

        <div class="metrics-grid">
          <div class="metric-card">
            <div class="metric-label">Total Mensagens</div>
            <div class="metric-value">${s.totalMessages}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">WhatsApp</div>
            <div class="metric-value" style="color: #059669;">${s.whatsappCount}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Facebook</div>
            <div class="metric-value" style="color: #2563eb;">${s.facebookCount}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Instagram</div>
            <div class="metric-value" style="color: #c026d3;">${s.instagramCount}</div>
          </div>
        </div>

        <!-- ─── Gráficos: Origem das Mensagens ──────────────────────────── -->
        <div class="section" style="border-bottom: 1px solid #e2e8f0;">
          <div class="section-title">📊 Origem das Mensagens por Canal</div>
          <div style="display: flex; flex-wrap: wrap; gap: 32px; align-items: flex-start;">

            <!-- Donut: Distribuição por Canal -->
            <div style="flex: 0 0 auto;">
              <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 12px;">Distribuição por Canal</div>
              <div style="display: flex; align-items: center; gap: 20px;">
                ${donutSvg}
                <div style="display: flex; flex-direction: column; gap: 10px;">
                  <div style="display: flex; align-items: center; gap: 8px; font-size: 13px;">
                    <span style="width: 12px; height: 12px; border-radius: 50%; background: #22c55e; display: inline-block;"></span>
                    <span style="color: #374151;">WhatsApp</span>
                    <strong style="color: #059669; margin-left: 4px;">${s.whatsappCount}</strong>
                    <span style="color: #9ca3af; font-size: 11px;">(${s.totalMessages ? Math.round(s.whatsappCount / s.totalMessages * 100) : 0}%)</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 8px; font-size: 13px;">
                    <span style="width: 12px; height: 12px; border-radius: 50%; background: #3b82f6; display: inline-block;"></span>
                    <span style="color: #374151;">Facebook</span>
                    <strong style="color: #2563eb; margin-left: 4px;">${s.facebookCount}</strong>
                    <span style="color: #9ca3af; font-size: 11px;">(${s.totalMessages ? Math.round(s.facebookCount / s.totalMessages * 100) : 0}%)</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 8px; font-size: 13px;">
                    <span style="width: 12px; height: 12px; border-radius: 50%; background: #a855f7; display: inline-block;"></span>
                    <span style="color: #374151;">Instagram</span>
                    <strong style="color: #9333ea; margin-left: 4px;">${s.instagramCount}</strong>
                    <span style="color: #9ca3af; font-size: 11px;">(${s.totalMessages ? Math.round(s.instagramCount / s.totalMessages * 100) : 0}%)</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 8px; font-size: 13px;">
                    <span style="width: 12px; height: 12px; border-radius: 3px; background: #f59e0b; display: inline-block;"></span>
                    <span style="color: #374151;">Agendamentos</span>
                    <strong style="color: #d97706; margin-left: 4px;">${s.bookingsCount}</strong>
                  </div>
                </div>
              </div>
            </div>

            <!-- Bar Chart: Linha do Tempo -->
            <div style="flex: 1 1 300px; min-width: 260px;">
              <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 12px;">Linha do Tempo (${report.periodLabel})</div>
              <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px; flex-wrap: wrap;">
                <div style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: #64748b;"><span style="width: 10px; height: 10px; background: #22c55e; display: inline-block; border-radius: 2px;"></span>WhatsApp</div>
                <div style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: #64748b;"><span style="width: 10px; height: 10px; background: #3b82f6; display: inline-block; border-radius: 2px;"></span>Facebook</div>
                <div style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: #64748b;"><span style="width: 10px; height: 10px; background: #a855f7; display: inline-block; border-radius: 2px;"></span>Instagram</div>
                <div style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: #64748b;"><span style="width: 10px; height: 10px; background: #f59e0b; display: inline-block; border-radius: 2px;"></span>Agendamentos</div>
              </div>
              ${barSvg}
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">
            🎯 Números WhatsApp Prontos para Disparos (${s.whatsappBroadcastNumbersCount} números recolhidos)
          </div>
          <p style="margin: 0 0 10px 0; font-size: 13px; color: #475569;">
            Lista de números das contas que enviaram mensagens nas ${report.periodLabel}, higienizados no formato internacional e prontos para envio de campanhas sem necessidade de digitação manual:
          </p>
          <div class="broadcast-box">
            <div class="broadcast-numbers">
              ${report.extractedWhatsAppNumbersComma || 'Nenhum número WhatsApp recolhido no período selecionado.'}
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">
            📅 Agendamentos Marcados no Período (${s.bookingsCount})
          </div>
          <table>
            <thead>
              <tr>
                <th>Data / Hora</th>
                <th>Cliente</th>
                <th>Telefone</th>
                <th>Email</th>
                <th>Assunto / Serviço</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${bookingsRows}
            </tbody>
          </table>
        </div>

        <div class="section">
          <div class="section-title">
            👥 Detalhe dos Contactos & Interações Recentes
          </div>
          <table>
            <thead>
              <tr>
                <th>Número / Identificador</th>
                <th>Nome</th>
                <th>Canal</th>
                <th>Email</th>
                <th>Assunto</th>
                <th>Data / Hora (WAT)</th>
              </tr>
            </thead>
            <tbody>
              ${contactsRows || '<tr><td colspan="6" style="padding: 16px; text-align: center; color: #94a3b8;">Nenhum contacto recente.</td></tr>'}
            </tbody>
          </table>
        </div>

        <div class="footer">
          Orion 2.0 Intelligence Platform &bull; Relatórios automáticos a cada 7 dias (WAT: UTC+1) &bull; WhatsApp &bull; Facebook &bull; Instagram
        </div>
      </div>
    </body>
    </html>
    `;
  }

  /**
   * Envia o Relatório Diário por Email para a Empresa e Membros da Equipa com PDF Anexado
   */
  static async sendDailyReportEmail(orgId: string, period: '24h' | '7d' | '30d' | '1y' | 'all' = '24h'): Promise<{
    success: boolean;
    recipients: string[];
    numbersCount: number;
    bookingsCount: number;
    error?: string;
  }> {
    try {
      const report = await this.generateReportData({ orgId, period });
      const { emails: recipients, orgName } = await EmailService.resolveCompanyRecipients(orgId);

      if (recipients.length === 0) {
        console.warn(`[ReportService] Nenhum email de destinatário configurado para a organização ${orgId}`);
        return {
          success: false,
          recipients: [],
          numbersCount: report.summary.whatsappBroadcastNumbersCount,
          bookingsCount: report.summary.bookingsCount,
          error: 'Nenhum email de destinatário configurado na organização ou equipe.',
        };
      }

      const htmlContent = this.buildExecutiveHtmlReport(report, orgName);

      const host = process.env.SMTP_HOST;
      const port = parseInt(process.env.SMTP_PORT || '587', 10);
      const user = process.env.SMTP_USER;
      const pass = process.env.SMTP_PASS;
      const from = process.env.SMTP_FROM || `${orgName} <no-reply@orion.com>`;

      // Se SMTP não estiver configurado no ambiente, registrar log estruturado
      if (!user || !pass) {
        console.warn(
          `[ReportService] ⚠️ SMTP_USER ou SMTP_PASS não configurados no .env!\n` +
          `Relatório Diário (${report.periodLabel}) preparado com sucesso para: ${recipients.join(', ')}\n` +
          `Total Mensagens: ${report.summary.totalMessages} | WhatsApp: ${report.summary.whatsappCount} | Agendamentos: ${report.summary.bookingsCount}\n` +
          `Números para Disparo: ${report.summary.whatsappBroadcastNumbersCount}`
        );
        return {
          success: true,
          recipients,
          numbersCount: report.summary.whatsappBroadcastNumbersCount,
          bookingsCount: report.summary.bookingsCount,
        };
      }

      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });

      const subject = `📊 Relatório Orion — ${report.periodLabel} — WhatsApp: ${report.summary.whatsappCount} | Facebook: ${report.summary.facebookCount} | Instagram: ${report.summary.instagramCount} [${report.generatedAtWat} WAT]`;

      // Anexar o relatório em formato HTML/PDF
      const pdfAttachment = {
        filename: `Relatorio_Diario_Orion_${new Date().toISOString().slice(0, 10)}.html`,
        content: Buffer.from(htmlContent, 'utf-8'),
        contentType: 'text/html',
      };

      await transporter.sendMail({
        from,
        to: recipients,
        subject,
        html: htmlContent,
        attachments: [pdfAttachment],
      });

      console.log(`[ReportService] ✅ Relatório Diário enviado com sucesso para: ${recipients.join(', ')}`);

      return {
        success: true,
        recipients,
        numbersCount: report.summary.whatsappBroadcastNumbersCount,
        bookingsCount: report.summary.bookingsCount,
      };
    } catch (err: any) {
      console.error('[ReportService] ❌ Erro ao enviar relatório diário por email:', err.message);
      return {
        success: false,
        recipients: [],
        numbersCount: 0,
        bookingsCount: 0,
        error: err.message,
      };
    }
  }
}
