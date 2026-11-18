import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import {
  TrendingUp, Clock, CalendarCheck, UserCheck, AlertTriangle,
  RefreshCw, Loader2, Activity, Repeat, BarChart
} from "lucide-react";

type Summary = {
  total: number;
  success: number;
  failures: number;
  transferred: number;
  bookings: number;
  proposals: number;
  confirms: number;
  resolutionRate: number;
  avgLatencyMs: number | null;
  avgAttempts: number | null;
  byChannel: Record<string, { total: number; transferred: number; bookings: number; failures: number }>;
  dailySeries: Array<{ date: string; total: number; transferred: number; bookings: number; failures: number }>;
  topHandoffCustomers: Array<{ phone: string; transfers: number; channel: string }>;
  recentFailures: Array<{ customer_phone: string; channel: string; error: string; created_at: string }>;
};

const PERIODS = [
  { value: '24h', label: '24 horas' },
  { value: '7d',  label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
];

const CHANNELS = [
  { value: 'all',       label: 'Todos os canais' },
  { value: 'whatsapp',  label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook',  label: 'Facebook' },
];

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook',
  email: 'E-mail', webchat: 'Web Chat', tiktok: 'TikTok', sms: 'SMS',
};

function formatLatency(ms: number | null): string {
  if (ms == null) return '---';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

export default function Insights() {
  const [period, setPeriod]     = useState('7d');
  const [channel, setChannel]   = useState('all');
  const [data, setData]         = useState<Summary | null>(null);
  const [isLoading, setLoading] = useState(true);

  const token = () => localStorage.getItem('token') || '';

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/insights/summary?period=${period}&channel=${channel}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const json = await res.json();
      if (res.ok) setData(json);
    } catch {
      // silencioso — mantém dados anteriores
    } finally {
      setLoading(false);
    }
  }, [period, channel]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const hasData = !!data && data.total > 0;
  const maxDaily = data ? Math.max(...data.dailySeries.map(d => d.total), 1) : 1;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Qualidade da IA</h2>
          <p className="text-zinc-500">Desempenho real do seu agente em todos os canais.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <select
            value={channel}
            onChange={e => setChannel(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={fetchSummary} disabled={isLoading}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* KPIs principais */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolução sem humano</CardTitle>
            <UserCheck className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hasData ? `${data.resolutionRate}%` : '---'}</div>
            <p className="text-xs text-zinc-500 mt-1">
              {hasData ? `${data.success} de ${data.total} interações sem transferência` : 'Aguardando interações reais'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tempo médio de resposta</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hasData ? formatLatency(data.avgLatencyMs) : '---'}</div>
            <p className="text-xs text-zinc-500 mt-1">
              {data?.avgAttempts ? `Média de ${data.avgAttempts} tentativa(s) por resposta` : 'Da mensagem à resposta da IA'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Agendamentos gerados</CardTitle>
            <CalendarCheck className="h-4 w-4 text-violet-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hasData ? data.bookings : '---'}</div>
            <p className="text-xs text-zinc-500 mt-1">
              {hasData && data.total > 0 ? `${((data.bookings / data.total) * 100).toFixed(1)}% das interações` : 'Conversas convertidas em marcações'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transferências p/ humano</CardTitle>
            <Repeat className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hasData ? data.transferred : '---'}</div>
            <p className="text-xs text-zinc-500 mt-1">
              {hasData ? `${data.failures} falha(s) no período` : 'Clientes que pediram assistente'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Série diária + Canais */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="w-4 h-4 text-emerald-600" /> Interações por dia
            </CardTitle>
            <CardDescription>Volume total, transferências e agendamentos diários.</CardDescription>
          </CardHeader>
          <CardContent>
            {hasData && data.dailySeries.length > 0 ? (
              <div className="flex items-end gap-1.5 h-40">
                {data.dailySeries.map(d => (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group" title={`${d.date}: ${d.total} interações, ${d.transferred} transferências, ${d.bookings} agendamentos`}>
                    <div className="w-full flex flex-col justify-end h-32 gap-px">
                      {d.bookings > 0 && (
                        <div className="w-full bg-violet-500 rounded-t-sm" style={{ height: `${(d.bookings / maxDaily) * 100}%` }} />
                      )}
                      {d.transferred > 0 && (
                        <div className="w-full bg-amber-400" style={{ height: `${(d.transferred / maxDaily) * 100}%` }} />
                      )}
                      <div
                        className={`w-full bg-emerald-500 ${d.bookings === 0 ? 'rounded-t-sm' : ''}`}
                        style={{ height: `${((d.total - d.transferred - d.bookings) / maxDaily) * 100}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-zinc-400 rotate-0">{d.date.substring(5)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-zinc-400 border-2 border-dashed rounded-lg">
                Sem dados no período. As interações da IA começam a aparecer aqui automaticamente.
              </div>
            )}
            <div className="flex gap-4 mt-3 text-[11px] text-zinc-500">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-emerald-500 rounded-sm inline-block" /> Resolvidas</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-amber-400 rounded-sm inline-block" /> Transferidas</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-violet-500 rounded-sm inline-block" /> Agendamentos</span>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart className="w-4 h-4 text-emerald-600" /> Por canal
            </CardTitle>
            <CardDescription>Distribuição e qualidade por plataforma.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasData && Object.keys(data.byChannel).length > 0 ? (
              Object.entries(data.byChannel)
                .sort(([, a], [, b]) => b.total - a.total)
                .map(([ch, stats]) => {
                  const rate = stats.total > 0 ? Math.round(((stats.total - stats.transferred - stats.failures) / stats.total) * 100) : 100;
                  return (
                    <div key={ch}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">{CHANNEL_LABELS[ch] || ch}</span>
                        <span className="text-zinc-500">{stats.total} · {rate}% resolvido</span>
                      </div>
                      <div className="h-2 bg-zinc-100 rounded-full overflow-hidden flex">
                        <div className="bg-emerald-500" style={{ width: `${rate}%` }} />
                        {stats.transferred > 0 && <div className="bg-amber-400" style={{ width: `${(stats.transferred / stats.total) * 100}%` }} />}
                        {stats.failures > 0 && <div className="bg-red-400" style={{ width: `${(stats.failures / stats.total) * 100}%` }} />}
                      </div>
                    </div>
                  );
                })
            ) : (
              <div className="text-center py-8 text-sm text-zinc-400 border-2 border-dashed rounded-lg">
                Sem dados por canal ainda.
              </div>
            )}

            {hasData && data.topHandoffCustomers.length > 0 && (
              <div className="pt-2 border-t">
                <p className="text-xs font-semibold text-zinc-600 mb-2 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Clientes que mais pedem humano
                </p>
                <ul className="space-y-1">
                  {data.topHandoffCustomers.map(c => (
                    <li key={c.phone} className="text-xs flex justify-between text-zinc-600">
                      <span className="font-mono">{c.phone}</span>
                      <span>{c.transfers}x · {CHANNEL_LABELS[c.channel] || c.channel}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Alertas de falhas */}
      <Card className="border-zinc-200 bg-zinc-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-zinc-600">
            <AlertTriangle className="w-5 h-5 text-red-500" /> Falhas recentes da IA
          </CardTitle>
          <CardDescription className="text-zinc-500">
            Interações em que a IA falhou após as 3 tentativas de auto-cura. Reveja para evitar repetição.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasData && data.recentFailures.length > 0 ? (
            <ul className="space-y-2">
              {data.recentFailures.map((f, i) => (
                <li key={i} className="text-xs bg-white border border-red-100 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                  <span className="font-mono text-zinc-700 shrink-0">{f.customer_phone}</span>
                  <span className="text-zinc-400 shrink-0">{CHANNEL_LABELS[f.channel] || f.channel}</span>
                  <span className="text-red-600 flex-1 truncate" title={f.error}>{f.error}</span>
                  <span className="text-zinc-400 shrink-0">{new Date(f.created_at).toLocaleString('pt-PT')}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-6 text-sm text-zinc-400 border-2 border-dashed rounded-lg bg-white">
              {hasData ? '✅ Nenhuma falha no período. Excelente!' : 'Nenhum alerta crítico no momento.'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
