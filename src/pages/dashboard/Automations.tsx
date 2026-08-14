import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Zap, Plus, Trash2, Loader2, Save, Power } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export default function Automations() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [automations, setAutomations] = useState<any[]>([]);
  const [newAuto, setNewAuto] = useState({
    name: "",
    type: "lead_capture",
    keywords: "",
    reply_text: ""
  });

  useEffect(() => {
    fetchAutomations();
  }, []);

  const fetchAutomations = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/automations", {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      const data = await response.json();
      setAutomations(data);
    } catch (error) {
      toast.error("Erro ao carregar automações.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const config = {
        keywords: newAuto.keywords.split(",").map(k => k.trim()),
        reply_text: newAuto.reply_text
      };

      const response = await fetch("/api/automations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ name: newAuto.name, type: newAuto.type, config })
      });

      if (!response.ok) throw new Error("Erro ao criar");
      
      toast.success("Automação criada!");
      setIsModalOpen(false);
      fetchAutomations();
    } catch (error) {
      toast.error("Erro ao criar automação.");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      await fetch(`/api/automations/${id}/toggle`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      fetchAutomations();
    } catch (error) {
      toast.error("Erro ao alterar status.");
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Automações Inteligentes</h2>
          <p className="text-zinc-500">Defina gatilhos para que a IA ou o sistema executem ações automáticas.</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4" /> Nova Automação
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {automations.map(auto => (
          <Card key={auto.id} className="border-zinc-200 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="space-y-1">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className={`w-4 h-4 ${auto.status === 'active' ? 'text-amber-500' : 'text-zinc-400'}`} />
                  {auto.name}
                </CardTitle>
                <CardDescription className="capitalize">{auto.type.replace('_', ' ')}</CardDescription>
              </div>
              <Button 
                variant={auto.status === 'active' ? 'default' : 'outline'} 
                size="icon" 
                className="h-8 w-8"
                onClick={() => toggleStatus(auto.id, auto.status)}
              >
                <Power className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-zinc-500 space-y-2">
                <p><span className="font-bold text-zinc-700">Gatilhos:</span> {auto.config?.keywords?.join(", ")}</p>
                {auto.config?.reply_text && (
                  <p className="line-clamp-2 italic">"{auto.config.reply_text}"</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {automations.length === 0 && !isLoading && (
          <div className="col-span-full py-20 text-center border-2 border-dashed border-zinc-200 rounded-2xl bg-zinc-50">
            <Zap className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
            <p className="text-zinc-500 font-medium">Nenhuma automação configurada ainda.</p>
            <Button variant="ghost" className="text-emerald-600 hover:text-emerald-700 underline" onClick={() => setIsModalOpen(true)}>Criar minha primeira automação</Button>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg shadow-2xl animate-in fade-in zoom-in-95">
            <form onSubmit={handleCreate}>
              <CardHeader>
                <CardTitle>Nova Automação</CardTitle>
                <CardDescription>Configure as condições e ações.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome da Automação</Label>
                  <Input placeholder="Ex: Lead de Imóveis" value={newAuto.name} onChange={e => setNewAuto({...newAuto, name: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Ação</Label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    value={newAuto.type}
                    onChange={e => setNewAuto({...newAuto, type: e.target.value})}
                  >
                    <option value="lead_capture">Captura de Lead</option>
                    <option value="auto_reply">Resposta Automática</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Palavras-chave Gatilho (separadas por vírgula)</Label>
                  <Input placeholder="Ex: preço, valor, quanto custa" value={newAuto.keywords} onChange={e => setNewAuto({...newAuto, keywords: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <Label>Resposta do Bot (Opcional)</Label>
                  <textarea 
                    className="flex w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm min-h-[100px] focus-visible:ring-2 focus-visible:ring-emerald-500"
                    placeholder="O que o bot deve dizer quando o gatilho for ativado?"
                    value={newAuto.reply_text}
                    onChange={e => setNewAuto({...newAuto, reply_text: e.target.value})}
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end gap-3 border-t p-4 bg-zinc-50/50 rounded-b-xl">
                <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={isLoading} className="bg-emerald-600 hover:bg-emerald-700">
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  Criar Automação
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
