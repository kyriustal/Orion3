import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { MessageSquare, Users, Activity } from "lucide-react";
import { io } from "socket.io-client";

export default function Overview() {
  const [period, setPeriod] = useState("24h");
  const [metrics, setMetrics] = useState({
    messagesToday: 0,
    newChats: 0,
    resolutionRate: '---',
    apiStatus: 'Conectando...'
  });

  const fetchMetrics = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/dashboard/metrics?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } catch (err) {
      console.error('Erro ao carregar métricas', err);
    }
  };

  useEffect(() => {
    fetchMetrics();
    // Atualizar a cada minuto como fallback
    const interval = setInterval(fetchMetrics, 60000);

    // Conectar ao WebSocket para atualização em tempo real
    const sock = io(window.location.origin, { transports: ["websocket", "polling"] });
    sock.on("connect", () => {
      try {
        const tokenStr = localStorage.getItem('token');
        if (tokenStr) {
          const decoded = JSON.parse(atob(tokenStr.split(".")[1]));
          const orgId = decoded?.orgId || decoded?.id;
          if (orgId) sock.emit("join_org", orgId);
        }
      } catch {}
    });

    sock.on("new_message", () => {
      // Quando chega uma mensagem nova, recarrega as métricas instantaneamente
      fetchMetrics();
    });

    return () => {
      clearInterval(interval);
      sock.disconnect();
    };
  }, [period]); // Recarrega sempre que o filtro de tempo muda

  const periodLabels: Record<string, string> = {
    "24h": "Hoje",
    "7d": "Últimos 7 dias",
    "30d": "Últimos 30 dias",
    "3m": "Últimos 3 meses",
    "6m": "Últimos 6 meses",
    "1y": "Último Ano"
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Dashboard</h2>
          <p className="text-zinc-500">Visão geral do desempenho do seu agente de IA.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-500 font-medium">Período:</span>
          <select 
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="border border-zinc-200 rounded-md text-sm px-3 py-1.5 bg-white text-zinc-700 outline-none focus:border-emerald-500"
          >
            <option value="24h">24 Horas</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="3m">3 Meses</option>
            <option value="6m">6 Meses</option>
            <option value="1y">1 Ano</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mensagens ({periodLabels[period]})</CardTitle>
            <MessageSquare className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.messagesToday}</div>
            <p className="text-xs text-zinc-500 mt-1">
              {metrics.messagesToday === 0 ? 'Aguardando as primeiras interações' : 'Interações registadas'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Chats Únicos ({periodLabels[period]})</CardTitle>
            <Users className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.newChats}</div>
            <p className="text-xs text-zinc-500 mt-1">
              {metrics.newChats === 0 ? 'Nenhum chat iniciado hoje' : 'Pessoas ativas hoje'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Resolução (IA)</CardTitle>
            <BotIcon className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.resolutionRate}</div>
            <p className="text-xs text-zinc-500 mt-1">
              Processado pela inteligência artificial
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status da API</CardTitle>
            <Activity className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metrics.apiStatus === 'Online' ? 'text-emerald-600' : 'text-zinc-600'}`}>
              {metrics.apiStatus}
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Serviço WhatsApp a funcionar
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function BotIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  )
}
