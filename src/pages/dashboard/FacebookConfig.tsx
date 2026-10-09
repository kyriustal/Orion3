import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { 
  Facebook, AlertCircle, Loader2, Trash2, CheckCircle2, 
  Webhook, ShieldCheck, RefreshCw, AlertTriangle, ExternalLink, 
  Eye, EyeOff, Copy, Pencil, Lock, Key 
} from "lucide-react";
import { toast } from 'sonner';
import { PasswordConfirmationModal } from "@/src/components/auth/PasswordConfirmationModal";

export default function FacebookConfig() {
  const [webhookUrl] = useState(`${window.location.origin}/api/facebook/webhook`);
  const [verifyToken] = useState("orion_secure_token_123");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [diagnostic, setDiagnostic] = useState<any>(null);

  // Estados de visualização / edição
  const [isEditing, setIsEditing] = useState(false);
  const [showTokenPreview, setShowTokenPreview] = useState(false);
  const [showSecretPreview, setShowSecretPreview] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [pendingCredentialAction, setPendingCredentialAction] = useState<null | 'showToken' | 'showSecret' | 'copyToken' | 'copySecret'>(null);
  const [hasCredentialAccess, setHasCredentialAccess] = useState(false);

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
        if (data && data.is_active) {
          setFormData({
            page_id: data.page_id || '',
            page_access_token: data.page_access_token || data.access_token || '',
            app_id: data.app_id || '',
            app_secret: data.app_secret || ''
          });
          setIsEditing(false);
          testConnectionSilently();
        } else {
          setIsEditing(true);
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

  const handleSaveClick = () => {
    if (!formData.page_id.trim() || !formData.page_access_token.trim()) {
      toast.error("Page ID e Page Access Token são obrigatórios.");
      return;
    }

    executeSave();
  };

  const executeSave = async () => {
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/facebook/config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData
        })
      });

      const resData = await res.json();

      if (!res.ok) {
        throw new Error(resData.error || resData.message || "Erro ao salvar configuração.");
      }

      toast.success("Configuração do Facebook salva com sucesso!");

      if (resData.validation) {
        if (!resData.validation.valid) {
          toast.error(`Atenção: A Meta rejeitou o token: ${resData.validation.error || 'Token inválido'}`);
        } else if (!resData.validation.hasMessaging) {
          toast.warning("Atenção: Este token não tem a permissão 'pages_messaging'.");
        }
      }

      setIsPasswordModalOpen(false);
      setIsEditing(false);
      await fetchConfig();
    } catch (err: any) {
      toast.error(err.message);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const requestCredentialAccess = (action: NonNullable<typeof pendingCredentialAction>) => {
    if (hasCredentialAccess) {
      runCredentialAction(action);
      return;
    }
    setPendingCredentialAction(action);
    setIsPasswordModalOpen(true);
  };

  const runCredentialAction = (action: NonNullable<typeof pendingCredentialAction>) => {
    if (action === 'showToken') setShowTokenPreview(true);
    if (action === 'showSecret') setShowSecretPreview(true);
    if (action === 'copyToken') copyToClipboard(formData.page_access_token);
    if (action === 'copySecret') copyToClipboard(formData.app_secret);
  };

  const confirmCredentialAccess = async (password: string) => {
    const token = localStorage.getItem("token");
    const res = await fetch("/api/auth/verify-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Palavra-passe incorreta. Acesso negado.");
    }
    setHasCredentialAccess(true);
    if (pendingCredentialAction) runCredentialAction(pendingCredentialAction);
    setPendingCredentialAction(null);
    setIsPasswordModalOpen(false);
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
      setIsEditing(true);
      toast.info("Conexão com o Facebook removida.");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success("Copiado para a área de transferência!");
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const isConnected = !!config?.is_active;

  return (
    <div className="max-w-4xl space-y-6 pb-20">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Facebook Messenger</h2>
        <p className="text-zinc-500 text-sm mt-1">
          Conecte, pré-visualize e edite os parâmetros da sua Página do Facebook para que a IA Orion responda no Messenger.
        </p>
      </div>

      {/* Alerta de Diagnóstico se faltar permissão pages_messaging */}
      {diagnostic && diagnostic.validation?.valid && !diagnostic.validation?.hasMessaging && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-amber-900 animate-in fade-in">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-amber-950">Atenção Crítica: Token sem permissão para Mensagens no Facebook!</p>
            <p className="text-xs text-amber-800 leading-relaxed">
              O token atual está conectado à página <strong>{diagnostic.validation.pageName || 'Página'}</strong>, mas <strong>NÃO</strong> possui a permissão <code className="bg-amber-100 px-1 py-0.5 rounded font-mono font-bold">pages_messaging</code>. 
              Sem esta permissão, o Facebook bloqueia o envio de respostas pela IA.
            </p>
          </div>
        </div>
      )}

      {/* Alerta se o token for completamente inválido */}
      {diagnostic && diagnostic.validation && !diagnostic.validation.valid && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-900 animate-in fade-in">
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

          {/* PAINEL DE PRÉ-VISUALIZAÇÃO DE DADOS QUANDO CONECTADO */}
          {isConnected && !isEditing ? (
            <Card className="border-zinc-200/90 shadow-sm overflow-hidden">
              <CardHeader className="bg-zinc-50/50 border-b border-zinc-100 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                      <Facebook className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base text-zinc-900">
                        {config.display_name || diagnostic?.validation?.pageName || "Página do Facebook"}
                      </CardTitle>
                      <CardDescription className="text-xs flex items-center gap-1.5 mt-0.5 text-emerald-600 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Conectado e Ativo
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditing(true)}
                      className="text-xs font-semibold text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100"
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1.5" />
                      Editar Credenciais
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-zinc-200 pb-2">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-700">
                      Pré-visualização de Credenciais Meta Messenger
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Visualização protegida por palavra-passe</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Page ID */}
                  <div className="bg-zinc-50/80 p-3.5 rounded-xl border border-zinc-200">
                    <div className="flex items-center justify-between text-xs text-zinc-500 font-medium mb-1">
                      <span>Facebook Page ID</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyToClipboard(formData.page_id)}
                        className="h-6 w-6 text-zinc-400 hover:text-zinc-700"
                        title="Copiar Page ID"
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                    <p className="font-mono text-xs font-bold text-zinc-800 break-all select-all">
                      {formData.page_id || "Não configurado"}
                    </p>
                  </div>

                  {/* App ID */}
                  <div className="bg-zinc-50/80 p-3.5 rounded-xl border border-zinc-200">
                    <div className="flex items-center justify-between text-xs text-zinc-500 font-medium mb-1">
                      <span>Meta App ID</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyToClipboard(formData.app_id)}
                        className="h-6 w-6 text-zinc-400 hover:text-zinc-700"
                        title="Copiar App ID"
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                    <p className="font-mono text-xs font-bold text-zinc-800 break-all select-all">
                      {formData.app_id || "Não informado"}
                    </p>
                  </div>

                  {/* Page Access Token */}
                  <div className="bg-zinc-50/80 p-3.5 rounded-xl border border-zinc-200 sm:col-span-2">
                    <div className="flex items-center justify-between text-xs text-zinc-500 font-medium mb-1">
                      <span>Page Access Token</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => showTokenPreview ? setShowTokenPreview(false) : requestCredentialAccess('showToken')}
                          className="p-1 text-zinc-400 hover:text-zinc-700 rounded-md hover:bg-zinc-200 transition-colors"
                          title={showTokenPreview ? "Ocultar Token" : "Mostrar Token"}
                        >
                          {showTokenPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => requestCredentialAccess('copyToken')}
                          className="h-6 w-6 text-zinc-400 hover:text-zinc-700"
                          title="Copiar Token"
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    <p className="font-mono text-xs font-semibold text-zinc-800 truncate select-all">
                      {showTokenPreview
                        ? formData.page_access_token
                        : `${formData.page_access_token.substring(0, 10)}••••••••••••••••${formData.page_access_token.substring(formData.page_access_token.length - 6)}`}
                    </p>
                  </div>

                  {/* App Secret */}
                  {formData.app_secret && (
                    <div className="bg-zinc-50/80 p-3.5 rounded-xl border border-zinc-200 sm:col-span-2">
                      <div className="flex items-center justify-between text-xs text-zinc-500 font-medium mb-1">
                        <span>Meta App Secret</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => showSecretPreview ? setShowSecretPreview(false) : requestCredentialAccess('showSecret')}
                            className="p-1 text-zinc-400 hover:text-zinc-700 rounded-md hover:bg-zinc-200 transition-colors"
                            title={showSecretPreview ? "Ocultar Secret" : "Mostrar Secret"}
                          >
                            {showSecretPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => requestCredentialAccess('copySecret')}
                            className="h-6 w-6 text-zinc-400 hover:text-zinc-700"
                            title="Copiar Secret"
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      <p className="font-mono text-xs font-semibold text-zinc-800 select-all">
                        {showSecretPreview ? formData.app_secret : "••••••••••••••••••••••••"}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>

              <CardFooter className="bg-zinc-50 border-t border-zinc-100 p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTestConnection}
                    disabled={isTesting || isSubmitting}
                    className="bg-white"
                  >
                    {isTesting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
                    Testar Conexão
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDelete}
                    disabled={isSubmitting || isTesting}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 bg-white"
                  >
                    <Trash2 className="w-4 h-4 mr-1.5" /> Desconectar
                  </Button>
                </div>
                <Button
                  onClick={() => setIsEditing(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs gap-1.5"
                >
                  <Pencil className="w-3.5 h-3.5" /> Editar Parâmetros
                </Button>
              </CardFooter>
            </Card>
          ) : (
            /* FORMULÁRIO DE EDIÇÃO OU NOVA CONEXÃO */
            <Card className="border-zinc-200/90 shadow-sm">
              <CardHeader className="border-b border-zinc-100 pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Facebook className="w-5 h-5 text-blue-600" />
                    {isConnected ? "Editar Parâmetros do Facebook" : "Conectar Página do Facebook"}
                  </CardTitle>
                  {isConnected && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setIsEditing(false)}
                      className="text-xs text-zinc-500"
                    >
                      Cancelar Edição
                    </Button>
                  )}
                </div>
                <CardDescription className="text-xs">
                  {isConnected
                    ? "Altere os dados da conexão. A palavra-passe só será solicitada ao visualizar ou copiar credenciais sensíveis."
                    : "Insira as credenciais da sua Página e Aplicação Meta."}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4 pt-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-700">Page ID <span className="text-red-500">*</span></label>
                  <Input 
                    value={formData.page_id}
                    onChange={e => setFormData({...formData, page_id: e.target.value})}
                    placeholder="Ex: 110011441415915"
                    className="text-sm font-mono"
                  />
                  <p className="text-[11px] text-zinc-400">O ID numérico da sua Página do Facebook.</p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-zinc-700">Page Access Token <span className="text-red-500">*</span></label>
                    <a 
                      href="https://developers.facebook.com/tools/explorer/" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[11px] text-blue-600 hover:underline flex items-center gap-1 font-medium"
                    >
                      Graph API Explorer <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <Input 
                    type="password"
                    value={formData.page_access_token}
                    onChange={e => setFormData({...formData, page_access_token: e.target.value})}
                    placeholder="EAA..." 
                    className="text-sm font-mono"
                  />
                  <p className="text-[11px] text-zinc-400">
                    Deve ter as permissões: <code className="bg-zinc-100 px-1 py-0.5 rounded font-mono">pages_messaging</code>, <code className="bg-zinc-100 px-1 py-0.5 rounded font-mono">pages_read_engagement</code>.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-zinc-100 pt-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-700">App ID (Opcional)</label>
                    <Input 
                      value={formData.app_id}
                      onChange={e => setFormData({...formData, app_id: e.target.value})}
                      placeholder="Ex: 3455788..." 
                      className="text-sm font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-700">App Secret (Opcional)</label>
                    <Input 
                      type="password"
                      value={formData.app_secret}
                      onChange={e => setFormData({...formData, app_secret: e.target.value})}
                      placeholder="••••••••" 
                      className="text-sm font-mono"
                    />
                  </div>
                </div>
              </CardContent>

              <CardFooter className="border-t border-zinc-100 p-4 flex flex-col sm:flex-row gap-2 justify-between items-stretch sm:items-center bg-zinc-50/50">
                {isConnected && (
                  <Button 
                    variant="outline" 
                    onClick={() => setIsEditing(false)} 
                    disabled={isSubmitting}
                    className="text-zinc-600"
                  >
                    Cancelar
                  </Button>
                )}
                <Button 
                  className="sm:ml-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-xs" 
                  onClick={handleSaveClick} 
                  disabled={isSubmitting || isTesting}
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Facebook className="w-4 h-4 mr-2" />}
                  {isConnected ? "Salvar Alterações" : "Salvar Configuração"}
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Card Webhook */}
          <Card className="border-zinc-200/80 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-zinc-800">
                <Webhook className="w-4 h-4 text-blue-600" />
                Configuração do Webhook da Meta
              </CardTitle>
              <CardDescription className="text-xs">Configure estas credenciais no Painel de Desenvolvedores da Meta.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-zinc-500 uppercase">Callback URL</label>
                <div className="flex gap-2">
                  <Input readOnly value={webhookUrl} className="bg-zinc-50 font-mono text-xs truncate flex-1" />
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(webhookUrl)} className="shrink-0 text-xs">Copiar</Button>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-zinc-500 uppercase">Verify Token</label>
                <div className="flex gap-2">
                  <Input readOnly value={verifyToken} className="bg-zinc-50 font-mono text-xs truncate flex-1" />
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(verifyToken)} className="shrink-0 text-xs">Copiar</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Barra Lateral: Status & Guia */}
        <div className="space-y-6">
          <Card className="bg-blue-50/60 border-blue-200/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 text-blue-900">
                <ShieldCheck className="w-4 h-4 text-blue-600" /> Status da Conexão
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {isConnected ? (
                <>
                  <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    Página Conectada à Plataforma
                  </div>
                  {diagnostic?.validation?.valid ? (
                    <div className="space-y-1.5 text-zinc-700 bg-white/90 p-3 rounded-xl border border-blue-100 shadow-2xs">
                      <p><strong>Página:</strong> {diagnostic.validation.pageName || 'Detectada'}</p>
                      <p><strong>Permissão Mensagens:</strong> {diagnostic.validation.hasMessaging ? <span className="text-emerald-600 font-bold">Ativa (OK)</span> : <span className="text-amber-600 font-bold">Ausente</span>}</p>
                      <p><strong>Webhook Subscrito:</strong> {diagnostic.subscribed ? <span className="text-emerald-600 font-bold">Sim</span> : <span className="text-amber-600 font-bold">Pendente</span>}</p>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="flex items-start gap-2 text-zinc-600 text-xs">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  Pendente: Configure a sua Página e Page Access Token para ativar a IA no Messenger.
                </div>
              )}
            </CardContent>
          </Card>

          <div className="p-4 bg-white border border-zinc-200 rounded-xl space-y-3 shadow-2xs">
            <h3 className="text-xs font-bold uppercase text-zinc-500">Como Gerar o Token</h3>
            <ol className="text-xs text-zinc-600 space-y-2 list-decimal pl-4 leading-relaxed">
              <li>Aceda ao <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline font-medium">Meta Graph API Explorer</a>.</li>
              <li>Selecione a sua <strong>Aplicação Meta</strong>.</li>
              <li>No campo <strong>User or Page</strong>, escolha a sua <strong>Página do Facebook</strong>.</li>
              <li>Em <strong>Add Permissions</strong>, adicione:
                <ul className="list-disc pl-4 mt-0.5 space-y-0.5 text-zinc-500 font-mono text-[10px]">
                  <li>pages_messaging</li>
                  <li>pages_read_engagement</li>
                  <li>pages_show_list</li>
                </ul>
              </li>
              <li>Gere o token e guarde nas configurações.</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Modal de confirmação com palavra-passe */}
      <PasswordConfirmationModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        onConfirm={confirmCredentialAccess}
        title="Desbloquear Credenciais Facebook"
        description="Por motivos de segurança, introduza a sua palavra-passe de acesso ao Orion para visualizar ou copiar credenciais da Meta."
        actionLabel="Desbloquear Credenciais"
      />
    </div>
  );
}
