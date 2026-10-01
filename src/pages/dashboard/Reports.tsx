import { useState, useEffect, useCallback } from "react";
import {
  BarChart2, TrendingUp, Users, Calendar, MessageSquare,
  Download, RefreshCw, Loader2, Copy, CheckCheck,
  Smartphone, Globe, Instagram, Filter, ChevronDown,
  FileText, Mail, PhoneCall, Clock, Activity, Zap
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────────
interface ChartPoint {
  label: string;
  whatsapp: number;
  facebook: number;
  instagram: number;
  bookings: number;
  total: number;
}

interface Contact {
  phone: string;
  cleanPhone: string;
  name: string;
  channel: string;
  email?: string;
  subject?: string;
  lastInteraction: string;
  lastInteractionWat: string;
}

interface Booking {
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

interface ReportData {
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
  chartTimeline: ChartPoint[];
  extractedWhatsAppNumbers: string[];
  extractedWhatsAppNumbersComma: string;
  contacts: Contact[];
  bookings: Booking[];
}

// ─── SVG Chart Helpers ──────────────────────────────────────────────────────────
function polarToCart(cx: number, cy: number, r: number, angle: number) {
  const rad = (angle * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// ─── Stacked Bar Chart ──────────────────────────────────────────────────────────
function AdvancedBarChart({ data }: { data: ChartPoint[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-zinc-400 text-sm">
        <div className="text-center">
          <BarChart2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p>Sem dados para exibir neste periodo</p>
        </div>
      </div>
    );
  }

  const maxVal = Math.max(...data.map(d => d.total), 1);
  const chartH = 180;
  const barW = Math.max(16, Math.min(44, Math.floor(680 / data.length) - 6));
  const gap = Math.max(3, Math.floor(680 / data.length) - barW);
  const totalW = data.length * (barW + gap);

  const COLORS: Record<string, string> = {
    whatsapp: "#22c55e",
    facebook: "#3b82f6",
    instagram: "#a855f7",
    bookings: "#f59e0b",
  };

  const segments = ["whatsapp", "facebook", "instagram", "bookings"] as const;

  return (
    <div className="w-full overflow-x-auto">
      <div style={{ minWidth: `${totalW + 55}px` }}>
        <div className="flex items-center gap-4 mb-3 flex-wrap">
          {segments.map(seg => (
            <div key={seg} className="flex items-center gap-1.5 text-xs text-zinc-600">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: COLORS[seg] }} />
              {seg === "bookings" ? "Agendamentos" : seg.charAt(0).toUpperCase() + seg.slice(1)}
            </div>
          ))}
        </div>
        <svg
          width="100%"
          viewBox={`0 0 ${totalW + 55} ${chartH + 36}`}
          className="overflow-visible"
          style={{ maxWidth: "100%" }}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
            const y = chartH - frac * chartH;
            const val = Math.round(maxVal * frac);
            return (
              <g key={i}>
                <line x1="46" y1={y} x2={totalW + 50} y2={y} stroke="#e4e4e7" strokeWidth="1" strokeDasharray="3,3" />
                <text x="40" y={y + 4} textAnchor="end" fontSize="9" fill="#a1a1aa">{val}</text>
              </g>
            );
          })}
          {data.map((point, i) => {
            const x = 50 + i * (barW + gap);
            let yOffset = chartH;
            return (
              <g key={i}>
                {segments.map(seg => {
                  const val = (point as any)[seg] || 0;
                  const h = (val / maxVal) * chartH;
                  yOffset -= h;
                  return (
                    <rect key={seg} x={x} y={yOffset} width={barW} height={h} fill={COLORS[seg]} opacity={0.88}>
                      <title>{`${point.label} - ${seg}: ${val}`}</title>
                    </rect>
                  );
                })}
                {point.total > 0 && (
                  <text x={x + barW / 2} y={chartH - (point.total / maxVal) * chartH - 4} textAnchor="middle" fontSize="8" fill="#71717a" fontWeight="600">
                    {point.total}
                  </text>
                )}
                <text x={x + barW / 2} y={chartH + 14} textAnchor="middle" fontSize="8" fill="#71717a">
                  {point.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ─── Donut Chart ────────────────────────────────────────────────────────────────
function DonutChart({ whatsapp, facebook, instagram }: { whatsapp: number; facebook: number; instagram: number }) {
  const total = whatsapp + facebook + instagram || 1;
  const segments = [
    { value: whatsapp, color: "#22c55e", label: "WhatsApp" },
    { value: facebook, color: "#3b82f6", label: "Facebook" },
    { value: instagram, color: "#a855f7", label: "Instagram" },
  ];
  let cumAngle = -90;
  const r = 60, cx = 80, cy = 80;
  const arcs = segments.map(seg => {
    const angle = (seg.value / total) * 360;
    const start = polarToCart(cx, cy, r, cumAngle);
    cumAngle += angle;
    const end = polarToCart(cx, cy, r, cumAngle);
    const largeArc = angle > 180 ? 1 : 0;
    return { ...seg, d: `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z` };
  });
  return (
    <div className="flex items-center gap-4">
      <svg width="160" height="160" viewBox="0 0 160 160">
        {arcs.map((arc, i) => (
          <path key={i} d={arc.d} fill={arc.color} opacity={0.9}>
            <title>{`${arc.label}: ${arc.value}`}</title>
          </path>
        ))}
        <circle cx={cx} cy={cy} r={36} fill="white" />
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="14" fontWeight="700" fill="#18181b">{total}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="9" fill="#71717a">msgs</text>
      </svg>
      <div className="space-y-2">
        {segments.map(seg => (
          <div key={seg.label} className="flex items-center gap-2 text-xs text-zinc-600">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: seg.color }} />
            <span className="font-medium">{seg.label}</span>
            <span className="text-zinc-400 ml-1">{seg.value} ({Math.round((seg.value / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────────
function ChannelBadge({ channel }: { channel: string }) {
  const ch = (channel || "").toUpperCase();
  if (ch.includes("WHATSAPP")) return <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold text-[10px]">WhatsApp</span>;
  if (ch.includes("FACEBOOK")) return <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold text-[10px]">Facebook</span>;
  if (ch.includes("INSTAGRAM")) return <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold text-[10px]">Instagram</span>;
  return <span className="bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full font-semibold text-[10px]">{channel}</span>;
}

function EmptyState({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
      <Icon className="w-10 h-10 mb-3 opacity-30" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────
export default function Reports() {
  const [period, setPeriod] = useState<"24h" | "7d" | "30d" | "1y" | "all">("7d");
  const [channelFilter, setChannelFilter] = useState<"all" | "whatsapp" | "facebook" | "instagram">("all");
  const [data, setData] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [activeTab, setActiveTab] = useState<"chart" | "contacts" | "bookings" | "broadcast">("chart");
  const [copiedNumbers, setCopiedNumbers] = useState(false);
  const [broadcastPeriod, setBroadcastPeriod] = useState<"24h" | "7d" | "30d" | "all">("7d");

  const token = () => localStorage.getItem("token") || "";

  const fetchReport = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/reports/daily?period=${period}&channel=${channelFilter}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) throw new Error("Erro ao carregar relatorio");
      setData(await res.json());
    } catch (err: any) {
      toast.error(err.message || "Erro ao carregar dados do relatorio");
    } finally {
      setIsLoading(false);
    }
  }, [period, channelFilter]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const handleSendEmail = async () => {
    setIsSendingEmail(true);
    try {
      const res = await fetch("/api/reports/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ period }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao enviar relatorio");
      toast.success(`Relatorio enviado com PDF para: ${json.recipients}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleExportPDF = () => window.open(`/api/reports/export-pdf?period=${period}`, "_blank");

  const handleCopyNumbers = () => {
    navigator.clipboard.writeText(broadcastNumbers.join(", ")).then(() => {
      setCopiedNumbers(true);
      toast.success("Numeros copiados para a area de transferencia!");
      setTimeout(() => setCopiedNumbers(false), 3000);
    });
  };

  const getCutoff = (bp: string) => {
    const now = Date.now();
    if (bp === "24h") return now - 24 * 3600000;
    if (bp === "7d") return now - 7 * 24 * 3600000;
    if (bp === "30d") return now - 30 * 24 * 3600000;
    return 0;
  };

  const broadcastNumbers: string[] = (() => {
    if (!data) return [];
    const cutoff = getCutoff(broadcastPeriod);
    return data.contacts
      .filter(c => {
        if (!cutoff) return true;
        const t = new Date(c.lastInteraction).getTime();
        return !isNaN(t) && t >= cutoff;
      })
      .map(c => c.cleanPhone)
      .filter(p => p && p.length >= 8);
  })();

  const kpis = [
    { label: "Total Msgs", value: data?.summary.totalMessages ?? 0, icon: MessageSquare, color: "text-zinc-700", bg: "bg-zinc-50", border: "border-zinc-200" },
    { label: "Clientes", value: data?.summary.uniqueCustomers ?? 0, icon: Users, color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-100" },
    { label: "WhatsApp", value: data?.summary.whatsappCount ?? 0, icon: Smartphone, color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-100" },
    { label: "Facebook", value: data?.summary.facebookCount ?? 0, icon: Globe, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100" },
    { label: "Instagram", value: data?.summary.instagramCount ?? 0, icon: Instagram, color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-100" },
    { label: "Agendamentos", value: data?.summary.bookingsCount ?? 0, icon: Calendar, color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-100" },
    { label: "Nos Disparo", value: data?.summary.whatsappBroadcastNumbersCount ?? 0, icon: Zap, color: "text-green-700", bg: "bg-green-50", border: "border-green-100" },
  ];

  const tabs = [
    { key: "chart" as const, emoji: "📊", label: "Graficos" },
    { key: "contacts" as const, emoji: "👥", label: "Contactos" },
    { key: "bookings" as const, emoji: "📅", label: "Agendamentos" },
    { key: "broadcast" as const, emoji: "🎯", label: "Disparos WhatsApp" },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-emerald-600" />
            Relatorios &amp; Analytics
          </h2>
          <p className="text-zinc-500 text-sm mt-0.5">
            Dados consolidados de WhatsApp, Facebook, Instagram e Agendamentos.
            {data && <span className="ml-2 text-zinc-400 text-xs">Atualizado: {data.generatedAtWat}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <select value={period} onChange={e => setPeriod(e.target.value as any)} className="appearance-none border border-zinc-200 rounded-lg text-sm px-3 py-2 pr-8 bg-white text-zinc-700 outline-none focus:border-emerald-500 cursor-pointer">
              <option value="24h">Ultimas 24H</option>
              <option value="7d">Ultima Semana</option>
              <option value="30d">Ultimo Mes</option>
              <option value="1y">Ultimo Ano</option>
              <option value="all">Todo o Periodo</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <div className="relative">
            <select value={channelFilter} onChange={e => setChannelFilter(e.target.value as any)} className="appearance-none border border-zinc-200 rounded-lg text-sm px-3 py-2 pr-8 bg-white text-zinc-700 outline-none focus:border-emerald-500 cursor-pointer">
              <option value="all">Todos os Canais</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <button onClick={fetchReport} disabled={isLoading} className="flex items-center gap-1.5 border border-zinc-200 rounded-lg px-3 py-2 text-sm bg-white text-zinc-700 hover:bg-zinc-50 transition-colors">
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
          <button onClick={handleExportPDF} className="flex items-center gap-1.5 border border-zinc-200 rounded-lg px-3 py-2 text-sm bg-white text-zinc-700 hover:bg-zinc-50 transition-colors">
            <Download className="w-4 h-4 text-red-500" />
            PDF
          </button>
          <button onClick={handleSendEmail} disabled={isSendingEmail} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60">
            {isSendingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            Enviar por Email
          </button>
        </div>
      </div>

      {isLoading && !data ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {kpis.map((kpi, i) => (
              <div key={i} className={`rounded-xl border ${kpi.border} ${kpi.bg} p-3 flex flex-col gap-2`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-500">{kpi.label}</span>
                  <kpi.icon className={`w-4 h-4 ${kpi.color} opacity-60`} />
                </div>
                <div className={`text-2xl font-extrabold ${kpi.color}`}>
                  {isLoading ? <span className="w-8 h-5 bg-zinc-200 rounded animate-pulse block" /> : kpi.value}
                </div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
            <div className="flex border-b border-zinc-100 overflow-x-auto">
              {tabs.map(tab => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${activeTab === tab.key ? "border-emerald-600 text-emerald-700 bg-emerald-50/50" : "border-transparent text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50"}`}>
                  {tab.emoji} {tab.label}
                </button>
              ))}
            </div>

            <div className="p-5">
              {/* Chart Tab */}
              {activeTab === "chart" && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                      <h3 className="text-sm font-semibold text-zinc-700 mb-3 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-600" />
                        Linha do Tempo ({data?.periodLabel})
                      </h3>
                      <AdvancedBarChart data={data?.chartTimeline || []} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-700 mb-3 flex items-center gap-2">
                        <Filter className="w-4 h-4 text-purple-600" />
                        Distribuicao por Canal
                      </h3>
                      <DonutChart
                        whatsapp={data?.summary.whatsappCount || 0}
                        facebook={data?.summary.facebookCount || 0}
                        instagram={data?.summary.instagramCount || 0}
                      />
                      <div className="mt-4 space-y-2">
                        {[
                          { label: "Taxa WhatsApp", val: `${Math.round(((data?.summary.whatsappCount || 0) / (data?.summary.totalMessages || 1)) * 100)}%`, color: "text-emerald-600" },
                          { label: "Taxa Facebook", val: `${Math.round(((data?.summary.facebookCount || 0) / (data?.summary.totalMessages || 1)) * 100)}%`, color: "text-blue-600" },
                          { label: "Taxa Instagram", val: `${Math.round(((data?.summary.instagramCount || 0) / (data?.summary.totalMessages || 1)) * 100)}%`, color: "text-purple-600" },
                        ].map(stat => (
                          <div key={stat.label} className="flex items-center justify-between text-xs">
                            <span className="text-zinc-500">{stat.label}</span>
                            <span className={`font-bold ${stat.color}`}>{stat.val}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-zinc-100 pt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { label: "Media diaria", val: data && data.chartTimeline.length > 0 ? Math.round(data.summary.totalMessages / data.chartTimeline.length) : 0, icon: TrendingUp, color: "text-emerald-600" },
                      { label: "Agendamentos", val: data?.summary.bookingsCount || 0, icon: Calendar, color: "text-amber-600" },
                      { label: "Nos para disparo", val: data?.summary.whatsappBroadcastNumbersCount || 0, icon: PhoneCall, color: "text-green-600" },
                      { label: "Periodo", val: data?.periodLabel || "---", icon: Clock, color: "text-zinc-600" },
                    ].map((s, i) => (
                      <div key={i} className="bg-zinc-50 rounded-lg p-3 border border-zinc-100">
                        <div className="flex items-center gap-1.5 text-xs text-zinc-500 mb-1">
                          <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                          {s.label}
                        </div>
                        <div className={`text-lg font-bold ${s.color}`}>{s.val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Contacts Tab */}
              {activeTab === "contacts" && (
                <div>
                  <h3 className="text-sm font-semibold text-zinc-700 mb-4">Contactos Unicos: {data?.contacts.length || 0}</h3>
                  {!data?.contacts.length ? <EmptyState icon={Users} text="Nenhum contacto encontrado neste periodo." /> : (
                    <div className="overflow-x-auto rounded-lg border border-zinc-100">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="bg-zinc-50 border-b border-zinc-100">
                            {["Numero / ID", "Nome", "Canal", "Email", "Assunto", "Ultima Interacao"].map(h => (
                              <th key={h} className="px-3 py-3 text-zinc-500 font-semibold whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {data.contacts.map((c, i) => (
                            <tr key={i} className="border-b border-zinc-50 hover:bg-zinc-50/70 transition-colors">
                              <td className="px-3 py-2.5 font-mono text-emerald-700 font-semibold">{c.cleanPhone || c.phone}</td>
                              <td className="px-3 py-2.5 text-zinc-800 font-medium">{c.name}</td>
                              <td className="px-3 py-2.5"><ChannelBadge channel={c.channel} /></td>
                              <td className="px-3 py-2.5 text-zinc-500">{c.email || "---"}</td>
                              <td className="px-3 py-2.5 text-zinc-500 max-w-xs truncate">{c.subject || "---"}</td>
                              <td className="px-3 py-2.5 text-zinc-400">{c.lastInteractionWat}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Bookings Tab */}
              {activeTab === "bookings" && (
                <div>
                  <h3 className="text-sm font-semibold text-zinc-700 mb-4">Agendamentos: {data?.bookings.length || 0}</h3>
                  {!data?.bookings.length ? <EmptyState icon={Calendar} text="Nenhum agendamento encontrado neste periodo." /> : (
                    <div className="overflow-x-auto rounded-lg border border-zinc-100">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="bg-zinc-50 border-b border-zinc-100">
                            {["Data / Hora", "Nome", "Telefone", "Email", "Assunto / Servico", "Registado Em"].map(h => (
                              <th key={h} className="px-3 py-3 text-zinc-500 font-semibold whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {data.bookings.map((b, i) => (
                            <tr key={i} className="border-b border-zinc-50 hover:bg-zinc-50/70 transition-colors">
                              <td className="px-3 py-2.5 font-semibold text-zinc-800 whitespace-nowrap">
                                {b.date}{b.time ? ` — ${b.time}` : ""}
                              </td>
                              <td className="px-3 py-2.5 text-zinc-700">{b.name}</td>
                              <td className="px-3 py-2.5 font-mono text-emerald-700">{b.phone || "---"}</td>
                              <td className="px-3 py-2.5 text-zinc-500">{b.email || "---"}</td>
                              <td className="px-3 py-2.5 text-zinc-600">{b.subject}</td>
                              <td className="px-3 py-2.5 text-zinc-400">{b.createdAtWat}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Broadcast Tab */}
              {activeTab === "broadcast" && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-700 mb-1 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-emerald-600" />
                      Extracao de Numeros para Disparos WhatsApp
                    </h3>
                    <p className="text-xs text-zinc-500">Filtra automaticamente os contactos que enviaram mensagem no periodo, prontos para campanhas sem insercao manual.</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-zinc-500 font-medium">Filtrar por periodo:</span>
                    {[{ v: "24h", l: "Ultimas 24H" }, { v: "7d", l: "Ultima Semana" }, { v: "30d", l: "Ultimo Mes" }, { v: "all", l: "Sempre" }].map(opt => (
                      <button key={opt.v} onClick={() => setBroadcastPeriod(opt.v as any)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${broadcastPeriod === opt.v ? "bg-emerald-600 text-white" : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50"}`}>
                        {opt.l}
                      </button>
                    ))}
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-emerald-800">{broadcastNumbers.length} numeros prontos para disparo</span>
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                          {broadcastPeriod === "24h" ? "24H" : broadcastPeriod === "7d" ? "7 Dias" : broadcastPeriod === "30d" ? "30 Dias" : "Sempre"}
                        </span>
                      </div>
                      <button onClick={handleCopyNumbers} disabled={broadcastNumbers.length === 0}
                        className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50">
                        {copiedNumbers ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedNumbers ? "Copiado!" : "Copiar Numeros"}
                      </button>
                    </div>
                    <textarea readOnly value={broadcastNumbers.join(", ") || "Nenhum numero encontrado neste periodo."} rows={4}
                      className="w-full bg-white border border-emerald-200 rounded-lg p-3 text-xs font-mono text-emerald-900 resize-none outline-none" />
                    <p className="text-xs text-emerald-600 mt-2">Numeros higienizados para padrao E.164, sem necessidade de insercao manual.</p>
                  </div>
                  {broadcastNumbers.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border border-zinc-100">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="bg-zinc-50 border-b border-zinc-100">
                            {["No WhatsApp (E.164)", "Nome", "Canal Origem", "Email", "Ultima Interacao"].map(h => (
                              <th key={h} className="px-3 py-3 text-zinc-500 font-semibold whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(data?.contacts || [])
                            .filter(c => {
                              const cutoff = getCutoff(broadcastPeriod);
                              if (!cutoff) return true;
                              const t = new Date(c.lastInteraction).getTime();
                              return !isNaN(t) && t >= cutoff;
                            })
                            .filter(c => c.cleanPhone && c.cleanPhone.length >= 8)
                            .map((c, i) => (
                              <tr key={i} className="border-b border-zinc-50 hover:bg-zinc-50/70">
                                <td className="px-3 py-2.5 font-mono text-emerald-700 font-semibold">{c.cleanPhone}</td>
                                <td className="px-3 py-2.5 text-zinc-700">{c.name}</td>
                                <td className="px-3 py-2.5"><ChannelBadge channel={c.channel} /></td>
                                <td className="px-3 py-2.5 text-zinc-500">{c.email || "---"}</td>
                                <td className="px-3 py-2.5 text-zinc-400">{c.lastInteractionWat}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Google Sheets banner */}
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 rounded-xl p-5">
            <div className="flex items-start gap-4">
              <div className="bg-emerald-100 rounded-lg p-2.5 flex-shrink-0">
                <FileText className="w-5 h-5 text-emerald-700" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-emerald-900 mb-1">Sincronizacao Automatica com Google Sheets</h4>
                <p className="text-xs text-emerald-700 leading-relaxed">
                  Todos os dados sao automaticamente sincronizados com a planilha Google.
                  Relatorio diario com PDF enviado as <strong>23:59 (Horario de Angola / WAT)</strong>.
                </p>
              </div>
              <button onClick={() => (window.location.href = "/dashboard/settings")}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0">
                Configurar Planilha
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
