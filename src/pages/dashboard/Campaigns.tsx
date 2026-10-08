import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Megaphone, Plus, PlayCircle, PauseCircle, Settings2, Loader2, MousePointer2, Link2, Phone, Trash2, ChevronDown, ChevronUp, FileText, CheckCircle2, XCircle, Search, Users } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ButtonPresetsPicker } from "@/src/components/ui/button-presets";
import type { ButtonType, PresetButton } from "@/src/components/ui/button-presets";

interface CampaignButton {
  id: string;
  type: ButtonType;
  text: string;
  url?: string;
  phone_number?: string;
}

export default function Campaigns() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [approvedTemplates, setApprovedTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});
  const [buttons, setButtons] = useState<CampaignButton[]>([]);
  const [useTemplateButtons, setUseTemplateButtons] = useState(true);
  const [showButtonConfig, setShowButtonConfig] = useState(false);

  // Estados do Relatório Detalhado da Campanha
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [selectedReport, setSelectedReport] = useState<{ campaign: any; logs: any[] } | null>(null);
  const [reportSearch, setReportSearch] = useState("");

  const [newCampaign, setNewCampaign] = useState({
    name: "",
    template: "",
    audience: "all",
    filters: "",
    delay_seconds: 5
  });

  const handleOpenReport = async (campaignId: string) => {
    setIsReportOpen(true);
    setIsReportLoading(true);
    setReportSearch("");
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/report`, {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      if (!res.ok) throw new Error("Erro ao carregar relatório");
      const data = await res.json();
      setSelectedReport(data);
    } catch (err: any) {
      toast.error(err.message || "Não foi possível carregar o relatório.");
    } finally {
      setIsReportLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
    fetchApprovedTemplates();
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

  const fetchApprovedTemplates = async () => {
    try {
      const response = await fetch("/api/templates", {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      if (response.ok) {
        const data = await response.json();
        const approved = (data || []).filter((t: any) => t.status === 'approved');
        setApprovedTemplates(approved);
        if (approved.length > 0) {
          setNewCampaign(prev => ({ ...prev, template: approved[0].name }));
          setSelectedTemplate(approved[0]);
        }
      }
    } catch (error) {
      console.error("Erro ao buscar templates", error);
    }
  };

  // Extrai variáveis {{1}}, {{2}}, etc. do conteúdo do template
  const extractVariables = (content: string): string[] => {
    const matches = content.match(/\{\{\d+\}\}/g) || [];
    return [...new Set(matches)].sort();
  };

  const handleTemplateChange = (templateName: string) => {
    const tmpl = approvedTemplates.find(t => t.name === templateName);
    setSelectedTemplate(tmpl || null);
    setTemplateVars({});
    setButtons([]);
    setUseTemplateButtons(true);
    setNewCampaign(prev => ({ ...prev, template: templateName }));
  };

  const addButton = () => {
    if (buttons.length >= 3) { toast.error("Máximo de 3 botões (limite da Meta)."); return; }
    setButtons(prev => [...prev, { id: `btn_${Date.now()}`, type: "QUICK_REPLY", text: "" }]);
  };

  const applyPreset = (presetButtons: Omit<PresetButton, "id">[]) => {
    if (presetButtons.length > 3) { toast.error("Este modelo excede o limite de 3 botões da Meta."); return; }
    setUseTemplateButtons(false);
    setButtons(presetButtons.map((b, i) => ({ ...b, id: `btn_p_${i}_${Date.now()}` })));
    toast.success("Modelo de botões aplicado!");
  };

  const updateButton = (idx: number, field: keyof CampaignButton, value: string) => {
    setButtons(prev => prev.map((b, i) => i === idx ? { ...b, [field]: value } : b));
  };

  const removeButton = (idx: number) => {
    setButtons(prev => prev.filter((_, i) => i !== idx));
  };

  const getEffectiveButtons = (): CampaignButton[] => {
    if (useTemplateButtons && selectedTemplate?.buttons?.length > 0) {
      return selectedTemplate.buttons;
    }
    return buttons;
  };

  const handleStartCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampaign.name) { toast.error("Dê um nome à campanha."); return; }
    if (!newCampaign.template) { toast.error("Selecione um template aprovado."); return; }

    const effectiveButtons = getEffectiveButtons();
    for (const btn of effectiveButtons) {
      if (!btn.text.trim()) { toast.error("Todos os botões precisam de texto."); return; }
      if (btn.type === "URL" && !btn.url?.trim()) { toast.error("Botões de URL precisam de um link."); return; }
      if (btn.type === "PHONE_NUMBER" && !btn.phone_number?.trim()) { toast.error("Botões de telefone precisam de um número."); return; }
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/campaigns/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          ...newCampaign,
          template_variables: templateVars,
          buttons: effectiveButtons
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Erro ao iniciar campanha");
      }

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
      setNewCampaign({ name: "", template: approvedTemplates[0]?.name || "", audience: "all", filters: "", delay_seconds: 5 });
      setTemplateVars({});
      setButtons([]);
    } catch (error: any) {
      toast.error(error.message || "Erro ao iniciar a campanha.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const templateVariables = selectedTemplate?.content ? extractVariables(selectedTemplate.content) : [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Campanhas em Massa</h2>
          <p className="text-zinc-500">Envie mensagens proativas usando Templates Oficiais da Meta.</p>
        </div>
        <Button
          onClick={() => setIsModalOpen(true)}
          disabled={approvedTemplates.length === 0}
          className="gap-2"
          title={approvedTemplates.length === 0 ? "Nenhum template aprovado disponível" : ""}
        >
          <Plus className="w-4 h-4" /> Nova Campanha
        </Button>
      </div>

      {approvedTemplates.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          ⚠️ Você não possui templates aprovados. Vá em <strong>Templates</strong>, sincronize com a Meta e aguarde a aprovação de ao menos um template antes de criar uma campanha.
        </div>
      )}

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
                      <Button
                        variant="outline"
                        size="icon"
                        title="Ver Relatório Detalhado"
                        onClick={() => handleOpenReport(camp.id)}
                      >
                        <FileText className="w-4 h-4 text-zinc-600" />
                      </Button>
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
          <Card className="w-full max-w-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-y-auto max-h-[92vh]">
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
                    onChange={(e) => handleTemplateChange(e.target.value)}
                  >
                    {approvedTemplates.map(t => (
                      <option key={t.id} value={t.name}>
                        {t.name} ({t.category})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Preview do conteúdo do template */}
                {selectedTemplate?.content && (
                  <div className="bg-zinc-50 border border-zinc-200 rounded-md p-3">
                    <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-1">Preview do Template</p>
                    <p className="text-sm text-zinc-700 whitespace-pre-wrap">{selectedTemplate.content}</p>
                  </div>
                )}

                {/* Campos de variáveis dinamicamente */}
                {templateVariables.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-zinc-700">Variáveis do Template (Copy)</p>
                    {templateVariables.map((varToken) => {
                      const varIndex = varToken.replace(/\{\{|\}\}/g, '');
                      return (
                        <div key={varToken} className="space-y-1">
                          <Label htmlFor={`var_${varIndex}`}>
                            Variável {varToken}
                          </Label>
                          <Input
                            id={`var_${varIndex}`}
                            placeholder={`Ex: valor para ${varToken}`}
                            value={templateVars[varIndex] || ''}
                            onChange={(e) => setTemplateVars(prev => ({ ...prev, [varIndex]: e.target.value }))}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Seção de Botões */}
                <div className="space-y-3 border border-zinc-200 rounded-lg p-4 bg-zinc-50">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between text-sm font-semibold text-zinc-700"
                    onClick={() => setShowButtonConfig(v => !v)}
                  >
                    <span className="flex items-center gap-2">
                      <MousePointer2 className="w-4 h-4 text-zinc-500" />
                      Configurar Botões Interativos
                      {getEffectiveButtons().length > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          {getEffectiveButtons().length} configurado(s)
                        </span>
                      )}
                    </span>
                    {showButtonConfig ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {showButtonConfig && (
                    <div className="space-y-3 pt-1">
                      {/* Se o template já tiver botões, exibe opção de reutilizá-los */}
                      {selectedTemplate?.buttons?.length > 0 && (
                        <div className="flex items-start gap-3 p-3 rounded-md bg-white border border-zinc-200">
                          <input
                            id="useTemplateButtons"
                            type="checkbox"
                            checked={useTemplateButtons}
                            onChange={e => {
                              setUseTemplateButtons(e.target.checked);
                              if (e.target.checked) setButtons([]);
                            }}
                            className="mt-0.5 accent-emerald-600"
                          />
                          <div>
                            <Label htmlFor="useTemplateButtons" className="cursor-pointer">
                              Usar botões do template selecionado
                            </Label>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {selectedTemplate.buttons.map((btn: CampaignButton, i: number) => (
                                <span key={i} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                                  {btn.type === 'URL' ? <Link2 className="w-3 h-3" /> : btn.type === 'PHONE_NUMBER' ? <Phone className="w-3 h-3" /> : <MousePointer2 className="w-3 h-3" />}
                                  {btn.text}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Configuração de botões customizados */}
                      {(!useTemplateButtons || !selectedTemplate?.buttons?.length) && (
                        <>
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-zinc-500">Configure botões para esta campanha (máx. 3).</p>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={addButton}
                              disabled={buttons.length >= 3}
                              className="gap-1 text-xs"
                            >
                              <Plus className="w-3.5 h-3.5" /> Botão
                            </Button>
                          </div>

                          {/* Modelos Rápidos */}
                          <ButtonPresetsPicker currentCount={buttons.length} onSelect={applyPreset} />

                          {buttons.length > 0 && (
                            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest pt-1">Botões Configurados</p>
                          )}

                          {buttons.length === 0 && (
                            <div className="border-2 border-dashed border-zinc-200 rounded-lg py-3 text-center text-zinc-400 text-xs">
                              Selecione um modelo acima ou clique em "Botão" para criar manualmente.
                            </div>
                          )}

                          <div className="space-y-3">
                            {buttons.map((btn, idx) => (
                              <div key={btn.id} className="border border-zinc-200 rounded-lg p-3 space-y-2 bg-white">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-semibold text-zinc-600">Botão {idx + 1}</span>
                                  <button type="button" onClick={() => removeButton(idx)} className="text-red-400 hover:text-red-600">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-xs">Tipo</Label>
                                    <select
                                      title="Tipo de botão"
                                      className="flex h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs focus:ring-1 focus:ring-emerald-500"
                                      value={btn.type}
                                      onChange={e => updateButton(idx, "type", e.target.value as ButtonType)}
                                    >
                                      <option value="QUICK_REPLY">💬 Resposta Rápida</option>
                                      <option value="URL">🔗 Abrir URL</option>
                                      <option value="PHONE_NUMBER">📞 Ligar</option>
                                    </select>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Texto <span className="text-zinc-400">(máx. 25)</span></Label>
                                    <Input
                                      className="h-8 text-xs"
                                      placeholder="Saiba mais"
                                      maxLength={25}
                                      value={btn.text}
                                      onChange={e => updateButton(idx, "text", e.target.value)}
                                    />
                                  </div>
                                </div>
                                {btn.type === "URL" && (
                                  <div className="space-y-1">
                                    <Label className="text-xs">URL</Label>
                                    <Input className="h-8 text-xs" placeholder="https://exemplo.com" value={btn.url || ""} onChange={e => updateButton(idx, "url", e.target.value)} />
                                  </div>
                                )}
                                {btn.type === "PHONE_NUMBER" && (
                                  <div className="space-y-1">
                                    <Label className="text-xs">Telefone</Label>
                                    <Input className="h-8 text-xs" placeholder="+5511999999999" value={btn.phone_number || ""} onChange={e => updateButton(idx, "phone_number", e.target.value)} />
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
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

      {/* Modal de Relatório Detalhado */}
      {isReportOpen && (
        <div className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-4xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-y-auto max-h-[92vh]">
            <CardHeader className="border-b border-zinc-100 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-bold flex items-center gap-2 text-zinc-900">
                    <FileText className="w-5 h-5 text-emerald-600" />
                    Relatório Detalhado da Campanha
                  </CardTitle>
                  {selectedReport?.campaign && (
                    <CardDescription className="mt-1">
                      Campanha: <strong>{selectedReport.campaign.name}</strong> • Template: <strong>{selectedReport.campaign.template}</strong> • {selectedReport.campaign.date}
                    </CardDescription>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setIsReportOpen(false)}>
                  ✕ Fechar
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-6 pt-5">
              {isReportLoading ? (
                <div className="flex h-48 items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                </div>
              ) : selectedReport ? (
                <>
                  {/* Cards de Métricas */}
                  <div className="grid grid-cols-4 gap-4">
                    <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 text-center">
                      <p className="text-xs text-zinc-500 font-medium">Total de Alvos</p>
                      <p className="text-2xl font-bold text-zinc-900 mt-1">{selectedReport.campaign.totalContacts || selectedReport.logs.length}</p>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-center">
                      <p className="text-xs text-emerald-700 font-medium">Enviados com Sucesso</p>
                      <p className="text-2xl font-bold text-emerald-800 mt-1">{selectedReport.campaign.sentCount}</p>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 text-center">
                      <p className="text-xs text-red-700 font-medium">Falhas no Envio</p>
                      <p className="text-2xl font-bold text-red-800 mt-1">{selectedReport.campaign.failedCount}</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 text-center">
                      <p className="text-xs text-blue-700 font-medium">Progresso</p>
                      <p className="text-2xl font-bold text-blue-800 mt-1">{selectedReport.campaign.progress}%</p>
                    </div>
                  </div>

                  {/* Tabela de Números Que Receberam o Disparo */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                        <Users className="w-4 h-4 text-zinc-500" />
                        Números Que Receberam o Disparo ({selectedReport.logs.length})
                      </h4>
                      <div className="relative w-64">
                        <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-400" />
                        <Input
                          placeholder="Buscar por telefone ou nome..."
                          className="pl-9 h-9 text-xs"
                          value={reportSearch}
                          onChange={(e) => setReportSearch(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white max-h-72 overflow-y-auto">
                      {selectedReport.logs.length === 0 ? (
                        <div className="p-8 text-center text-xs text-zinc-500">
                          Nenhum número registrado para este disparo ainda. Os disparos ao vivo gravam os números à medida que são enviados.
                        </div>
                      ) : (
                        <table className="w-full text-xs text-left">
                          <thead className="bg-zinc-50 text-zinc-600 border-b border-zinc-200 sticky top-0">
                            <tr>
                              <th className="px-4 py-2.5 font-semibold">Contato</th>
                              <th className="px-4 py-2.5 font-semibold">Telefone</th>
                              <th className="px-4 py-2.5 font-semibold">Status do Disparo</th>
                              <th className="px-4 py-2.5 font-semibold">Data / Hora</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100">
                            {selectedReport.logs
                              .filter(log =>
                                (log.phone && log.phone.includes(reportSearch)) ||
                                (log.name && log.name.toLowerCase().includes(reportSearch.toLowerCase()))
                              )
                              .map((log) => (
                                <tr key={log.id} className="hover:bg-zinc-50/80 transition-colors">
                                  <td className="px-4 py-2.5 font-medium text-zinc-900">{log.name}</td>
                                  <td className="px-4 py-2.5 font-mono text-zinc-700">{log.phone}</td>
                                  <td className="px-4 py-2.5">
                                    {log.status === 'sent' ? (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">
                                        <CheckCircle2 className="w-3 h-3" /> Enviado
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700">
                                        <XCircle className="w-3 h-3" /> Falhou
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2.5 text-zinc-500">{log.sentAt}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </>
              ) : null}
            </CardContent>

            <CardFooter className="bg-zinc-50 border-t border-zinc-100 py-3.5 flex justify-end rounded-b-xl">
              <Button variant="outline" onClick={() => setIsReportOpen(false)}>
                Fechar Relatório
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
