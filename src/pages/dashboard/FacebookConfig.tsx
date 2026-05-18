import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Facebook, AlertCircle, Loader2, Trash2, CheckCircle2, Webhook, ShieldCheck } from "lucide-react";
import { toast } from 'sonner';

export default function FacebookConfig() {
  const [webhookUrl] = useState(`${window.location.origin}/api/facebook/webhook`);
  const [verifyToken] = useState("orion_fb_secure_token");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [config, setConfig] = useState<any>(null);

  const [formData, setFormData] = useState({
    page_id: '',
    page_access_token: '',
    app_id: '',
    app_secret: ''
  });

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/facebook/config", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        if (data) {
          setFormData({
            page_id: data.page_id || '',
            page_access_token: data.page_access_token || '',
            app_id: data.app_id || '',
            app_secret: data.app_secret || ''
          });
        }
      }
    } catch (err) {
      console.error("Erro ao carregar config Facebook:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/facebook/config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (!res.ok) throw new Error("Erro ao salvar configuração");
      
      toast.success("Configuração do Facebook salva com sucesso!");
      fetchConfig();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Remover conexão com o Facebook?")) return;
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      await fetch("/api/facebook/config", {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      setConfig(null);
      setFormData({ page_id: '', page_access_token: '', app_id: '', app_secret: '' });
      toast.info("Conexão removida.");
    } catch (err) {
      toast.error("Erro ao remover.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6 pb-20">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Facebook Messenger</h2>
        <p className="text-zinc-500 text-sm mt-1">
          Conecte a sua Página do Facebook para permitir que a IA responda aos seus clientes no Messenger.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Facebook className="w-5 h-5 text-blue-600" />
                Configuração da Página
              </CardTitle>
              <CardDescription>Insira as credenciais da sua Página e Aplicação Meta.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Page ID</label>
                <Input 
                  value={formData.page_id}
                  onChange={e => setFormData({...formData, page_id: e.target.value})}
                  placeholder="Ex: 1029384756" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Page Access Token</label>
                <Input 
                  type="password"
                  value={formData.page_access_token}
                  onChange={e => setFormData({...formData, page_access_token: e.target.value})}
                  placeholder="EAA..." 
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">App ID</label>
                  <Input 
                    value={formData.app_id}
                    onChange={e => setFormData({...formData, app_id: e.target.value})}
                    placeholder="Ex: 3455788..." 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">App Secret</label>
                  <Input 
                    type="password"
                    value={formData.app_secret}
                    onChange={e => setFormData({...formData, app_secret: e.target.value})}
                    placeholder="••••••••" 
                  />
                </div>
              </div>
            </CardContent>
            <CardContent className="border-t pt-4 flex flex-col sm:flex-row gap-2 justify-between items-stretch sm:items-center">
              {config && (
                <Button variant="ghost" className="text-red-500 hover:text-red-600 hover:bg-red-50 justify-center" onClick={handleDelete} disabled={isSubmitting}>
                  <Trash2 className="w-4 h-4 mr-2" /> Desconectar
                </Button>
              )}
              <Button className="sm:ml-auto bg-blue-600 hover:bg-blue-700 justify-center" onClick={handleSave} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Facebook className="w-4 h-4 mr-2" />}
                Salvar Configuração
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Webhook className="w-5 h-5 text-zinc-400" />
                Configuração do Webhook
              </CardTitle>
              <CardDescription>Configure estas URLs no seu Painel de Desenvolvedor Meta.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase">Callback URL</label>
                <div className="flex flex-col sm:flex-row gap-2 w-full">
                  <Input readOnly value={webhookUrl} className="bg-zinc-50 font-mono text-xs sm:text-sm truncate flex-1" />
                  <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.info("Copiado!"); }} className="shrink-0 self-end sm:self-auto">Copiar</Button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase">Verify Token</label>
                <div className="flex flex-col sm:flex-row gap-2 w-full">
                  <Input readOnly value={verifyToken} className="bg-zinc-50 font-mono text-xs sm:text-sm truncate flex-1" />
                  <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(verifyToken); toast.info("Copiado!"); }} className="shrink-0 self-end sm:self-auto">Copiar</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-blue-50 border-blue-100">
            <CardHeader>
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-blue-800">
                <ShieldCheck className="w-4 h-4" /> Status da Conexão
              </CardTitle>
            </CardHeader>
            <CardContent>
              {config?.is_active ? (
                <div className="flex items-center gap-2 text-emerald-600 font-medium">
                  <CheckCircle2 className="w-5 h-5" />
                  Conectado e Activo
                </div>
              ) : (
                <div className="flex items-start gap-2 text-zinc-500 text-sm">
                  <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  Pendente: Configure a sua Página e App para ativar a IA no Messenger.
                </div>
              )}
            </CardContent>
          </Card>

          <div className="p-4 bg-white border rounded-xl space-y-4">
            <h3 className="text-xs font-bold uppercase text-zinc-400">Instruções Rápidas</h3>
            <ol className="text-xs text-zinc-600 space-y-3 list-decimal pl-4">
              <li>Crie uma App no portal <strong>developers.facebook.com</strong></li>
              <li>Adicione o produto <strong>Messenger</strong> à sua App.</li>
              <li>Configure o Webhook usando a URL e Token ao lado.</li>
              <li>Subscreva os eventos: <strong>messages, messaging_postbacks</strong>.</li>
              <li>Gere o Page Access Token e cole aqui.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
