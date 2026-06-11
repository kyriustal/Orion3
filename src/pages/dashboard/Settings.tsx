import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Save, Loader2, Key, User, Building2, Bot, ShieldCheck, Mail, Calendar, ExternalLink, CheckCircle2, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"personal" | "company" | "ai" | "calendar" | "security">("personal");

  const [settings, setSettings] = useState({
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
  });

  const [pwd, setPwd] = useState({ current: "", new: "", confirm: "" });
  const [isChangingPwd, setIsChangingPwd] = useState(false);

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
      if (!response.ok) throw new Error("Erro ao salvar configurações");
      toast.success("Configurações atualizadas com sucesso!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSaving(false);
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
    { id: "security", label: "Segurança", icon: ShieldCheck },
  ] as const;

  return (
    <div className="space-y-6 max-w-5xl pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Configurações</h2>
          <p className="text-zinc-500">Gerencie sua conta e as preferências da Orion.</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving || activeTab === 'security' || activeTab === 'calendar'} className="bg-emerald-600 hover:bg-emerald-700 h-11 px-8">
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
              <CardDescription>Como sua empresa aparece na plataforma.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome da Empresa</Label>
                <Input id="name" value={settings.name || ""} onChange={(e) => setSettings({ ...settings, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="whatsapp">WhatsApp Comercial</Label>
                <Input id="whatsapp" value={settings.whatsapp || ""} onChange={(e) => setSettings({ ...settings, whatsapp: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact">Pessoa de Contato / Resp.</Label>
                <Input id="contact" value={settings.contact_person || ""} onChange={(e) => setSettings({ ...settings, contact_person: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Sede / Endereço</Label>
                <Input id="address" value={settings.address || ""} onChange={(e) => setSettings({ ...settings, address: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="social">Ramo de Atividade</Label>
                  <Input id="social" value={settings.social_object || ""} onChange={(e) => setSettings({ ...settings, social_object: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employees">Escala (Funcionários)</Label>
                  <Input id="employees" value={settings.employees_count || ""} onChange={(e) => setSettings({ ...settings, employees_count: e.target.value })} />
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
                    <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
                      <XCircle className="w-3.5 h-3.5" />
                      Não conectado
                    </div>
                    <Button
                      size="sm"
                      className="text-xs h-7 bg-blue-600 hover:bg-blue-700 gap-1.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open('https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=YOUR_MS_CLIENT_ID&response_type=code&scope=Calendars.ReadWrite', '_blank');
                        toast.info('Funcionalidade de conexão Microsoft em breve. Configure o App ID no painel Azure.');
                      }}
                    >
                      <ExternalLink className="w-3 h-3" />
                      Conectar conta Microsoft
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
                    <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
                      <XCircle className="w-3.5 h-3.5" />
                      Não conectado
                    </div>
                    <Button
                      size="sm"
                      className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open('https://accounts.google.com/o/oauth2/v2/auth?scope=https://www.googleapis.com/auth/calendar', '_blank');
                        toast.info('Funcionalidade de conexão Google em breve. Configure as credenciais OAuth no Google Cloud Console.');
                      }}
                    >
                      <ExternalLink className="w-3 h-3" />
                      Conectar conta Google
                    </Button>
                  </div>
                )}
              </div>

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
