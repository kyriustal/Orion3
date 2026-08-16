import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Save, Loader2, Key, User, Building2, Bot, ShieldCheck, Mail, Calendar, ExternalLink, CheckCircle2, XCircle, Clock, RefreshCw, Unlink, MessageSquare, Eye, EyeOff, Smartphone, Send } from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingGoogle, setIsTestingGoogle] = useState(false);
  const [isDisconnectingGoogle, setIsDisconnectingGoogle] = useState(false);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isTestingTelcoSMS, setIsTestingTelcoSMS] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [showTelcoKey, setShowTelcoKey] = useState(false);
  const [activeTab, setActiveTab] = useState<"personal" | "company" | "ai" | "calendar" | "sms" | "security">("personal");
  const [calendarConnected, setCalendarConnected] = useState<{ google: boolean; microsoft: boolean }>({ google: false, microsoft: false });
  const [calendarStatus, setCalendarStatus] = useState<any>(null);

  const [settings, setSettings] = useState({
    id: "",
    name: "",
    first_name: "",
    last_name: "",
    owner_email: "",
    phone: "",
    whatsapp: "",
    address: "",
    contact_person: "",
    social_object: "",
    employees_count: "",
    product_description: "",
    chatbot_name: "",
    use_emojis: true,
    emoji_mode: "moderate", // 'none' | 'moderate' | 'adaptive'
    calendar_provider: "none", // 'none' | 'microsoft' | 'google' | 'other'
    microsoft_client_id: "",
    microsoft_client_secret: "",
    calendar_link: "",
    telcosms_api_key: "",
    telcosms_sender_id: "",
    maps_link: "",
  });

  const [pwd, setPwd] = useState({ current: "", new: "", confirm: "" });
  const [isChangingPwd, setIsChangingPwd] = useState(false);

  // Detectar redirect de OAuth e mostrar feedback
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    const success = params.get('success');
    const error = params.get('error');
    const details = params.get('details');
    if (tab === 'calendar') {
      setActiveTab('calendar');
      if (success === 'google_connected') {
        toast.success('Google Calendar conectado com sucesso!');
        setCalendarConnected(prev => ({ ...prev, google: true }));
      } else if (success === 'microsoft_connected') {
        toast.success('Microsoft Calendar conectado com sucesso!');
        setCalendarConnected(prev => ({ ...prev, microsoft: true }));
      } else if (error === 'google_denied') {
        toast.error('A conexão com o Google Calendar foi cancelada.');
      } else if (error === 'microsoft_denied') {
        toast.error('A conexão com o Microsoft Calendar foi cancelada.');
      } else if (error === 'no_code') {
        toast.error('Erro na autenticação. Tente novamente.');
      } else if (error === 'credentials_missing') {
        toast.error('Credenciais do Google/Microsoft Calendar em falta. Guarde o Client ID e Client Secret antes de conectar.');
      } else if (error === 'invalid_client_secret') {
        toast.error(`Client Secret ou Client ID incorreto ${details ? `(${details})` : ''}. Verifique se copiou a chave exatamente como gerada no Google Cloud Console.`);
      } else if (error === 'redirect_uri_mismatch') {
        toast.error(`URI de redirecionamento não autorizada no Google ${details ? `(${details})` : ''}. Adicione "${window.location.origin}/api/settings/calendar/google/callback" em URIs de redirecionamento autorizadas no Google Cloud Console.`);
      } else if (error === 'invalid_grant') {
        toast.error(`O código de autorização expirou ou o token é inválido ${details ? `(${details})` : ''}. Tente conectar novamente.`);
      } else if (error === 'invalid_request') {
        toast.error(`Erro na requisição Google (Bad Request) ${details ? `(${details})` : ''}. Certifique-se de que o OAuth Client foi criado como "Aplicação Web" e que a URI de Redirecionamento está registada no Google Cloud.`);
      } else if (error === 'unauthorized_client') {
        toast.error(`Cliente Google não autorizado ${details ? `(${details})` : ''}. Verifique o Client ID no Google Cloud Console.`);
      } else if (error === 'token_exchange_failed') {
        toast.error(`Falha na autenticação com o calendário ${details ? `(${details})` : ''}. Verifique se o Client Secret e a URI de redirecionamento estão corretos.`);
      } else if (error === 'database_error') {
        toast.error(`Autenticação Google/Microsoft autorizada com sucesso, mas falhou ao gravar na base de dados (${details}). Certifique-se de que executou a migração SQL das colunas de calendário no painel do Supabase.`);
      }

      // Limpar os parâmetros da URL para evitar que a notificação persista ao recarregar a página
      if (success || error) {
        window.history.replaceState({}, document.title, window.location.pathname + '?tab=calendar');
      }
    }
  }, [location.search]);

  // Carregar definições ao montar
  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/settings/org", {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      if (!response.ok) throw new Error("Erro ao carregar configurações");
      const data = await response.json();
      setSettings(prev => ({
        ...prev,
        ...data,
        emoji_mode: data.emoji_mode || 'moderate' // garantir valor padrão
      }));

      // Buscar status do calendário
      const calRes = await fetch("/api/settings/calendar/status", {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      if (calRes.ok) {
        const calData = await calRes.json();
        setCalendarStatus(calData);
        setCalendarConnected({
          google: calData.google_connected,
          microsoft: calData.microsoft_connected
        });
        if (calData.google_direct_url && !data.google_direct_url) {
          setSettings(prev => ({ ...prev, google_direct_url: calData.google_direct_url }));
        }
        if (calData.google_user_refresh_token && !data.google_user_refresh_token) {
          setSettings(prev => ({ ...prev, google_user_refresh_token: calData.google_user_refresh_token }));
        }
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/settings/org", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify(settings)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || data.message || "Erro ao salvar configurações");
      }
      toast.success("Configurações atualizadas com sucesso!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConnectGoogleCalendar = async () => {
    setIsConnectingGoogle(true);
    try {
      if ((settings as any).calendar_provider !== 'google') {
        setSettings(prev => ({ ...prev, calendar_provider: 'google' }));
      }
      const response = await fetch("/api/settings/calendar/google/auth-url", {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      const data = await response.json();
      if (!response.ok || !data.authUrl) {
        throw new Error(data.error || "Não foi possível iniciar a conexão com o Google Calendar.");
      }
      window.location.href = data.authUrl;
    } catch (err: any) {
      toast.error(err.message || "Erro ao conectar o Google Calendar.");
    } finally {
      setIsConnectingGoogle(false);
    }
  };

  const handleTestGoogleCalendar = async () => {
    setIsTestingGoogle(true);
    try {
      const response = await fetch("/api/settings/calendar/google/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Falha no teste de conexão com o Google Calendar");
      }
      toast.success(`Google Calendar conectado com sucesso! Calendário: ${data.calendar?.summary || data.calendar?.id || 'Principal'}`);
      setCalendarConnected(prev => ({ ...prev, google: true }));
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsTestingGoogle(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    if (!window.confirm("Deseja realmente desconectar o Google Calendar? Os agendamentos automáticos deixarão de ser criados.")) {
      return;
    }
    setIsDisconnectingGoogle(true);
    try {
      const response = await fetch("/api/settings/calendar/google/disconnect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Erro ao desconectar Google Calendar");
      }
      setCalendarConnected(prev => ({ ...prev, google: false }));
      setSettings(prev => ({
        ...prev,
        google_user_refresh_token: "",
        calendar_provider: "none"
      }));
      toast.success("Google Calendar desconectado com sucesso!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsDisconnectingGoogle(false);
    }
  };

  const handleChangePwd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd.new !== pwd.confirm) {
      toast.error("As senhas não coincidem.");
      return;
    }
    if (pwd.new.length < 6) {
      toast.error("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setIsChangingPwd(true);
    try {
      const response = await fetch("/api/settings/password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ currentPassword: pwd.current, newPassword: pwd.new })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao mudar senha");

      toast.success("Senha alterada com sucesso!");
      setPwd({ current: "", new: "", confirm: "" });
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsChangingPwd(false);
    }
  };

  const handleTestTelcoSMS = async () => {
    setIsTestingTelcoSMS(true);
    try {
      const targetPhone = testPhone || settings.whatsapp || settings.phone;
      if (!targetPhone) {
        toast.error("Por favor, introduza um número de telemóvel para receber o SMS de teste.");
        return;
      }
      const response = await fetch("/api/settings/telcosms/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          apiKey: (settings as any).telcosms_api_key,
          senderId: (settings as any).telcosms_sender_id,
          phone: targetPhone
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Falha ao enviar SMS de teste.");
      }
      toast.success("SMS de teste enviado com sucesso via TelcoSMS!");
    } catch (err: any) {
      toast.error(err.message || "Erro no teste de SMS.");
    } finally {
      setIsTestingTelcoSMS(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const tabs = [
    { id: "personal", label: "Dados Pessoais", icon: User },
    { id: "company", label: "Empresa", icon: Building2 },
    { id: "ai", label: "Chatbot (IA)", icon: Bot },
    { id: "calendar", label: "Calendário", icon: Calendar },
    { id: "sms", label: "SMS (TelcoSMS)", icon: MessageSquare },
    { id: "security", label: "Segurança", icon: ShieldCheck },
  ] as const;

  return (
    <div className="space-y-6 max-w-5xl pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Configurações</h2>
          <p className="text-zinc-500">Gerencie sua conta e as preferências da Orion.</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving || activeTab === 'security'} className="bg-emerald-600 hover:bg-emerald-700 h-11 px-8">
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar Dados
        </Button>
      </div>

      <div className="flex gap-1 p-1 bg-zinc-100 rounded-xl w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === tab.id
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200"
              }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {activeTab === "personal" && (
          <Card className="shadow-sm border-zinc-200 max-w-2xl">
            <CardHeader>
              <CardTitle>Seu Perfil</CardTitle>
              <CardDescription>Informações básicas de acesso e contato.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">Nome</Label>
                  <Input id="first_name" value={settings.first_name || ""} onChange={(e) => setSettings({ ...settings, first_name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Sobrenome</Label>
                  <Input id="last_name" value={settings.last_name || ""} onChange={(e) => setSettings({ ...settings, last_name: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail (Login)</Label>
                <div className="flex items-center gap-2">
                  <Input id="email" value={settings.owner_email || ""} readOnly className="bg-zinc-50 text-zinc-500 cursor-not-allowed" />
                  <Mail className="w-4 h-4 text-zinc-400" />
                </div>
                <p className="text-[10px] text-zinc-400 italic">O e-mail de login não pode ser alterado diretamente.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone / WhatsApp</Label>
                <Input id="phone" value={settings.phone || ""} onChange={(e) => setSettings({ ...settings, phone: e.target.value })} />
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "company" && (
          <Card className="shadow-sm border-zinc-200 max-w-2xl">
            <CardHeader>
              <CardTitle>Dados do Negócio</CardTitle>
              <CardDescription>
                Informações da sua empresa utilizadas pelo assistente IA, mensagens de WhatsApp, e-mails e SMS.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome da Empresa</Label>
                <Input
                  id="name"
                  placeholder="Ex: Minha Empresa Lda"
                  value={settings.name || ""}
                  onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                />
                <p className="text-xs text-zinc-400">
                  Este é o nome oficial exibido nos e-mails, SMS e nas respostas da Inteligência Artificial.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="whatsapp">WhatsApp Comercial</Label>
                  <Input
                    id="whatsapp"
                    placeholder="Ex: +258 84 123 4567"
                    value={settings.whatsapp || ""}
                    onChange={(e) => setSettings({ ...settings, whatsapp: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone de Contacto (Fixo/Móvel)</Label>
                  <Input
                    id="phone"
                    placeholder="Ex: +258 21 123 456"
                    value={settings.phone || ""}
                    onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact">Pessoa de Contato / Resp.</Label>
                <Input
                  id="contact"
                  placeholder="Ex: Carlos Silva (Gerente)"
                  value={settings.contact_person || ""}
                  onChange={(e) => setSettings({ ...settings, contact_person: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Sede / Endereço Físico</Label>
                <Input
                  id="address"
                  placeholder="Ex: Av. Julius Nyerere, nº 123, Maputo"
                  value={settings.address || ""}
                  onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="maps_link">Link da Localização no Google Maps</Label>
                  {settings.maps_link && (
                    <a
                      href={settings.maps_link.startsWith('http') ? settings.maps_link : `https://${settings.maps_link}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                    >
                      Testar no Google Maps <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <Input
                  id="maps_link"
                  placeholder="Ex: https://maps.app.goo.gl/xxxx ou https://google.com/maps?q=..."
                  value={settings.maps_link || ""}
                  onChange={(e) => setSettings({ ...settings, maps_link: e.target.value })}
                />
                <p className="text-xs text-zinc-400">
                  A IA enviará este link como texto clicável <strong>"Localizar no Google Maps"</strong> no WhatsApp, e-mails e SMS.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="social">Ramo de Atividade</Label>
                  <Input
                    id="social"
                    placeholder="Ex: Consultoria / Saúde / Tecnologia"
                    value={settings.social_object || ""}
                    onChange={(e) => setSettings({ ...settings, social_object: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employees">Escala (Funcionários)</Label>
                  <Input
                    id="employees"
                    placeholder="Ex: 10-50 colaboradores"
                    value={settings.employees_count || ""}
                    onChange={(e) => setSettings({ ...settings, employees_count: e.target.value })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "ai" && (
          <Card className="shadow-sm border-zinc-200 max-w-2xl">
            <CardHeader>
              <CardTitle>Personalidade do Gemini</CardTitle>
              <CardDescription>Configure como a IA deve agir e o que ela deve saber.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="chatbot_name">Nome do Bot</Label>
                <Input id="chatbot_name" value={settings.chatbot_name || ""} onChange={(e) => setSettings({ ...settings, chatbot_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">Descrição do Produto/Serviço (Base de Conhecimento)</Label>
                <textarea
                  id="desc"
                  rows={5}
                  className="flex w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  value={settings.product_description || ""}
                  onChange={(e) => setSettings({ ...settings, product_description: e.target.value })}
                  placeholder="Descreva o que seu negócio faz, preços, horários e políticas..."
                />
              </div>
              <div className="space-y-3 border-t border-zinc-100 pt-4">
                <Label>Modo de Emojis da IA</Label>
                <p className="text-xs text-zinc-500">Controla como a IA usa emojis ao responder os clientes.</p>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    {
                      id: "none",
                      label: "🚫 Não usar emojis",
                      desc: "A IA responde de forma puramente textual, sem emojis. Ideal para contextos formais e corporativos."
                    },
                    {
                      id: "moderate",
                      label: "😊 Uso moderado",
                      desc: "A IA usa emojis com parcimónia para humanizar as respostas, sem exagerar."
                    },
                    {
                      id: "adaptive",
                      label: "🎯 Conforme o perfil do cliente",
                      desc: "A IA analisa o estilo do cliente. Só usa emojis se o cliente usar emojis, após 5-10 mensagens de conversa."
                    }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSettings({ ...settings, emoji_mode: opt.id })}
                      className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                        (settings as any).emoji_mode === opt.id
                          ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                          : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
                      }`}
                    >
                      <div className={`w-4 h-4 mt-0.5 rounded-full border-2 flex-shrink-0 ${
                        (settings as any).emoji_mode === opt.id
                          ? 'border-emerald-500 bg-emerald-500'
                          : 'border-zinc-300'
                      }`} />
                      <div>
                        <p className={`text-sm font-medium ${ (settings as any).emoji_mode === opt.id ? 'text-emerald-800' : 'text-zinc-800' }`}>
                          {opt.label}
                        </p>
                        <p className="text-xs text-zinc-500 mt-0.5">{opt.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 border-t border-zinc-100 pt-4">
                <Label>Coexistência (API + Humano)</Label>
                <p className="text-xs text-zinc-500">Define como a IA se comporta quando um atendente humano interage.</p>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    {
                      id: "auto",
                      label: "🤖 100% Automático",
                      desc: "A IA responde a todas as mensagens, mesmo que um humano esteja a falar."
                    },
                    {
                      id: "hybrid",
                      label: "🤝 Modo Híbrido (Proativo)",
                      desc: "A IA pausa por 5 minutos se você responder. Se o cliente falar e você não responder em 5 minutos, a IA assume proativamente."
                    },
                    {
                      id: "transfer",
                      label: "📞 Apenas sob demanda",
                      desc: "A IA só responde até o momento em que o cliente pede para falar com um humano."
                    }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSettings({ ...settings, handover_mode: opt.id } as any)}
                      className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                        (settings as any).handover_mode === opt.id || (!(settings as any).handover_mode && opt.id === 'hybrid')
                          ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                          : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
                      }`}
                    >
                      <div className={`w-4 h-4 mt-0.5 rounded-full border-2 flex-shrink-0 ${
                        (settings as any).handover_mode === opt.id || (!(settings as any).handover_mode && opt.id === 'hybrid')
                          ? 'border-emerald-500 bg-emerald-500'
                          : 'border-zinc-300'
                      }`} />
                      <div>
                        <p className={`text-sm font-medium ${ ((settings as any).handover_mode === opt.id || (!(settings as any).handover_mode && opt.id === 'hybrid')) ? 'text-emerald-800' : 'text-zinc-800' }`}>
                          {opt.label}
                        </p>
                        <p className="text-xs text-zinc-500 mt-0.5">{opt.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "calendar" && (
          <div className="space-y-6 max-w-2xl">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl px-4 py-3">
              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-blue-800">Calendário para Agendamentos Automáticos</p>
                  <p className="text-xs text-blue-600 mt-1">
                    Quando a IA ou um atendente humano marcar um agendamento com um cliente, os eventos serão criados automaticamente no calendário selecionado.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {/* Microsoft Outlook / Teams */}
              <div
                onClick={() => setSettings({ ...settings, calendar_provider: 'microsoft' })}
                className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  (settings as any).calendar_provider === 'microsoft'
                    ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                    : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
                }`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 transition-all ${
                  (settings as any).calendar_provider === 'microsoft' ? 'border-blue-500 bg-blue-500' : 'border-zinc-300'
                }`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🪟</span>
                    <p className={`text-sm font-semibold ${ (settings as any).calendar_provider === 'microsoft' ? 'text-blue-800' : 'text-zinc-800' }`}>
                      Microsoft Outlook / Teams
                    </p>
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">Crie eventos no Outlook, Teams e Calendário Microsoft 365.</p>
                </div>
                {(settings as any).calendar_provider === 'microsoft' && (
                  <div className="flex flex-col items-end gap-2">
                    {calendarConnected.microsoft ? (
                      <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Conectado
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
                        <XCircle className="w-3.5 h-3.5" />
                        Não conectado
                      </div>
                    )}
                    <Button
                      size="sm"
                      className={`text-xs h-7 gap-1.5 ${
                        calendarConnected.microsoft
                          ? 'bg-zinc-600 hover:bg-zinc-700'
                          : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                      onClick={async (e) => {
                        e.stopPropagation();
                        const clientId = ((settings as any).microsoft_client_id || '').trim();
                        const clientSecret = ((settings as any).microsoft_client_secret || '').trim();
                        if (!clientId || !clientSecret) {
                          toast.error("Por favor, introduza o Microsoft Client ID e o Client Secret nos campos abaixo antes de conectar.");
                          return;
                        }
                        try {
                          await handleSave();
                        } catch (_) {
                          toast.error("Erro ao guardar credenciais antes de conectar. Tente novamente.");
                          return;
                        }
                        const redirectUri = `${window.location.origin}/api/settings/calendar/microsoft/callback`;
                        let targetOrgId = (settings as any).id;
                        if (!targetOrgId) {
                          try {
                            const token = localStorage.getItem("token");
                            if (token) {
                              const payload = JSON.parse(atob(token.split('.')[1]));
                              targetOrgId = payload.orgId || payload.id;
                            }
                          } catch (_) {}
                        }
                        const stateObj = { id: targetOrgId || '', redirectUri };
                        const state = encodeURIComponent(btoa(JSON.stringify(stateObj)));
                        const msAuthUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${encodeURIComponent(clientId)}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=Calendars.ReadWrite&state=${state}`;
                        const win = window.open(msAuthUrl, '_blank');
                        if (!win || win.closed || typeof win.closed === 'undefined') {
                          window.location.href = msAuthUrl;
                        }
                      }}
                    >
                      <ExternalLink className="w-3 h-3" />
                      {calendarConnected.microsoft ? 'Reconectar' : 'Conectar conta Microsoft'}
                    </Button>
                  </div>
                )}
              </div>

              {/* Google Calendar */}
              <div
                onClick={() => setSettings({ ...settings, calendar_provider: 'google' })}
                className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  (settings as any).calendar_provider === 'google'
                    ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                    : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
                }`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 transition-all ${
                  (settings as any).calendar_provider === 'google' ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-300'
                }`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">📅</span>
                    <p className={`text-sm font-semibold ${ (settings as any).calendar_provider === 'google' ? 'text-emerald-800' : 'text-zinc-800' }`}>
                      Google Calendar
                    </p>
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">Sincronize com o Google Calendar e Google Meet automaticamente.</p>
                </div>
                {(settings as any).calendar_provider === 'google' && (
                  <div className="flex flex-col items-end gap-2">
                    {calendarConnected.google ? (
                      <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Conectado
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
                        <XCircle className="w-3.5 h-3.5" />
                        Não conectado
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      {calendarConnected.google && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isDisconnectingGoogle}
                          className="text-xs h-7 text-red-600 border-red-200 hover:bg-red-50 gap-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDisconnectGoogle();
                          }}
                        >
                          {isDisconnectingGoogle ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />}
                          Desconectar
                        </Button>
                      )}
                      <Button
                        size="sm"
                        disabled={isConnectingGoogle}
                        className={`text-xs h-7 gap-1.5 ${
                          calendarConnected.google
                            ? 'bg-zinc-600 hover:bg-zinc-700'
                            : 'bg-emerald-600 hover:bg-emerald-700'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleConnectGoogleCalendar();
                        }}
                      >
                        {isConnectingGoogle ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
                        {calendarConnected.google ? 'Reconectar' : 'Conectar Calendário Google'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {(settings as any).calendar_provider === 'google' && (
                <Card className="border-emerald-200 bg-emerald-50/50">
                  <CardContent className="pt-4 space-y-4">
                    {/* Info: como funciona */}
                    <div className="flex items-start gap-3 p-3 bg-white border border-emerald-200 rounded-xl">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div className="text-xs text-emerald-800 space-y-1">
                        <p className="font-semibold">Autenticação OAuth 2.0 gerida pelo sistema</p>
                        <p className="text-emerald-700 leading-relaxed">
                          Ao clicar em <strong>Conectar Calendário Google</strong>, será redirecionado para a página de autorização da Google.
                          Após autorizar, o sistema irá guardar o seu token de acesso de forma segura e sincronizará automaticamente os agendamentos.
                        </p>
                      </div>
                    </div>

                    {/* Testar Conexão Google Calendar */}
                    {calendarConnected.google && (
                      <div className="pt-2 flex items-center justify-between border-t border-emerald-200/60">
                        <p className="text-xs text-emerald-800 font-medium">Validar conexão e permissões do Google Calendar:</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isTestingGoogle}
                          className="border-emerald-300 text-emerald-800 hover:bg-emerald-100 gap-1.5 text-xs h-8"
                          onClick={handleTestGoogleCalendar}
                        >
                          {isTestingGoogle ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          Testar Conexão Google
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Se 'microsoft' selecionado, mostrar campo de Client ID */}
              {(settings as any).calendar_provider === 'microsoft' && (
                <Card className="border-blue-200 bg-blue-50/50">
                  <CardContent className="pt-4 space-y-3">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-blue-700">Microsoft Application (client) ID</Label>
                      <Input
                        placeholder="Ex: abcdef12-3456-7890-abcd-ef1234567890"
                        className="border-blue-200 focus-visible:ring-blue-400"
                        autoComplete="off"
                        value={(settings as any).microsoft_client_id || ''}
                        onChange={(e) => setSettings({ ...settings, microsoft_client_id: e.target.value } as any)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-blue-700">Microsoft Client Secret</Label>
                      <Input
                        type="password"
                        placeholder="Segredo do cliente (Valor da chave secreta)"
                        className="border-blue-200 focus-visible:ring-blue-400"
                        autoComplete="new-password"
                        value={(settings as any).microsoft_client_secret || ''}
                        onChange={(e) => setSettings({ ...settings, microsoft_client_secret: e.target.value } as any)}
                      />
                      <p className="text-[10px] text-blue-600">
                        Registe a aplicação no portal Microsoft Entra (Azure AD) e adicione <strong>{window.location.origin}/api/settings/calendar/microsoft/callback</strong> como URI de redirecionamento autorizado.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Outras plataformas */}
              <div
                onClick={() => setSettings({ ...settings, calendar_provider: 'other' })}
                className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  (settings as any).calendar_provider === 'other'
                    ? 'border-violet-500 bg-violet-50 ring-1 ring-violet-500'
                    : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
                }`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 transition-all ${
                  (settings as any).calendar_provider === 'other' ? 'border-violet-500 bg-violet-500' : 'border-zinc-300'
                }`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🔗</span>
                    <p className={`text-sm font-semibold ${ (settings as any).calendar_provider === 'other' ? 'text-violet-800' : 'text-zinc-800' }`}>
                      Outra Plataforma / Manual
                    </p>
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">Calendly, Cal.com, HubSpot, iCal, ou qualquer plataforma via link de agendamento personalizado.</p>
                </div>
                {(settings as any).calendar_provider === 'other' && (
                  <div className="flex items-center gap-1.5 text-xs text-violet-700 bg-violet-50 border border-violet-200 px-2 py-1 rounded-full">
                    <Clock className="w-3.5 h-3.5" />
                    Configurar link
                  </div>
                )}
              </div>

              {/* Se 'other' selecionado, mostrar campo de link */}
              {(settings as any).calendar_provider === 'other' && (
                <Card className="border-violet-200 bg-violet-50/50">
                  <CardContent className="pt-4 space-y-3">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-violet-700">Link de Agendamento Externo</Label>
                      <Input
                        placeholder="Ex: https://calendly.com/seu-negocio ou https://cal.com/user/meeting"
                        className="border-violet-200 focus-visible:ring-violet-400"
                        value={(settings as any).calendar_link || ''}
                        onChange={(e) => setSettings({ ...settings, calendar_link: e.target.value } as any)}
                      />
                      <p className="text-[10px] text-violet-500">A IA enviará este link ao cliente quando um agendamento for solicitado.</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Desativado */}
              <div
                onClick={() => setSettings({ ...settings, calendar_provider: 'none' })}
                className={`flex items-center gap-4 p-3 rounded-xl border cursor-pointer transition-all ${
                  (settings as any).calendar_provider === 'none' || !(settings as any).calendar_provider
                    ? 'border-zinc-300 bg-zinc-50 ring-1 ring-zinc-300'
                    : 'border-zinc-200 bg-white hover:border-zinc-300'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                  (settings as any).calendar_provider === 'none' || !(settings as any).calendar_provider ? 'border-zinc-500 bg-zinc-500' : 'border-zinc-300'
                }`} />
                <div>
                  <p className="text-sm font-medium text-zinc-600">🚫 Sem calendário (desativado)</p>
                  <p className="text-xs text-zinc-400">Os agendamentos serão notificados manualmente via painel de Live Chat.</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleSave} disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-700 h-10 px-6">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Guardar Preferência
              </Button>
            </div>
          </div>
        )}

        {activeTab === "sms" && (
          <div className="space-y-6 max-w-3xl">
            <Card className="shadow-sm border-zinc-200">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                      <MessageSquare className="w-6 h-6" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Integração TelcoSMS</CardTitle>
                      <CardDescription>
                        Disparo automático de SMS de confirmação após agendamentos no WhatsApp.
                      </CardDescription>
                    </div>
                  </div>
                  <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                    (settings as any).telcosms_api_key
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-zinc-100 text-zinc-600"
                  }`}>
                    {(settings as any).telcosms_api_key ? "Configurado" : "Não configurado"}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50/40 border border-blue-100 rounded-xl space-y-2">
                  <p className="text-xs font-semibold text-blue-900 flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-blue-600" />
                    Como funciona a automação TelcoSMS:
                  </p>
                  <p className="text-xs text-blue-800 leading-relaxed">
                    Quando um cliente final confirmar o agendamento através do WhatsApp com a IA do Orion, um SMS é disparado instantaneamente para o telemóvel dele:
                  </p>
                  <div className="p-2.5 bg-white border border-blue-200/80 rounded-lg text-xs font-mono text-zinc-700">
                    "Olá [Nome], a sua marcação para o dia [Data] às [Hora] foi confirmada com sucesso! Obrigado, {settings.name || 'Sua Empresa'}."
                  </div>
                  <p className="text-[11px] text-blue-700">
                    ℹ️ O número do cliente é formatado automaticamente com o indicativo internacional (+258, +244, +351, etc.).
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="telcosms_key" className="text-sm font-medium flex items-center justify-between">
                      <span>API Key da TelcoSMS</span>
                      <a
                        href="https://telcosms.co.mz"
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                      >
                        Obter chave no portal TelcoSMS <ExternalLink className="w-3 h-3" />
                      </a>
                    </Label>
                    <div className="relative">
                      <Input
                        id="telcosms_key"
                        type={showTelcoKey ? "text" : "password"}
                        placeholder="Ex: ts_live_xxxxxxxxxxxxxxxxxxxxxxxx"
                        value={(settings as any).telcosms_api_key || ""}
                        onChange={e => setSettings({ ...settings, telcosms_api_key: e.target.value })}
                        className="pr-10 font-mono text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowTelcoKey(!showTelcoKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                      >
                        {showTelcoKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-zinc-400">
                      Chave de API gerada no seu painel da TelcoSMS. Isolada e segura para a sua conta.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="telcosms_sender" className="text-sm font-medium">
                      Sender ID (Remetente homologado)
                    </Label>
                    <Input
                      id="telcosms_sender"
                      type="text"
                      placeholder="Ex: MinhaEmpresa ou Orion (máx. 11 caracteres)"
                      maxLength={11}
                      value={(settings as any).telcosms_sender_id || ""}
                      onChange={e => setSettings({ ...settings, telcosms_sender_id: e.target.value })}
                    />
                    <p className="text-xs text-zinc-400">
                      O nome que aparecerá como remetente do SMS. Se deixar vazio, será usado o padrão "Orion".
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl space-y-3">
                  <Label className="text-xs font-semibold uppercase text-zinc-500 tracking-wider">
                    Testar Disparo de SMS em Tempo Real
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      type="tel"
                      placeholder="Número de teste (ex: +258 84 123 4567)"
                      value={testPhone}
                      onChange={e => setTestPhone(e.target.value)}
                      className="text-sm bg-white"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleTestTelcoSMS}
                      disabled={isTestingTelcoSMS || !(settings as any).telcosms_api_key}
                      className="shrink-0"
                    >
                      {isTestingTelcoSMS ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Send className="w-4 h-4 mr-2 text-blue-600" />
                      )}
                      Enviar Teste
                    </Button>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Certifique-se de salvar as credenciais antes de testar ou digite a chave acima.
                  </p>
                </div>
              </CardContent>
              <CardFooter className="bg-zinc-50/50 border-t border-zinc-100 py-4 flex justify-end">
                <Button onClick={handleSave} disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-700 h-10 px-6">
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  Guardar Configurações SMS
                </Button>
              </CardFooter>
            </Card>
          </div>
        )}

        {activeTab === "security" && (
          <div className="space-y-6 max-w-2xl">
            <Card className="shadow-sm border-zinc-200">
              <CardHeader>
                <CardTitle>Alterar Senha</CardTitle>
                <CardDescription>Garanta que sua conta esteja segura.</CardDescription>
              </CardHeader>
              <form onSubmit={handleChangePwd}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="cur">Senha Atual</Label>
                    <Input id="cur" type="password" value={pwd.current} onChange={e => setPwd({ ...pwd, current: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="new">Nova Senha</Label>
                      <Input id="new" type="password" value={pwd.new} onChange={e => setPwd({ ...pwd, new: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="conf">Confirmar Nova Senha</Label>
                      <Input id="conf" type="password" value={pwd.confirm} onChange={e => setPwd({ ...pwd, confirm: e.target.value })} />
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="bg-zinc-50/50 border-t border-zinc-100 py-4 flex justify-end">
                  <Button type="submit" disabled={isChangingPwd}>
                    {isChangingPwd ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Key className="w-4 h-4 mr-2" />}
                    Atualizar Senha
                  </Button>
                </CardFooter>
              </form>
            </Card>

            <Card className="shadow-sm border-zinc-200 bg-zinc-50/50">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Uso no Telemóvel (App)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-zinc-600 leading-relaxed">
                  *Atenção:* Números na Cloud API não funcionam no aplicativo "WhatsApp Business" comum. 
                </p>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Para responder do telemóvel, instale o aplicativo **Meta Business Suite** (oficial da Meta). Ele permite gerir as conversas da API e coexistir com a nossa IA.
                </p>
                <Button variant="outline" className="w-full text-xs h-8" onClick={() => window.open('https://business.facebook.com/', '_blank')}>
                  Abrir Meta Business Suite
                </Button>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-zinc-200 bg-zinc-50/50">
              <CardHeader>
                <CardTitle className="text-sm">Configuração Técnica (Webhook)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-zinc-400">Verify Token (Meta Cloud API)</Label>
                <div className="flex gap-2">
                  <code className="flex-1 p-2 bg-white border border-zinc-200 rounded text-xs">orion_secure_token_123</code>
                  <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText('orion_secure_token_123'); toast.success('Copiado!'); }}>
                    <Save className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
