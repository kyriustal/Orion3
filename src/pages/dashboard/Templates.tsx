import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Plus, MessageSquare, CheckCircle2, XCircle, Clock, Loader2, Globe, RefreshCw, Trash2, MousePointer2, Link2, Phone } from "lucide-react";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { ButtonPresetsPicker } from "@/src/components/ui/button-presets";
import type { ButtonType, PresetButton } from "@/src/components/ui/button-presets";

interface TemplateButton {
  id: string;
  type: ButtonType;
  text: string;
  url?: string;
  phone_number?: string;
}

export default function Templates() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [newTemplate, setNewTemplate] = useState({
    name: "",
    category: "MARKETING",
    language: "pt_BR",
    content: ""
  });

  const [buttons, setButtons] = useState<TemplateButton[]>([]);

  const fetchTemplates = async () => {
    try {
      const response = await fetch("/api/templates", {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      if (!response.ok) throw new Error("Erro ao carregar templates");
      const data = await response.json();
      setTemplates(data);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplate.name || !newTemplate.content) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }
    for (const btn of buttons) {
      if (!btn.text.trim()) { toast.error("Todos os botões precisam de um texto."); return; }
      if (btn.type === "URL" && !btn.url?.trim()) { toast.error("Botões de URL precisam de um link válido."); return; }
      if (btn.type === "PHONE_NUMBER" && !btn.phone_number?.trim()) { toast.error("Botões de telefone precisam de um número válido."); return; }
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ ...newTemplate, buttons })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Erro ao criar template");
      }

      const created = await response.json();
      setTemplates([...templates, created]);
      toast.success("Template criado com sucesso!");
      resetModal();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetModal = () => {
    setIsModalOpen(false);
    setNewTemplate({ name: "", category: "MARKETING", language: "pt_BR", content: "" });
    setButtons([]);
  };

  const addButton = () => {
    if (buttons.length >= 3) { toast.error("Máximo de 3 botões por template (limite da Meta)."); return; }
    setButtons(prev => [...prev, { id: `btn_${Date.now()}`, type: "QUICK_REPLY", text: "" }]);
  };

  const applyPreset = (presetButtons: Omit<PresetButton, "id">[]) => {
    if (presetButtons.length > 3) { toast.error("Este modelo excede o limite de 3 botões da Meta."); return; }
    setButtons(presetButtons.map((b, i) => ({ ...b, id: `btn_preset_${i}_${Date.now()}` })));
    toast.success("Modelo de botões aplicado!");
  };

  const updateButton = (idx: number, field: keyof TemplateButton, value: string) => {
    setButtons(prev => prev.map((b, i) => i === idx ? { ...b, [field]: value } : b));
  };

  const removeButton = (idx: number) => {
    setButtons(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSync = async (silent = false) => {
    setIsSyncing(true);
    try {
      const response = await fetch("/api/templates/sync", {
        method: "POST",
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao sincronizar");
      if (!silent) toast.success(data.message);
      fetchTemplates();
    } catch (error: any) {
      if (!silent) toast.error(error.message);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
    handleSync(true);
  }, []);

  const buttonTypeIcons: Record<ButtonType, React.ReactNode> = {
    QUICK_REPLY: <MousePointer2 className="w-3.5 h-3.5" />,
    URL: <Link2 className="w-3.5 h-3.5" />,
    PHONE_NUMBER: <Phone className="w-3.5 h-3.5" />
  };

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Gestor de Templates (HSM)</h2>
          <p className="text-zinc-500">Crie e gerencie mensagens proativas aprovadas pela Meta.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleSync()} disabled={isSyncing} className="gap-2">
            {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sincronizar
          </Button>
          <Button onClick={() => setIsModalOpen(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> Novo Template
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Templates Ativos</CardTitle>
          <CardDescription>Para iniciar conversas após 24h, você deve usar um template aprovado.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {templates.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 border-2 border-dashed rounded-xl">
                Nenhum template cadastrado ainda.
              </div>
            ) : (
              templates.map(template => (
                <div key={template.id} className="flex flex-col gap-3 p-4 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                        <MessageSquare className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-zinc-900">{template.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-100 text-zinc-600 uppercase tracking-widest">
                            {template.category}
                          </span>
                          <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                            <Globe className="w-3 h-3" /> {template.language}
                          </span>
                          {template.buttons && template.buttons.length > 0 && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-600 flex items-center gap-1">
                              <MousePointer2 className="w-3 h-3" /> {template.buttons.length} botão(ões)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div>
                      {template.status === 'approved' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Aprovado
                        </span>
                      ) : template.status === 'rejected' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                          <XCircle className="w-3.5 h-3.5" /> Rejeitado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                          <Clock className="w-3.5 h-3.5" /> Em Análise
                        </span>
                      )}
                    </div>
                  </div>
                  {template.content && (
                    <div className="ml-14 bg-zinc-50 border border-zinc-100 rounded-md px-3 py-2">
                      <p className="text-xs text-zinc-500 whitespace-pre-wrap line-clamp-2">{template.content}</p>
                    </div>
                  )}
                  {template.buttons && template.buttons.length > 0 && (
                    <div className="ml-14 flex flex-wrap gap-2">
                      {template.buttons.map((btn: TemplateButton, i: number) => (
                        <span key={i} className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full border border-zinc-200 bg-white text-zinc-600 font-medium shadow-sm">
                          {buttonTypeIcons[btn.type] || <MousePointer2 className="w-3.5 h-3.5" />}
                          {btn.text}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Modal Novo Template */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-y-auto max-h-[92vh]">
            <form onSubmit={handleCreate}>
              <CardHeader>
                <CardTitle>Criar Novo Template</CardTitle>
                <CardDescription>Configure o conteúdo, botões e envie para revisão da Meta.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Linha 1: Nome e Categoria */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="tName">Identificador (Nome)</Label>
                    <Input
                      id="tName"
                      placeholder="ex: boas_vindas_promo"
                      value={newTemplate.name}
                      onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                    />
                    <p className="text-[10px] text-zinc-400">Apenas letras minúsculas, números e underscore.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tCat">Categoria</Label>
                    <select
                      id="tCat"
                      title="Selecione a categoria do template"
                      className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
                      value={newTemplate.category}
                      onChange={(e) => setNewTemplate({ ...newTemplate, category: e.target.value })}
                    >
                      <option value="MARKETING">Marketing</option>
                      <option value="UTILITY">Utilidade (Avisos)</option>
                      <option value="AUTHENTICATION">Autenticação (OTP)</option>
                    </select>
                  </div>
                </div>

                {/* Conteúdo */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="tContent">Conteúdo da Mensagem (Corpo)</Label>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-zinc-400">Inserir variável:</span>
                      {[
                        { label: "+ [Nome]", val: "[Nome]" },
                        { label: "+ [Empresa]", val: "[Empresa]" },
                        { label: "+ [Produto]", val: "[Produto]" },
                        { label: "+ [Telefone]", val: "[Phone]" },
                      ].map((item) => (
                        <button
                          key={item.val}
                          type="button"
                          onClick={() => setNewTemplate(prev => ({ ...prev, content: prev.content + " " + item.val }))}
                          className="text-[11px] font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded transition-colors"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    id="tContent"
                    rows={4}
                    className="flex w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
                    placeholder="Olá [Nome], bem-vindo à [Empresa]! O seu pedido [Produto] foi confirmado."
                    value={newTemplate.content}
                    onChange={(e) => setNewTemplate({ ...newTemplate, content: e.target.value })}
                  />
                  <p className="text-[10px] text-zinc-500 italic">
                    Clique nos botões acima ou escreva <strong>[Nome]</strong>, <strong>[Empresa]</strong> ou <strong>{"{{1}}"}</strong>, <strong>{"{{2}}"}</strong> diretamente no texto. O sistema ajusta automaticamente para a Meta.
                  </p>
                </div>

                {/* Botões */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Botões Interativos</Label>
                      <p className="text-[10px] text-zinc-400 mt-0.5">Máximo de 3 botões (limite da Meta). Tipos: Resposta rápida, URL ou Telefone.</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addButton}
                      disabled={buttons.length >= 3}
                      className="gap-1.5 text-xs"
                    >
                      <Plus className="w-3.5 h-3.5" /> Adicionar Botão
                    </Button>
                  </div>

                  {/* Modelos Rápidos */}
                  <ButtonPresetsPicker currentCount={buttons.length} onSelect={applyPreset} />

                  {buttons.length > 0 && (
                    <div className="pt-1 space-y-1">
                      <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Botões Configurados</p>
                    </div>
                  )}

                  {buttons.length === 0 && (
                    <div className="border-2 border-dashed border-zinc-200 rounded-lg py-3 text-center text-zinc-400 text-xs">
                      Selecione um modelo acima ou clique em "Adicionar Botão" para criar manualmente.
                    </div>
                  )}

                  <div className="space-y-3">
                    {buttons.map((btn, idx) => (
                      <div key={btn.id} className="border border-zinc-200 rounded-lg p-3 space-y-3 bg-zinc-50">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-zinc-600">Botão {idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => removeButton(idx)}
                            className="text-red-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Tipo de Botão</Label>
                            <select
                              title="Tipo de botão"
                              className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs focus:ring-2 focus:ring-emerald-500"
                              value={btn.type}
                              onChange={(e) => updateButton(idx, "type", e.target.value as ButtonType)}
                            >
                              <option value="QUICK_REPLY">💬 Resposta Rápida</option>
                              <option value="URL">🔗 Abrir URL</option>
                              <option value="PHONE_NUMBER">📞 Ligar</option>
                            </select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Texto do Botão <span className="text-zinc-400">(máx. 25 chars)</span></Label>
                            <Input
                              className="h-9 text-xs"
                              placeholder="ex: Sim, quero saber mais"
                              maxLength={25}
                              value={btn.text}
                              onChange={(e) => updateButton(idx, "text", e.target.value)}
                            />
                          </div>
                        </div>
                        {btn.type === "URL" && (
                          <div className="space-y-1.5">
                            <Label className="text-xs">URL de Destino</Label>
                            <Input
                              className="h-9 text-xs"
                              placeholder="https://seusite.com/pagina"
                              value={btn.url || ""}
                              onChange={(e) => updateButton(idx, "url", e.target.value)}
                            />
                          </div>
                        )}
                        {btn.type === "PHONE_NUMBER" && (
                          <div className="space-y-1.5">
                            <Label className="text-xs">Número de Telefone</Label>
                            <Input
                              className="h-9 text-xs"
                              placeholder="+5511999999999"
                              value={btn.phone_number || ""}
                              onChange={(e) => updateButton(idx, "phone_number", e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="bg-zinc-50 border-t border-zinc-100 py-4 flex justify-end gap-2 rounded-b-xl">
                <Button type="button" variant="outline" onClick={resetModal} disabled={isSubmitting}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting} className="min-w-[160px] bg-emerald-600">
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar para Meta'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
