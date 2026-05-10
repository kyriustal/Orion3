import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Megaphone, Plus, PlayCircle, PauseCircle, Settings2, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export default function Campaigns() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [campaigns, setCampaigns] = useState<any[]>([]);

  const [newCampaign, setNewCampaign] = useState({
    name: "",
    template: "oferta_01",
    audience: "all",
    filters: "",
    delay_seconds: 5
  });

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      const response = await fetch("/api/campaigns", {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (error) {
      console.error("Erro ao buscar campanhas", error);
    }
  };

  const handleStartCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampaign.name) {
      toast.error("Dê um nome à campanha.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/campaigns/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify(newCampaign)
      });

      if (!response.ok) throw new Error("Erro ao iniciar campanha");

      const data = await response.json();

      setCampaigns([
        {
          id: Date.now(),
          name: newCampaign.name,
          template: newCampaign.template,
          status: "SENDING",
          date: "Agora",
          progress: 0
        },
        ...campaigns
      ]);

      toast.success(data.message);
      setIsModalOpen(false);
      setNewCampaign({ name: "", template: "oferta_01", audience: "all", filters: "", delay_seconds: 5 });
    } catch (error) {
      toast.error("Erro ao iniciar a campanha.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Campanhas em Massa</h2>
          <p className="text-zinc-500">Envie mensagens proativas usando Templates Oficiais da Meta.</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Nova Campanha
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de Disparos</CardTitle>
          <CardDescription>Acompanhe o status e o progresso das suas campanhas.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {campaigns.length === 0 ? (
              <div className="text-center py-10 border-2 border-dashed rounded-xl bg-zinc-50/50">
                <p className="text-zinc-500 text-sm">Nenhuma campanha enviada ou agendada.</p>
              </div>
            ) : (
              campaigns.map(camp => (
                <div key={camp.id} className="flex items-center justify-between p-4 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center">
                      <Megaphone className="w-5 h-5 text-zinc-500" />
                    </div>
                    <div>
                      <p className="font-semibold text-zinc-900">{camp.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 uppercase tracking-wider">
                          {camp.template}
                        </span>
                        <span className="text-xs text-zinc-500">{camp.date}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-32">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-zinc-700">{camp.progress}%</span>
                        <span className="text-zinc-500">{camp.status}</span>
                      </div>
                      <div className="w-full bg-zinc-200 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${camp.status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${camp.progress}%` }}></div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {camp.status === 'SENDING' ? (
                        <Button variant="outline" size="icon" title="Pausar"><PauseCircle className="w-4 h-4 text-amber-600" /></Button>
                      ) : camp.status === 'SCHEDULED' ? (
                        <Button variant="outline" size="icon" title="Iniciar"><PlayCircle className="w-4 h-4 text-emerald-600" /></Button>
                      ) : null}
                      <Button variant="outline" size="icon" title="Relatório"><Settings2 className="w-4 h-4 text-zinc-600" /></Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Modal de Nova Campanha */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-y-auto max-h-[90vh]">
            <form onSubmit={handleStartCampaign}>
              <CardHeader>
                <CardTitle>Criar Nova Campanha</CardTitle>
                <CardDescription>Configure o envio em massa. O sistema aplicará um atraso de 5s por mensagem para cumprir as políticas da Meta.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="campaignName">Nome da Campanha</Label>
                  <Input
                    id="campaignName"
                    placeholder="Ex: Promoção de Verão"
                    value={newCampaign.name}
                    onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="template">Template Aprovado</Label>
                  <select
                    id="template"
                    className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
                    value={newCampaign.template}
                    onChange={(e) => setNewCampaign({ ...newCampaign, template: e.target.value })}
                  >
                    <option value="oferta_01">oferta_01 (Marketing)</option>
                    <option value="aviso_geral">aviso_geral (Utilitário)</option>
                    <option value="boas_vindas">boas_vindas (Marketing)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="audience">Público Alvo (Tipos de Contatos)</Label>
                  <select
                    id="audience"
                    className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
                    value={newCampaign.audience}
                    onChange={(e) => setNewCampaign({ ...newCampaign, audience: e.target.value })}
                  >
                    <option value="all">Todos os Contatos Base</option>
                    <option value="active_24h">Ativos nas últimas 24h</option>
                    <option value="leads">Leads Novos</option>
                    <option value="customers">Clientes Pagantes</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="filters">Filtros Adicionais (Tags)</Label>
                  <Input
                    id="filters"
                    placeholder="Ex: vip, interessados_produto_a"
                    value={newCampaign.filters}
                    onChange={(e) => setNewCampaign({ ...newCampaign, filters: e.target.value })}
                  />
                  <p className="text-xs text-zinc-500">Separe as tags por vírgula.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="delay">Atraso entre mensagens (Segundos)</Label>
                  <Input
                    id="delay"
                    type="number"
                    min="1"
                    max="60"
                    value={newCampaign.delay_seconds}
                    onChange={(e) => setNewCampaign({ ...newCampaign, delay_seconds: parseInt(e.target.value) || 5 })}
                  />
                  <p className="text-[10px] text-zinc-500 italic">Recomendamos no mínimo 5 segundos para evitar bloqueios de spam da Meta.</p>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mt-4">
                  <p className="text-xs text-amber-800 font-medium">
                    ⚠️ Atenção: O envio em massa pode resultar em banimento se os clientes denunciarem as mensagens como spam. Certifique-se de que os contatos fizeram opt-in.
                  </p>
                </div>
              </CardContent>
              <CardFooter className="bg-zinc-50 border-t border-zinc-200 py-4 flex justify-end gap-2 rounded-b-xl">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting} className="min-w-[140px]">
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PlayCircle className="w-4 h-4 mr-2" />}
                  {isSubmitting ? 'Iniciando...' : 'Iniciar Disparo'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
