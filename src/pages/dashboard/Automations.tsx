import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { 
  Zap, Plus, Power, Facebook, Instagram, Video, Mail, 
  CheckCircle2, AlertCircle, RefreshCw, Send, Sparkles, Sliders,
  Eye, EyeOff, Copy, Pencil, Lock, Key, ShieldCheck, Loader2
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PasswordConfirmationModal } from "@/src/components/auth/PasswordConfirmationModal";

export default function Automations() {
  const [activeTab, setActiveTab] = useState<'rules' | 'social' | 'email'>('rules');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Regras de automações
  const [automations, setAutomations] = useState<any[]>([]);
  const [newAuto, setNewAuto] = useState({
    name: "",
    type: "lead_capture",
    keywords: "",
    reply_text: ""
  });

  // Configurações de Redes Sociais
  const [fbConfig, setFbConfig] = useState({
    comment_automation_enabled: false,
    comment_private_reply: true,
    comment_prompt: "",
    page_id: ""
  });
  const [igConfig, setIgConfig] = useState({
    comment_automation_enabled: false,
    comment_prompt: "",
    instagram_account_id: ""
  });
  const [ttConfig, setTtConfig] = useState({
    comment_automation_enabled: false,
    comment_prompt: "",
    display_name: "",
    is_connected: false,
    client_key: "",
    client_secret: ""
  });

  // Configurações de E-mail Inbox
  const [emailConfig, setEmailConfig] = useState({
    imap_host: "",
    imap_port: 993,
    imap_user: "",
    imap_password: "",
    imap_tls: true,
    smtp_host: "",
    smtp_port: 587,
    smtp_user: "",
    smtp_password: "",
    smtp_from: "",
    automation_enabled: false,
    auto_reply_prompt: "",
    is_active: false
  });
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [showImapPass, setShowImapPass] = useState(false);
  const [showSmtpPass, setShowSmtpPass] = useState(false);
  const [isEmailPasswordModalOpen, setIsEmailPasswordModalOpen] = useState(false);

  useEffect(() => {
    fetchAutomations();
    fetchSocialConfigs();
    fetchEmailConfig();
  }, []);

  const getAuthHeaders = () => ({
    "Authorization": `Bearer ${localStorage.getItem("token")}`,
    "Content-Type": "application/json"
  });

  const fetchAutomations = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/automations", { headers: getAuthHeaders() });
      if (response.ok) {
        const data = await response.json();
        setAutomations(Array.isArray(data) ? data : []);
      }
    } catch {
      toast.error("Erro ao carregar regras de automação.");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSocialConfigs = async () => {
    try {
      // Facebook
      const fbRes = await fetch("/api/facebook/config", { headers: getAuthHeaders() });
      if (fbRes.ok) {
        const fbData = await fbRes.json();
        if (fbData) {
          setFbConfig(prev => ({
            ...prev,
            comment_automation_enabled: !!fbData.comment_automation_enabled,
            comment_private_reply: fbData.comment_private_reply !== false,
            comment_prompt: fbData.comment_prompt || "",
            page_id: fbData.page_id || ""
          }));
        }
      }

      // Instagram
      const igRes = await fetch("/api/instagram/config", { headers: getAuthHeaders() });
      if (igRes.ok) {
        const igData = await igRes.json();
        if (igData) {
          setIgConfig(prev => ({
            ...prev,
            comment_automation_enabled: !!igData.comment_automation_enabled,
            comment_prompt: igData.comment_prompt || "",
            instagram_account_id: igData.instagram_account_id || ""
          }));
        }
      }

      // TikTok
      const ttRes = await fetch("/api/tiktok/config", { headers: getAuthHeaders() });
      if (ttRes.ok) {
        const ttData = await ttRes.json();
        if (ttData) {
          setTtConfig({
            comment_automation_enabled: !!ttData.comment_automation_enabled,
            comment_prompt: ttData.comment_prompt || "",
            display_name: ttData.display_name || "",
            is_connected: !!ttData.display_name,
            client_key: ttData.client_key || "",
            client_secret: ""
          });
        }
      }
    } catch (err) {
      console.warn("Aviso ao carregar redes sociais:", err);
    }
  };

  const fetchEmailConfig = async () => {
    try {
      const res = await fetch("/api/email-inbox/config", { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data) {
          setEmailConfig(prev => ({
            ...prev,
            ...data,
            imap_password: data.imap_password || prev.imap_password || "",
            smtp_password: data.smtp_password || prev.smtp_password || "",
          }));
          if (data.is_active && data.imap_host) {
            setIsEditingEmail(false);
          } else {
            setIsEditingEmail(true);
          }
        } else {
          setIsEditingEmail(true);
        }
      }
    } catch (err) {
      console.warn("Aviso ao carregar config de e-mail:", err);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const config = {
        keywords: newAuto.keywords.split(",").map(k => k.trim()),
        reply_text: newAuto.reply_text
      };

      const response = await fetch("/api/automations", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ name: newAuto.name, type: newAuto.type, config })
      });

      if (!response.ok) throw new Error("Erro ao criar");
      
      toast.success("Automação criada!");
      setIsModalOpen(false);
      setNewAuto({ name: "", type: "lead_capture", keywords: "", reply_text: "" });
      fetchAutomations();
    } catch {
      toast.error("Erro ao criar automação.");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleRuleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      await fetch(`/api/automations/${id}/toggle`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: newStatus })
      });
      fetchAutomations();
    } catch {
      toast.error("Erro ao alterar status.");
    }
  };

  const handleSaveSocialConfig = async (platform: 'fb' | 'ig' | 'tt') => {
    try {
      if (platform === 'fb') {
        const res = await fetch("/api/facebook/comment-automation", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            enabled: fbConfig.comment_automation_enabled,
            private_reply: fbConfig.comment_private_reply,
            prompt: fbConfig.comment_prompt
          })
        });
        if (res.ok) toast.success("Automação do Facebook atualizada!");
        else toast.error("Configure primeiro a página de Facebook na aba Facebook.");
      } else if (platform === 'ig') {
        const res = await fetch("/api/instagram/comment-automation", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            enabled: igConfig.comment_automation_enabled,
            prompt: igConfig.comment_prompt
          })
        });
        if (res.ok) toast.success("Automação do Instagram atualizada!");
        else toast.error("Configure primeiro a conta de Instagram na aba Instagram.");
      } else if (platform === 'tt') {
        const res = await fetch("/api/tiktok/comment-automation", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            enabled: ttConfig.comment_automation_enabled,
            prompt: ttConfig.comment_prompt
          })
        });
        if (res.ok) toast.success("Automação do TikTok atualizada!");
        else toast.error("Erro ao atualizar TikTok.");
      }
    } catch {
      toast.error("Erro ao salvar configuração.");
    }
  };

  const handleSaveEmailConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailConfig.imap_host || !emailConfig.imap_user || !emailConfig.imap_password) {
      toast.error("Host, Usuário e Senha IMAP são obrigatórios.");
      return;
    }

    if (emailConfig.is_active) {
      // Requer palavra-passe para editar dados existentes
      setIsEmailPasswordModalOpen(true);
    } else {
      executeSaveEmailConfig();
    }
  };

  const executeSaveEmailConfig = async (password?: string) => {
    setIsTestingEmail(true);
    try {
      const res = await fetch("/api/email-inbox/config", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...emailConfig,
          password
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha na conexão");
      toast.success(data.message || "Caixa de entrada configurada e testada com sucesso!");
      setIsEmailPasswordModalOpen(false);
      setIsEditingEmail(false);
      fetchEmailConfig();
    } catch (err: any) {
      toast.error(`Falha: ${err.message}`);
      throw err;
    } finally {
      setIsTestingEmail(false);
    }
  };

  const handleToggleEmailAutomation = async () => {
    try {
      const newStatus = !emailConfig.automation_enabled;
      const res = await fetch("/api/email-inbox/toggle", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ enabled: newStatus })
      });
      if (res.ok) {
        setEmailConfig(prev => ({ ...prev, automation_enabled: newStatus }));
        toast.success(newStatus ? "Automação de e-mail ativada!" : "Automação de e-mail desativada.");
      }
    } catch {
      toast.error("Erro ao alternar status do e-mail.");
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
            <Zap className="w-6 h-6 text-emerald-600" />
            Central de Automações & IA
          </h2>
          <p className="text-zinc-500 text-sm">
            Automatize conversas, comentários em redes sociais e respostas por e-mail com inteligência artificial.
          </p>
        </div>

        {activeTab === 'rules' && (
          <Button onClick={() => setIsModalOpen(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700 shadow-sm">
            <Plus className="w-4 h-4" /> Nova Regra
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-zinc-200">
        <button
          onClick={() => setActiveTab('rules')}
          className={`flex items-center gap-2 py-3 px-4 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'rules'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-zinc-500 hover:text-zinc-800'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Regras & Palavras-chave
        </button>

        <button
          onClick={() => setActiveTab('social')}
          className={`flex items-center gap-2 py-3 px-4 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'social'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-zinc-500 hover:text-zinc-800'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-500" />
          Comentários (Facebook, Instagram & TikTok)
        </button>

        <button
          onClick={() => setActiveTab('email')}
          className={`flex items-center gap-2 py-3 px-4 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'email'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-zinc-500 hover:text-zinc-800'
          }`}
        >
          <Mail className="w-4 h-4" />
          E-mail Inbox (IMAP / SMTP)
        </button>
      </div>

      {/* TAB 1: Regras e Palavras-chave */}
      {activeTab === 'rules' && (
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
                  className={`h-8 w-8 ${auto.status === 'active' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
                  onClick={() => toggleRuleStatus(auto.id, auto.status)}
                >
                  <Power className="w-4 h-4" />
                </Button>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-zinc-500 space-y-2">
                  <p><span className="font-bold text-zinc-700">Gatilhos:</span> {auto.config?.keywords?.join(", ")}</p>
                  {auto.config?.reply_text && (
                    <p className="line-clamp-2 italic bg-zinc-50 p-2 rounded border border-zinc-100">
                      "{auto.config.reply_text}"
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {automations.length === 0 && !isLoading && (
            <div className="col-span-full py-16 text-center border-2 border-dashed border-zinc-200 rounded-2xl bg-zinc-50/50">
              <Zap className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
              <p className="text-zinc-500 font-medium">Nenhuma regra de automação configurada ainda.</p>
              <Button variant="ghost" className="text-emerald-600 hover:text-emerald-700 underline mt-2" onClick={() => setIsModalOpen(true)}>
                Criar minha primeira automação
              </Button>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Redes Sociais & Comentários */}
      {activeTab === 'social' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Card Facebook */}
          <Card className="border-zinc-200 shadow-sm flex flex-col justify-between">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                    <Facebook className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Facebook Pages</CardTitle>
                    <CardDescription className="text-xs">Comentários em Posts</CardDescription>
                  </div>
                </div>
                {fbConfig.page_id ? (
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">Conectado</span>
                ) : (
                  <span className="text-[10px] bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full">Não Configurado</span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-xs text-zinc-500">
                A IA monitora comentários nas publicações da sua Página e responde de forma instantânea e personalizada.
              </p>

              <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-lg border border-zinc-100">
                <span className="font-medium text-xs text-zinc-700">Auto-responder comentários</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  checked={fbConfig.comment_automation_enabled}
                  onChange={e => setFbConfig({ ...fbConfig, comment_automation_enabled: e.target.checked })}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-lg border border-zinc-100">
                <span className="font-medium text-xs text-zinc-700">Enviar resposta privada no Messenger</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  checked={fbConfig.comment_private_reply}
                  onChange={e => setFbConfig({ ...fbConfig, comment_private_reply: e.target.checked })}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Tom / Instrução para Comentários (opcional)</Label>
                <textarea
                  className="w-full text-xs p-2 rounded-md border border-zinc-200 focus:ring-2 focus:ring-blue-500 min-h-[60px]"
                  placeholder="Ex: Seja amigável, agradeça o comentário e convide para enviar mensagem privada."
                  value={fbConfig.comment_prompt}
                  onChange={e => setFbConfig({ ...fbConfig, comment_prompt: e.target.value })}
                />
              </div>
            </CardContent>
            <CardFooter className="border-t pt-3">
              <Button onClick={() => handleSaveSocialConfig('fb')} className="w-full bg-blue-600 hover:bg-blue-700 text-xs gap-2">
                <CheckCircle2 className="w-3.5 h-3.5" /> Salvar Facebook
              </Button>
            </CardFooter>
          </Card>

          {/* Card Instagram */}
          <Card className="border-zinc-200 shadow-sm flex flex-col justify-between">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-pink-50 flex items-center justify-center text-pink-600">
                    <Instagram className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Instagram</CardTitle>
                    <CardDescription className="text-xs">Posts & Reels</CardDescription>
                  </div>
                </div>
                {igConfig.instagram_account_id ? (
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">Conectado</span>
                ) : (
                  <span className="text-[10px] bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full">Não Configurado</span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-xs text-zinc-500">
                A IA responde automaticamente a dúvidas, elogios ou pedidos de preço deixados em comentários do Instagram.
              </p>

              <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-lg border border-zinc-100">
                <span className="font-medium text-xs text-zinc-700">Auto-responder comentários</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-zinc-300 text-pink-600 focus:ring-pink-500 cursor-pointer"
                  checked={igConfig.comment_automation_enabled}
                  onChange={e => setIgConfig({ ...igConfig, comment_automation_enabled: e.target.checked })}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Tom / Instrução para Comentários (opcional)</Label>
                <textarea
                  className="w-full text-xs p-2 rounded-md border border-zinc-200 focus:ring-2 focus:ring-pink-500 min-h-[60px]"
                  placeholder="Ex: Use emojis, mantenha as respostas curtas e chame para o Direct."
                  value={igConfig.comment_prompt}
                  onChange={e => setIgConfig({ ...igConfig, comment_prompt: e.target.value })}
                />
              </div>
            </CardContent>
            <CardFooter className="border-t pt-3">
              <Button onClick={() => handleSaveSocialConfig('ig')} className="w-full bg-pink-600 hover:bg-pink-700 text-xs gap-2">
                <CheckCircle2 className="w-3.5 h-3.5" /> Salvar Instagram
              </Button>
            </CardFooter>
          </Card>

          {/* Card TikTok */}
          <Card className="border-zinc-200 shadow-sm flex flex-col justify-between">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-zinc-900 flex items-center justify-center text-white">
                    <Video className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base">TikTok for Business</CardTitle>
                    <CardDescription className="text-xs">Comentários em Vídeos</CardDescription>
                  </div>
                </div>
                {ttConfig.is_connected ? (
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">{ttConfig.display_name || "Conectado"}</span>
                ) : (
                  <span className="text-[10px] bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full">Pronto para Conectar</span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-xs text-zinc-500">
                Integração via TikTok Business API com verificação a cada 2 minutos e respostas contextuais via IA.
              </p>

              <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-lg border border-zinc-100">
                <span className="font-medium text-xs text-zinc-700">Auto-responder comentários em vídeos</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                  checked={ttConfig.comment_automation_enabled}
                  onChange={e => setTtConfig({ ...ttConfig, comment_automation_enabled: e.target.checked })}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Instrução para TikTok (opcional)</Label>
                <textarea
                  className="w-full text-xs p-2 rounded-md border border-zinc-200 focus:ring-2 focus:ring-zinc-900 min-h-[60px]"
                  placeholder="Ex: Respostas jovens e dinâmicas, no máximo 1 frase objetiva."
                  value={ttConfig.comment_prompt}
                  onChange={e => setTtConfig({ ...ttConfig, comment_prompt: e.target.value })}
                />
              </div>
            </CardContent>
            <CardFooter className="border-t pt-3 flex flex-col gap-2">
              <Button onClick={() => handleSaveSocialConfig('tt')} className="w-full bg-zinc-900 hover:bg-zinc-800 text-white text-xs gap-2">
                <CheckCircle2 className="w-3.5 h-3.5" /> Salvar TikTok
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* TAB 3: E-mail Inbox (IMAP / SMTP) */}
      {activeTab === 'email' && (
        <>
          {emailConfig.is_active && !isEditingEmail ? (
            /* PAINEL DE PRÉ-VISUALIZAÇÃO DE E-MAIL CONECTADO */
            <Card className="border-zinc-200/90 shadow-sm overflow-hidden">
              <CardHeader className="bg-zinc-50/50 border-b border-zinc-100 pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base text-zinc-900 flex items-center gap-2">
                        Caixa de Entrada Corporativa Conectada
                      </CardTitle>
                      <CardDescription className="text-xs flex items-center gap-1.5 mt-0.5 text-emerald-600 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Conexão Ativa & Integrada com a IA
                      </CardDescription>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-600 hidden sm:inline">Auto-resposta:</span>
                    <Button
                      type="button"
                      size="sm"
                      variant={emailConfig.automation_enabled ? "default" : "outline"}
                      className={`text-xs font-semibold ${emailConfig.automation_enabled ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}`}
                      onClick={handleToggleEmailAutomation}
                    >
                      <Power className="w-3.5 h-3.5 mr-1" />
                      {emailConfig.automation_enabled ? "Ativada" : "Desativada"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditingEmail(true)}
                      className="text-xs font-semibold text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1.5" />
                      Editar Parâmetros
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-6 space-y-6">
                <div className="flex items-center justify-between border-b border-zinc-200 pb-2">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-700">
                      Pré-visualização de Credenciais & Servidores de Correio
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Edição Requer Palavra-passe</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Bloco IMAP (Recepção) */}
                  <div className="p-4 rounded-xl bg-zinc-50/80 border border-zinc-200/90 space-y-3">
                    <h4 className="font-semibold text-xs text-zinc-900 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5 text-blue-600" /> Recepção de E-mails (IMAP)
                      </span>
                      <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded bg-blue-100/60 text-blue-800">
                        Porta {emailConfig.imap_port} {emailConfig.imap_tls ? "(TLS/SSL)" : ""}
                      </span>
                    </h4>

                    <div className="space-y-2 text-xs">
                      <div className="bg-white p-2.5 rounded-lg border border-zinc-200/80">
                        <span className="text-[11px] text-zinc-400 block font-medium">Servidor IMAP (Host)</span>
                        <span className="font-mono font-bold text-zinc-800 select-all">{emailConfig.imap_host || "Não configurado"}</span>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border border-zinc-200/80 flex items-center justify-between">
                        <div className="min-w-0 pr-2">
                          <span className="text-[11px] text-zinc-400 block font-medium">Usuário / E-mail</span>
                          <span className="font-mono font-bold text-zinc-800 truncate block select-all">{emailConfig.imap_user || "Não configurado"}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => { navigator.clipboard.writeText(emailConfig.imap_user); toast.success("Copiado!"); }}
                          className="h-6 w-6 text-zinc-400 hover:text-zinc-700 shrink-0"
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border border-zinc-200/80 flex items-center justify-between">
                        <div className="min-w-0 pr-2">
                          <span className="text-[11px] text-zinc-400 block font-medium">Senha IMAP / App Password</span>
                          <span className="font-mono text-zinc-800 font-semibold truncate block select-all">
                            {showImapPass 
                              ? (emailConfig.imap_password || "••••••••••••") 
                              : (emailConfig.imap_password ? "••••••••••••••••" : "••••••••••••")}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setShowImapPass(!showImapPass)}
                            className="p-1 text-zinc-400 hover:text-zinc-700 rounded hover:bg-zinc-100"
                            title={showImapPass ? "Ocultar" : "Mostrar"}
                          >
                            {showImapPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => { navigator.clipboard.writeText(emailConfig.imap_password); toast.success("Copiado!"); }}
                            className="h-6 w-6 text-zinc-400 hover:text-zinc-700"
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bloco SMTP (Envio) */}
                  <div className="p-4 rounded-xl bg-zinc-50/80 border border-zinc-200/90 space-y-3">
                    <h4 className="font-semibold text-xs text-zinc-900 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Send className="w-3.5 h-3.5 text-emerald-600" /> Envio de Respostas (SMTP)
                      </span>
                      <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded bg-emerald-100/60 text-emerald-800">
                        Porta {emailConfig.smtp_port}
                      </span>
                    </h4>

                    <div className="space-y-2 text-xs">
                      <div className="bg-white p-2.5 rounded-lg border border-zinc-200/80">
                        <span className="text-[11px] text-zinc-400 block font-medium">Servidor SMTP (Host)</span>
                        <span className="font-mono font-bold text-zinc-800 select-all">{emailConfig.smtp_host || emailConfig.imap_host || "Não configurado"}</span>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border border-zinc-200/80 flex items-center justify-between">
                        <div className="min-w-0 pr-2">
                          <span className="text-[11px] text-zinc-400 block font-medium">Remetente (From) / Usuário</span>
                          <span className="font-mono font-bold text-zinc-800 truncate block select-all">
                            {emailConfig.smtp_from || emailConfig.smtp_user || emailConfig.imap_user || "Não configurado"}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => { navigator.clipboard.writeText(emailConfig.smtp_from || emailConfig.smtp_user || ""); toast.success("Copiado!"); }}
                          className="h-6 w-6 text-zinc-400 hover:text-zinc-700 shrink-0"
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border border-zinc-200/80 flex items-center justify-between">
                        <div className="min-w-0 pr-2">
                          <span className="text-[11px] text-zinc-400 block font-medium">Senha SMTP</span>
                          <span className="font-mono text-zinc-800 font-semibold truncate block select-all">
                            {showSmtpPass 
                              ? (emailConfig.smtp_password || emailConfig.imap_password || "••••••••••••") 
                              : (emailConfig.smtp_password ? "••••••••••••••••" : "••••••••••••")}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setShowSmtpPass(!showSmtpPass)}
                            className="p-1 text-zinc-400 hover:text-zinc-700 rounded hover:bg-zinc-100"
                            title={showSmtpPass ? "Ocultar" : "Mostrar"}
                          >
                            {showSmtpPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => { navigator.clipboard.writeText(emailConfig.smtp_password || emailConfig.imap_password); toast.success("Copiado!"); }}
                            className="h-6 w-6 text-zinc-400 hover:text-zinc-700"
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bloco de Instruções de IA */}
                {emailConfig.auto_reply_prompt && (
                  <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200 space-y-1">
                    <span className="text-xs font-semibold text-zinc-700 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      Instruções & Tom das Respostas por IA:
                    </span>
                    <p className="text-xs text-zinc-600 italic bg-white p-3 rounded-lg border border-zinc-200/70">
                      "{emailConfig.auto_reply_prompt}"
                    </p>
                  </div>
                )}
              </CardContent>

              <CardFooter className="border-t p-4 flex items-center justify-between bg-zinc-50/50">
                <span className="text-xs text-zinc-500 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Conexão segura com criptografia TLS/SSL
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => executeSaveEmailConfig()}
                    disabled={isTestingEmail}
                    className="bg-white"
                  >
                    {isTestingEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                    Testar Conexão
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setIsEditingEmail(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs gap-1.5"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Editar Parâmetros
                  </Button>
                </div>
              </CardFooter>
            </Card>
          ) : (
            /* FORMULÁRIO DE EDIÇÃO / CONFIGURAÇÃO DE E-MAIL */
            <Card className="border-zinc-200 shadow-sm">
              <form onSubmit={handleSaveEmailConfig}>
                <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-zinc-100">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Mail className="w-5 h-5 text-emerald-600" />
                      {emailConfig.is_active ? "Editar Configuração de E-mail" : "Automação de E-mails Recebidos (Inbox Inteligente)"}
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      {emailConfig.is_active 
                        ? "Altere os parâmetros da sua caixa postal corporativa. A sua palavra-passe será exigida ao guardar."
                        : "Conecte sua caixa postal corporativa (Gmail, Outlook, Hostinger, cPanel) para a IA ler e responder e-mails recebidos."}
                    </CardDescription>
                  </div>
                  {emailConfig.is_active && (
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setIsEditingEmail(false)}
                      className="text-xs text-zinc-500"
                    >
                      Cancelar Edição
                    </Button>
                  )}
                </CardHeader>

                <CardContent className="space-y-6 pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Lado IMAP (Entrada) */}
                    <div className="space-y-4 p-4 rounded-xl bg-zinc-50/70 border border-zinc-200/80">
                      <h4 className="font-semibold text-sm text-zinc-900 flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 text-blue-600" /> Recepção de E-mails (IMAP)
                      </h4>
                      <div className="space-y-3">
                        <div>
                          <Label className="text-xs">Servidor IMAP (Host)</Label>
                          <Input
                            placeholder="Ex: imap.hostinger.com ou imap.gmail.com"
                            value={emailConfig.imap_host}
                            onChange={e => setEmailConfig({ ...emailConfig, imap_host: e.target.value })}
                            required
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Porta IMAP</Label>
                            <Input
                              type="number"
                              value={emailConfig.imap_port}
                              onChange={e => setEmailConfig({ ...emailConfig, imap_port: parseInt(e.target.value) || 993 })}
                            />
                          </div>
                          <div className="flex items-end pb-2">
                            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                              <input
                                type="checkbox"
                                className="rounded text-emerald-600"
                                checked={emailConfig.imap_tls}
                                onChange={e => setEmailConfig({ ...emailConfig, imap_tls: e.target.checked })}
                              />
                              Usar SSL/TLS (993)
                            </label>
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">Usuário / E-mail de Entrada</Label>
                          <Input
                            type="email"
                            placeholder="contato@suaempresa.com"
                            value={emailConfig.imap_user}
                            onChange={e => setEmailConfig({ ...emailConfig, imap_user: e.target.value })}
                            required
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Senha IMAP / Senha de App</Label>
                          <Input
                            type="password"
                            placeholder="••••••••••••"
                            value={emailConfig.imap_password}
                            onChange={e => setEmailConfig({ ...emailConfig, imap_password: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Lado SMTP (Envio) */}
                    <div className="space-y-4 p-4 rounded-xl bg-zinc-50/70 border border-zinc-200/80">
                      <h4 className="font-semibold text-sm text-zinc-900 flex items-center gap-2">
                        <Send className="w-4 h-4 text-emerald-600" /> Envio de Respostas (SMTP)
                      </h4>
                      <div className="space-y-3">
                        <div>
                          <Label className="text-xs">Servidor SMTP (Host)</Label>
                          <Input
                            placeholder="Ex: smtp.hostinger.com ou smtp.gmail.com"
                            value={emailConfig.smtp_host}
                            onChange={e => setEmailConfig({ ...emailConfig, smtp_host: e.target.value })}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Porta SMTP</Label>
                            <Input
                              type="number"
                              value={emailConfig.smtp_port}
                              onChange={e => setEmailConfig({ ...emailConfig, smtp_port: parseInt(e.target.value) || 587 })}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">E-mail de Remetente (From)</Label>
                            <Input
                              placeholder="Orion <contato@empresa.com>"
                              value={emailConfig.smtp_from}
                              onChange={e => setEmailConfig({ ...emailConfig, smtp_from: e.target.value })}
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">Usuário SMTP</Label>
                          <Input
                            type="email"
                            placeholder="Igual ao IMAP se em branco"
                            value={emailConfig.smtp_user}
                            onChange={e => setEmailConfig({ ...emailConfig, smtp_user: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Senha SMTP</Label>
                          <Input
                            type="password"
                            placeholder="Igual à senha IMAP se em branco"
                            value={emailConfig.smtp_password}
                            onChange={e => setEmailConfig({ ...emailConfig, smtp_password: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Prompt de E-mail */}
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      Instruções & Tom para Respostas por E-mail
                    </Label>
                    <textarea
                      className="w-full text-sm p-3 rounded-lg border border-zinc-200 focus:ring-2 focus:ring-emerald-500 min-h-[90px]"
                      placeholder="Ex: Responda de forma profissional e formal. Assine com a equipa de apoio ao cliente. Caso a dúvida seja sobre orçamentos, solicite o número de telefone para contacto imediato."
                      value={emailConfig.auto_reply_prompt}
                      onChange={e => setEmailConfig({ ...emailConfig, auto_reply_prompt: e.target.value })}
                    />
                  </div>
                </CardContent>

                <CardFooter className="border-t p-4 flex items-center justify-between bg-zinc-50/50 rounded-b-xl">
                  {emailConfig.is_active ? (
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsEditingEmail(false)}
                      className="text-zinc-600"
                    >
                      Cancelar
                    </Button>
                  ) : (
                    <div className="text-xs text-zinc-500 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      Respostas mantêm o histórico da conversa e cabeçalhos de threading.
                    </div>
                  )}

                  <Button type="submit" disabled={isTestingEmail} className="bg-emerald-600 hover:bg-emerald-700">
                    {isTestingEmail ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                        Testando & Salvando...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        {emailConfig.is_active ? "Salvar Alterações" : "Testar Conexão & Salvar"}
                      </>
                    )}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          )}
        </>
      )}

      {/* Modal Confirmação de Senha para E-mail */}
      <PasswordConfirmationModal
        isOpen={isEmailPasswordModalOpen}
        onClose={() => setIsEmailPasswordModalOpen(false)}
        onConfirm={(password) => executeSaveEmailConfig(password)}
        title="Confirmar Alteração da Caixa de E-mail"
        description="Por motivos de segurança, introduza a sua palavra-passe de acesso ao Orion para autorizar a modificação das credenciais da caixa de correio corporativa (IMAP/SMTP)."
        actionLabel="Confirmar e Salvar Credenciais"
        isLoading={isTestingEmail}
      />

      {/* Modal Nova Regra */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg shadow-2xl animate-in fade-in zoom-in-95">
            <form onSubmit={handleCreateRule}>
              <CardHeader>
                <CardTitle>Nova Regra de Automação</CardTitle>
                <CardDescription>Configure gatilhos de palavras-chave e ações automáticas.</CardDescription>
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
                  <Input placeholder="Ex: preço, valor, quanto custa, agendamento" value={newAuto.keywords} onChange={e => setNewAuto({...newAuto, keywords: e.target.value})} required />
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
                  {isLoading ? "Salvando..." : "Criar Automação"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
