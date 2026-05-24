import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { MessageSquare, Users, Activity } from "lucide-react";

export default function Overview() {
  const [metrics, setMetrics] = useState({
    messagesToday: 0,
    newChats: 0,
    resolutionRate: '---',
    apiStatus: 'Conectando...'
  });

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/dashboard/metrics', {
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

    fetchMetrics();
    // Atualizar a cada minuto
    const interval = setInterval(fetchMetrics, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Dashboard</h2>
        <p className="text-zinc-500">Visão geral do desempenho do seu agente de IA.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mensagens Hoje</CardTitle>
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
            <CardTitle className="text-sm font-medium">Novos Chats</CardTitle>
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
