import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Facebook, AlertCircle, Loader2, Trash2, CheckCircle2, Webhook, ShieldCheck, RefreshCw, AlertTriangle, ExternalLink } from "lucide-react";
import { toast } from 'sonner';

export default function FacebookConfig() {
  const [webhookUrl] = useState(`${window.location.origin}/api/facebook/webhook`);
  const [verifyToken] = useState("orion_secure_token_123");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [diagnostic, setDiagnostic] = useState<any>(null);

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
          // Executar teste em segundo plano se já existir configuração
          testConnectionSilently();
        }
      }
    } catch (err) {
      console.error("Erro ao carregar config Facebook:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const testConnectionSilently = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/facebook/test", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDiagnostic(data);
      }
    } catch (_) {}
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/facebook/test", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      setDiagnostic(data);

      if (!res.ok || !data.success) {
        toast.error(data.error || data.validation?.error || "Falha ao validar token junto à Meta.");
      } else if (!data.validation?.hasMessaging) {
        toast.warning("Token conectado, mas sem permissão 'pages_messaging'!");
      } else {
        toast.success(`Página verificada com sucesso! (${data.validation?.pageName})`);
      }
    } catch (err: any) {
      toast.error(`Erro ao testar: ${err.message}`);
    } finally {
      setIsTesting(false);
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

      if (!res.ok) {
        let errMsg = `Erro ${res.status} ao salvar configuração`;
        try {
          const errData = await res.json();
          errMsg = errData.message || errData.error || errMsg;
        } catch {}
        if (res.status === 401) {
          localStorage.removeItem("token");
          toast.error("Sessão expirada. Por favor faça login novamente.");
          setTimeout(() => window.location.href = "/login", 1500);
          return;
        }
        throw new Error(errMsg);
      }

      const resData = await res.json();
      toast.success("Configuração do Facebook salva com sucesso!");

      if (resData.validation) {
        if (!resData.validation.valid) {
          toast.error(`Atenção: A Meta rejeitou o token: ${resData.validation.error || 'Token inválido'}`);
        } else if (!resData.validation.hasMessaging) {
          toast.warning("Atenção: Este token não tem a permissão 'pages_messaging'. A IA não poderá responder até adicionar essa permissão.");
        }
      }

      fetchConfig();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Remover conexão com o Facebook? A IA deixará de responder no Messenger.")) return;
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/facebook/config", {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error("Erro ao remover configuração.");
      }
      setConfig(null);
      setDiagnostic(null);
      setFormData({ page_id: '', page_access_token: '', app_id: '', app_secret: '' });
      toast.info("Conexão com o Facebook removida.");
    } catch (err: any) {
      toast.error(err.message);
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
          Conecte a sua Página do Facebook para permitir que a IA Orion responda automaticamente aos seus clientes no Messenger.
        </p>
      </div>

      {/* Alerta de Diagnóstico se faltar permissão pages_messaging */}
      {diagnostic && diagnostic.validation?.valid && !diagnostic.validation?.hasMessaging && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-amber-900">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-amber-950">Atenção Crítica: Token sem permissão para Mensagens no Facebook!</p>
            <p className="text-xs text-amber-800 leading-relaxed">
              O token atual está conectado como <strong>{diagnostic.validation.pageName || 'Utilizador do Sistema'}</strong>, mas <strong>NÃO</strong> possui a permissão <code className="bg-amber-100 px-1 py-0.5 rounded font-mono font-bold">pages_messaging</code>. 
              Sem esta permissão, o Facebook bloqueia o envio de respostas pela IA.
            </p>
            <p className="text-xs text-amber-800">
              <strong>Solução:</strong> Gere um novo Page Access Token no Meta Developer Portal incluindo as permissões <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">pages_messaging</code> e <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">pages_read_engagement</code>.
            </p>
          </div>
        </div>
      )}

      {/* Alerta se o token for completamente inválido */}
      {diagnostic && diagnostic.validation && !diagnostic.validation.valid && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-900">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-red-950">Token Rejeitado pela Meta</p>
            <p className="text-xs text-red-800 leading-relaxed">
              Erro da Meta Graph API: <em>{diagnostic.validation.error || 'Token expirado ou inválido'}</em>.
            </p>
          </div>
        </div>
      )}

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
                  placeholder="Ex: 110011441415915" 
                />
                <p className="text-xs text-zinc-400">O ID numérico da sua Página do Facebook.</p>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium">Page Access Token</label>
                  <a 
                    href="https://developers.facebook.com/tools/explorer/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                  >
                    Graph API Explorer <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <Input 
                  type="password"
                  value={formData.page_access_token}
                  onChange={e => setFormData({...formData, page_access_token: e.target.value})}
                  placeholder="EAA..." 
                />
                <p className="text-xs text-zinc-400">
                  Deve ter as permissões: <code className="bg-zinc-100 px-1 py-0.5 rounded">pages_messaging</code>, <code className="bg-zinc-100 px-1 py-0.5 rounded">pages_read_engagement</code>.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">App ID (Opcional)</label>
                  <Input 
                    value={formData.app_id}
                    onChange={e => setFormData({...formData, app_id: e.target.value})}
                    placeholder="Ex: 3455788..." 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">App Secret (Opcional)</label>
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
                <div className="flex gap-2">
                  <Button variant="ghost" className="text-red-500 hover:text-red-600 hover:bg-red-50 justify-center" onClick={handleDelete} disabled={isSubmitting || isTesting}>
                    <Trash2 className="w-4 h-4 mr-2" /> Desconectar
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={isTesting || isSubmitting}>
                    {isTesting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
                    Testar Conexão
                  </Button>
                </div>
              )}
              <Button className="sm:ml-auto bg-blue-600 hover:bg-blue-700 justify-center" onClick={handleSave} disabled={isSubmitting || isTesting}>
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
              <CardDescription>Configure estas credenciais no Painel de Desenvolvedores da Meta.</CardDescription>
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
            <CardContent className="space-y-3">
              {config?.is_active ? (
                <>
                  <div className="flex items-center gap-2 text-emerald-600 font-medium">
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    Configuração Salva
                  </div>
                  {diagnostic?.validation?.valid ? (
                    <div className="text-xs space-y-1 text-zinc-600 bg-white/70 p-3 rounded-lg border border-blue-100">
                      <p><strong>Página:</strong> {diagnostic.validation.pageName || 'Detectada'}</p>
                      <p><strong>Permissão Mensagens:</strong> {diagnostic.validation.hasMessaging ? <span className="text-emerald-600 font-semibold">Ativa (OK)</span> : <span className="text-amber-600 font-semibold">Ausente (Requer pages_messaging)</span>}</p>
                      <p><strong>Webhook Subscrito:</strong> {diagnostic.subscribed ? <span className="text-emerald-600 font-semibold">Sim</span> : <span className="text-amber-600 font-semibold">Pendente</span>}</p>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="flex items-start gap-2 text-zinc-500 text-sm">
                  <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  Pendente: Configure a sua Página e Page Access Token para ativar a IA no Messenger.
                </div>
              )}
            </CardContent>
          </Card>

          <div className="p-4 bg-white border rounded-xl space-y-4">
            <h3 className="text-xs font-bold uppercase text-zinc-400">Como Gerar o Token Correto</h3>
            <ol className="text-xs text-zinc-600 space-y-3 list-decimal pl-4 leading-relaxed">
              <li>Aceda ao <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline font-medium">Meta Graph API Explorer</a>.</li>
              <li>Selecione a sua <strong>Aplicação Meta</strong> no canto superior direito.</li>
              <li>No campo <strong>User or Page</strong>, selecione a sua <strong>Página do Facebook</strong> (NÃO utilize utilizador do sistema de conversões).</li>
              <li>Em <strong>Add Permissions</strong>, adicione:
                <ul className="list-disc pl-4 mt-1 space-y-0.5 text-zinc-500 font-mono text-[11px]">
                  <li>pages_messaging</li>
                  <li>pages_read_engagement</li>
                  <li>pages_show_list</li>
                </ul>
              </li>
              <li>Clique em <strong>Generate Access Token</strong>.</li>
              <li>Cole o token gerado no campo <strong>Page Access Token</strong> e clique em <strong>Salvar Configuração</strong>.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
