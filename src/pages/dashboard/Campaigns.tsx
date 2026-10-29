import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
  Megaphone, Plus, PlayCircle, PauseCircle, Settings2, Loader2, MousePointer2, Link2,
  Phone, Trash2, ChevronDown, ChevronUp, FileText, CheckCircle2, XCircle, Search,
  Users, Upload, RefreshCw, X, UploadCloud, FileSpreadsheet, AlertCircle, Eye, EyeOff,
  UserMinus, UserCheck, ListChecks, Calendar, CalendarClock, Zap, Building2, User, Mail, Sparkles, MessageSquare
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
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

interface Contact {
  id: string;
  phone: string;
  name: string;
  email?: string;
  source?: string;
  created_at: string;
}

interface CampaignLog {
  id: string;
  phone: string;
  name: string;
  status: "sent" | "failed";
  messageId?: string;
  sentAt: string;
}

type ActiveTab = "campaigns" | "contacts";

function formatDateTimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default function Campaigns() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("campaigns");

  // --- Campaigns ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [approvedTemplates, setApprovedTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [templateVars, setTemplateVars] = useState<Record<string, any>>({});
  const [buttons, setButtons] = useState<CampaignButton[]>([]);
  const [useTemplateButtons, setUseTemplateButtons] = useState(true);
  const [showButtonConfig, setShowButtonConfig] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // --- Report Modal ---
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [selectedReport, setSelectedReport] = useState<{ campaign: any; logs: CampaignLog[] } | null>(null);
  const [reportSearch, setReportSearch] = useState("");
  const [selectedLogIds, setSelectedLogIds] = useState<Set<string>>(new Set());
  const [isDeletingLogs, setIsDeletingLogs] = useState(false);

  // --- Contacts tab ---
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [isDeletingContacts, setIsDeletingContacts] = useState(false);

  // --- Upload ---
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ imported: number; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const [newCampaign, setNewCampaign] = useState({
    name: "",
    template: "",
    audience: "all",
    filters: "",
    delay_seconds: 5
  });

  // --- Agendamento / Calendarização ---
  const [scheduleMode, setScheduleMode] = useState<"now" | "scheduled">("now");
  const [scheduledDateTime, setScheduledDateTime] = useState("");

  const [estimatedCount, setEstimatedCount] = useState<number | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [modalContactSearch, setModalContactSearch] = useState("");

  // --- Preview de contatos no modal de campanha ---
  const [previewContacts, setPreviewContacts] = useState<{ id: string | null; phone: string; name: string; email?: string | null; source?: string | null }[]>([]);
  const [excludedPhones, setExcludedPhones] = useState<Set<string>>(new Set());
  const [showContactPreview, setShowContactPreview] = useState(false);
  const [previewSearch, setPreviewSearch] = useState("");

  const authHeaders = () => ({ "Authorization": `Bearer ${localStorage.getItem("token")}` });

  // ─── Fetch data ───────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchCampaigns();
    fetchApprovedTemplates();
    fetchContacts();
  }, []);

  useEffect(() => {
    if (activeTab === "contacts") fetchContacts();
  }, [activeTab]);

  const updateAudiencePreview = async (audience: string, filters: string, contactIds: string[]) => {
    setIsEstimating(true);
    try {
      const res = await fetch("/api/campaigns/preview-audience", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          audience,
          filters,
          contact_ids: audience === "selected" ? contactIds : []
        })
      });
      if (res.ok) {
        const data = await res.json();
        setEstimatedCount(data.count);
        setPreviewContacts(data.contacts || []);
      }
    } catch (e) {
      if (audience === "selected") setEstimatedCount(contactIds.length);
      else setEstimatedCount(contacts.length);
      setPreviewContacts([]);
    } finally {
      setIsEstimating(false);
    }
  };

  useEffect(() => {
    if (!isModalOpen) return;
    const timer = setTimeout(() => {
      updateAudiencePreview(newCampaign.audience, newCampaign.filters, Array.from(selectedContactIds));
    }, 300);
    return () => clearTimeout(timer);
  }, [isModalOpen, newCampaign.audience, newCampaign.filters, selectedContactIds]);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch("/api/campaigns", { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (e) { console.error(e); }
  };

  const fetchApprovedTemplates = async () => {
    try {
      const res = await fetch("/api/templates", { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        const approved = (data || []).filter((t: any) => t.status === "approved");
        setApprovedTemplates(approved);
        if (approved.length > 0) {
          const firstTmpl = approved[0];
          setNewCampaign(prev => ({ ...prev, template: firstTmpl.name }));
          setSelectedTemplate(firstTmpl);
          // Pre-populate vars for first template
          if (firstTmpl.content) {
            const varMatches = (firstTmpl.content.match(/\{\{\d+\}\}/g) || []) as string[];
            const uniqueVars = [...new Set(varMatches)].sort();
            const defaults: Record<string, any> = {};
            uniqueVars.forEach((varToken: string, idx: number) => {
              const varIndexStr = varToken.replace(/\{\{|\}\}/g, '');
              const inner = varToken.replace(/^\{\{|\}\}$|^\[|\]$/g, '').trim();
              const lower = inner.toLowerCase();
              let source = 'client_name';
              if (lower.includes('empresa') || lower.includes('loja') || lower.includes('company')) source = 'company_name';
              else if (lower.includes('telefone') || lower.includes('phone')) source = 'client_phone';
              else if (lower.includes('email') || lower.includes('mail')) source = 'client_email';
              else if (/^\d+$/.test(inner) && idx > 0) source = 'company_name';
              defaults[varIndexStr] = { source };
            });
            setTemplateVars(defaults);
          }
        }
      }
    } catch (e) { console.error(e); }
  };


  const fetchContacts = async () => {
    setContactsLoading(true);
    try {
      const res = await fetch("/api/campaigns/contacts", { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || []);
      }
    } catch (e) { console.error(e); }
    finally { setContactsLoading(false); }
  };

  const handleRefreshCampaigns = async () => {
    setIsRefreshing(true);
    await fetchCampaigns();
    setIsRefreshing(false);
  };

  // ─── Report ───────────────────────────────────────────────────────────────────
  const handleOpenReport = async (campaignId: string) => {
    setIsReportOpen(true);
    setIsReportLoading(true);
    setReportSearch("");
    setSelectedLogIds(new Set());
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/report`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Erro ao carregar relatório");
      const data = await res.json();
      setSelectedReport(data);
    } catch (err: any) {
      toast.error(err.message || "Não foi possível carregar o relatório.");
    } finally {
      setIsReportLoading(false);
    }
  };

  const toggleLogSelection = (id: string) => {
    setSelectedLogIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAllLogs = () => {
    if (!selectedReport) return;
    const filtered = filteredLogs();
    if (selectedLogIds.size === filtered.length) {
      setSelectedLogIds(new Set());
    } else {
      setSelectedLogIds(new Set(filtered.map(l => l.id)));
    }
  };

  const filteredLogs = () => {
    if (!selectedReport) return [];
    return selectedReport.logs.filter(log =>
      (log.phone && log.phone.includes(reportSearch)) ||
      (log.name && log.name.toLowerCase().includes(reportSearch.toLowerCase()))
    );
  };

  const handleDeleteSelectedLogs = async () => {
    if (!selectedReport || selectedLogIds.size === 0) return;
    setIsDeletingLogs(true);
    try {
      const campaignId = selectedReport.campaign.id;
      await Promise.all([...selectedLogIds].map(logId =>
        fetch(`/api/campaigns/${campaignId}/logs/${logId}`, {
          method: "DELETE",
          headers: authHeaders()
        })
      ));
      toast.success(`${selectedLogIds.size} entrada(s) removida(s).`);
      setSelectedReport(prev => prev ? {
        ...prev,
        logs: prev.logs.filter(l => !selectedLogIds.has(l.id))
      } : null);
      setSelectedLogIds(new Set());
    } catch (e: any) {
      toast.error("Erro ao remover entradas.");
    } finally {
      setIsDeletingLogs(false);
    }
  };

  // ─── Campaign status ──────────────────────────────────────────────────────────
  const handleCampaignStatus = async (campaignId: string, status: string) => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/status`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error("Erro ao alterar status");
      toast.success(`Campanha ${status === "PAUSED" ? "pausada" : status === "CANCELLED" ? "cancelada" : "retomada"}.`);
      fetchCampaigns();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleTriggerCampaign = async (campaignId: string) => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/trigger`, {
        method: "POST",
        headers: authHeaders()
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao disparar campanha");
      }
      toast.success("Disparo da campanha agendada iniciado com sucesso!");
      fetchCampaigns();
    } catch (e: any) {
      toast.error(e.message || "Erro ao disparar campanha");
    }
  };

  // ─── Contacts ────────────────────────────────────────────────────────────────
  const filteredContacts = contacts.filter(c =>
    c.phone?.includes(contactSearch) ||
    c.name?.toLowerCase().includes(contactSearch.toLowerCase()) ||
    c.email?.toLowerCase().includes(contactSearch.toLowerCase())
  );

  const toggleContactSelect = (id: string) => {
    setSelectedContactIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAllContacts = () => {
    if (selectedContactIds.size === filteredContacts.length) {
      setSelectedContactIds(new Set());
    } else {
      setSelectedContactIds(new Set(filteredContacts.map(c => c.id)));
    }
  };

  const handleDeleteSelectedContacts = async () => {
    if (selectedContactIds.size === 0) return;
    setIsDeletingContacts(true);
    try {
      await Promise.all([...selectedContactIds].map(cid =>
        fetch(`/api/campaigns/contacts/${cid}`, { method: "DELETE", headers: authHeaders() })
      ));
      toast.success(`${selectedContactIds.size} contato(s) removido(s).`);
      setContacts(prev => prev.filter(c => !selectedContactIds.has(c.id)));
      setSelectedContactIds(new Set());
    } catch (e: any) {
      toast.error("Erro ao remover contatos.");
    } finally {
      setIsDeletingContacts(false);
    }
  };

  // ─── Upload ───────────────────────────────────────────────────────────────────
  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setIsUploading(true);
    setUploadResult(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/campaigns/contacts/upload", {
        method: "POST",
        headers: authHeaders(),
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao importar ficheiro.");
      setUploadResult({ imported: data.imported, message: data.message });
      toast.success(data.message);
      fetchContacts();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  };

  // ─── Template & buttons ───────────────────────────────────────────────────────
  const extractVariables = (content: string): string[] => {
    const matches = content.match(/\{\{\d+\}\}/g) || [];
    return [...new Set(matches)].sort();
  };

  /** Infers the default data source for a variable based on its name/position in the content */
  const inferVarSource = (content: string, varToken: string, varIndex: number): string => {
    // Extract the inner name: {{1}} → "1", [Nome] → "Nome"
    const inner = varToken.replace(/^\{\{|\}\}$|^\[|\]$/g, '').trim();
    const lower = inner.toLowerCase();

    if (lower.includes('empresa') || lower.includes('loja') || lower.includes('company') || lower.includes('org')) {
      return 'company_name';
    }
    if (lower.includes('nome') || lower.includes('cliente') || lower === 'name') {
      return 'client_name';
    }
    if (lower.includes('telefone') || lower.includes('phone') || lower.includes('tel')) {
      return 'client_phone';
    }
    if (lower.includes('email') || lower.includes('mail')) {
      return 'client_email';
    }

    // Numeric variable: guess from context around the token
    if (/^\d+$/.test(inner)) {
      const tokenPos = content.indexOf(varToken);
      const prefix = tokenPos > 0 ? content.substring(Math.max(0, tokenPos - 35), tokenPos).toLowerCase() : '';
      const isCompanyPrefix = /\b(a|da|na|pela|empresa|loja|equipa|equipe|bem-vindo\s+à|bem-vindo\s+a)\s*$/i.test(prefix);
      const isClientPrefix = /\b(olá|ola|oi|hey|caro|cara|prezado|prezada|estimado|estimada|senhor|senhora|sr|sra)\s*$/i.test(prefix);
      if (isCompanyPrefix) return 'company_name';
      if (isClientPrefix) return 'client_name';
      // First variable defaults to client_name, second to company_name
      return varIndex === 0 ? 'client_name' : 'company_name';
    }

    return 'client_name';
  };

  const handleTemplateChange = (templateName: string) => {
    const tmpl = approvedTemplates.find(t => t.name === templateName);
    setSelectedTemplate(tmpl || null);

    // Pre-populate templateVars with smart defaults so users always see the right mapping
    if (tmpl?.content) {
      const vars = extractVariables(tmpl.content);
      const defaults: Record<string, any> = {};
      vars.forEach((varToken, idx) => {
        const varIndexStr = varToken.replace(/\{\{|\}\}/g, '');
        const source = inferVarSource(tmpl.content, varToken, idx);
        defaults[varIndexStr] = { source };
      });
      setTemplateVars(defaults);
    } else {
      setTemplateVars({});
    }

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
    if (useTemplateButtons && selectedTemplate?.buttons?.length > 0) return selectedTemplate.buttons;
    return buttons;
  };

  // Contatos efetivos para envio (exclui os removidos temporariamente)
  const effectivePreviewContacts = previewContacts.filter(c => !excludedPhones.has(c.phone));
  const effectiveSendCount = effectivePreviewContacts.length;

  // Contatos filtrados na busca do preview
  const filteredPreviewContacts = previewContacts.filter(c => {
    if (!previewSearch) return true;
    const q = previewSearch.toLowerCase();
    return (
      c.phone?.includes(previewSearch) ||
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q)
    );
  });

  const toggleExcludePhone = (phone: string) => {
    setExcludedPhones(prev => {
      const next = new Set(prev);
      next.has(phone) ? next.delete(phone) : next.add(phone);
      return next;
    });
  };

  const excludeAllVisible = () => {
    setExcludedPhones(prev => {
      const next = new Set(prev);
      filteredPreviewContacts.forEach(c => next.add(c.phone));
      return next;
    });
  };

  const includeAllVisible = () => {
    setExcludedPhones(prev => {
      const next = new Set(prev);
      filteredPreviewContacts.forEach(c => next.delete(c.phone));
      return next;
    });
  };

  const handleStartCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampaign.name) { toast.error("Dê um nome à campanha."); return; }
    if (!newCampaign.template) { toast.error("Selecione um template aprovado."); return; }

    if (newCampaign.audience === "selected" && selectedContactIds.size === 0) {
      toast.error("Selecione ao menos um contato para o disparo.");
      return;
    }

    // Verificar se todos foram excluídos
    if (effectiveSendCount === 0 && previewContacts.length > 0) {
      toast.error("Todos os contatos foram excluídos deste envio. Inclua ao menos um contato.");
      return;
    }

    // Validar agendamento se o modo calendarizado estiver ativo
    if (scheduleMode === "scheduled") {
      if (!scheduledDateTime) {
        toast.error("Por favor, selecione a data e a hora para o agendamento.");
        return;
      }
      const scheduledTimeMs = new Date(scheduledDateTime).getTime();
      if (isNaN(scheduledTimeMs) || scheduledTimeMs <= Date.now()) {
        toast.error("A data e a hora do agendamento devem ser futuras.");
        return;
      }
    }

    const effectiveButtons = getEffectiveButtons();
    for (const btn of effectiveButtons) {
      if (!btn.text.trim()) { toast.error("Todos os botões precisam de texto."); return; }
      if (btn.type === "URL" && !btn.url?.trim()) { toast.error("Botões de URL precisam de um link."); return; }
      if (btn.type === "PHONE_NUMBER" && !btn.phone_number?.trim()) { toast.error("Botões de telefone precisam de um número."); return; }
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/campaigns/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ 
          ...newCampaign, 
          template_variables: templateVars, 
          buttons: effectiveButtons,
          contact_ids: newCampaign.audience === "selected" ? Array.from(selectedContactIds) : [],
          exclude_phones: Array.from(excludedPhones),
          scheduled_at: scheduleMode === "scheduled" ? new Date(scheduledDateTime).toISOString() : null
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao iniciar campanha");
      }

      const data = await res.json();
      toast.success(data.message);
      setIsModalOpen(false);
      setNewCampaign({ name: "", template: approvedTemplates[0]?.name || "", audience: "all", filters: "", delay_seconds: 5 });
      setScheduleMode("now");
      setScheduledDateTime("");
      setTemplateVars({});
      setButtons([]);
      setExcludedPhones(new Set());
      setShowContactPreview(false);
      setPreviewSearch("");
      setTimeout(fetchCampaigns, 1500);
    } catch (error: any) {
      toast.error(error.message || "Erro ao iniciar a campanha.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const templateVariables = selectedTemplate?.content ? extractVariables(selectedTemplate.content) : [];

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      SENDING: { label: "A enviar", cls: "bg-blue-100 text-blue-700" },
      COMPLETED: { label: "Concluída", cls: "bg-emerald-100 text-emerald-700" },
      PAUSED: { label: "Pausada", cls: "bg-amber-100 text-amber-700" },
      CANCELLED: { label: "Cancelada", cls: "bg-red-100 text-red-700" },
      FAILED: { label: "Falhada", cls: "bg-red-100 text-red-700" },
      SCHEDULED: { label: "Agendada", cls: "bg-indigo-100 text-indigo-700 border border-indigo-200" },
    };
    const s = map[status] || { label: status, cls: "bg-zinc-100 text-zinc-500" };
    return (
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>
    );
  };

  const logsFiltered = filteredLogs();

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Campanhas em Massa</h2>
          <p className="text-zinc-500">Envie mensagens proativas e gerencie a sua base de contatos.</p>
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
          ⚠️ Você não possui templates aprovados. Vá em <strong>Templates</strong>, sincronize com a Meta e aguarde a aprovação de ao menos um template.
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-zinc-200 gap-1">
        {(["campaigns", "contacts"] as ActiveTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {tab === "campaigns" ? (
              <span className="flex items-center gap-1.5"><Megaphone className="w-4 h-4" />Campanhas</span>
            ) : (
              <span className="flex items-center gap-1.5"><Users className="w-4 h-4" />Contatos {contacts.length > 0 && <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{contacts.length}</span>}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── TAB: CAMPANHAS ── */}
      {activeTab === "campaigns" && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Histórico de Disparos</CardTitle>
                <CardDescription>Acompanhe o status e o progresso das suas campanhas.</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={handleRefreshCampaigns} disabled={isRefreshing} title="Atualizar">
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {campaigns.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed rounded-xl bg-zinc-50/50">
                  <Megaphone className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                  <p className="text-zinc-500 text-sm">Nenhuma campanha enviada ainda.</p>
                </div>
              ) : (
                campaigns.map(camp => (
                  <div key={camp.id} className="flex items-center justify-between p-4 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                        camp.status === "SCHEDULED" ? "bg-indigo-50 text-indigo-600" : "bg-zinc-100 text-zinc-500"
                      }`}>
                        {camp.status === "SCHEDULED" ? <CalendarClock className="w-5 h-5" /> : <Megaphone className="w-5 h-5" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-zinc-900 truncate">{camp.name}</p>
                          {statusBadge(camp.status)}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 uppercase tracking-wider">{camp.template}</span>
                          <span className="text-xs text-zinc-500">{camp.date}</span>
                          {camp.totalContacts > 0 && (
                            <span className="text-xs text-zinc-500">{camp.sentCount}/{camp.totalContacts} enviados</span>
                          )}
                          {camp.status === "SCHEDULED" && (camp.scheduledAtFormatted || camp.scheduledAt) && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                              <CalendarClock className="w-3.5 h-3.5 text-indigo-600" />
                              Disparo agendado: {camp.scheduledAtFormatted || new Date(camp.scheduledAt).toLocaleString("pt-BR")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {camp.totalContacts > 0 && camp.status !== "SCHEDULED" && (
                        <div className="w-28 hidden sm:block">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-medium text-zinc-700">{camp.progress}%</span>
                          </div>
                          <div className="w-full bg-zinc-200 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${camp.status === "COMPLETED" ? "bg-emerald-500" : camp.status === "FAILED" || camp.status === "CANCELLED" ? "bg-red-500" : "bg-blue-500"}`}
                              style={{ width: `${camp.progress}%` }}
                            />
                          </div>
                        </div>
                      )}
                      <div className="flex gap-1.5 items-center">
                        {camp.status === "SCHEDULED" && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 text-xs font-medium text-emerald-700 border-emerald-300 hover:bg-emerald-50 h-8"
                              title="Disparar campanha agora"
                              onClick={() => handleTriggerCampaign(camp.id)}
                            >
                              <Zap className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="hidden md:inline">Disparar Agora</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              title="Cancelar agendamento"
                              className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-700"
                              onClick={() => handleCampaignStatus(camp.id, "CANCELLED")}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                        {camp.status === "SENDING" && (
                          <Button variant="outline" size="icon" title="Pausar" onClick={() => handleCampaignStatus(camp.id, "PAUSED")}>
                            <PauseCircle className="w-4 h-4 text-amber-600" />
                          </Button>
                        )}
                        {camp.status === "PAUSED" && (
                          <Button variant="outline" size="icon" title="Retomar" onClick={() => handleCampaignStatus(camp.id, "SENDING")}>
                            <PlayCircle className="w-4 h-4 text-emerald-600" />
                          </Button>
                        )}
                        {(camp.status === "SENDING" || camp.status === "PAUSED") && (
                          <Button variant="outline" size="icon" title="Cancelar" onClick={() => handleCampaignStatus(camp.id, "CANCELLED")}>
                            <X className="w-4 h-4 text-red-500" />
                          </Button>
                        )}
                        <Button variant="outline" size="icon" title="Ver Relatório" onClick={() => handleOpenReport(camp.id)}>
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
      )}

      {/* ── TAB: CONTATOS ── */}
      {activeTab === "contacts" && (
        <div className="space-y-4">
          {/* Upload zone */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-emerald-600" />
                Importar Lista de Contatos
              </CardTitle>
              <CardDescription>Faça upload de um ficheiro Excel (.xlsx/.xls), CSV ou PDF com os seus contatos.</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  dragOver ? "border-emerald-500 bg-emerald-50" : "border-zinc-300 bg-zinc-50 hover:border-emerald-400 hover:bg-emerald-50/30"
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.pdf,.txt"
                  className="hidden"
                  onChange={onFileInputChange}
                />
                {isUploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
                    <p className="text-sm text-zinc-600">A importar contatos...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <FileSpreadsheet className="w-10 h-10 text-zinc-400" />
                    <div>
                      <p className="text-sm font-medium text-zinc-700">Arraste o ficheiro aqui ou clique para selecionar</p>
                      <p className="text-xs text-zinc-500 mt-0.5">Excel (.xlsx, .xls), CSV, ou PDF • Máx 20 MB</p>
                    </div>
                    <Button variant="outline" size="sm" className="gap-2 mt-1">
                      <Upload className="w-3.5 h-3.5" />
                      Selecionar Ficheiro
                    </Button>
                  </div>
                )}
              </div>

              {uploadResult && (
                <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  {uploadResult.message}
                </div>
              )}

              <div className="mt-3 p-3 rounded-lg bg-zinc-50 border border-zinc-200 text-xs text-zinc-500 space-y-1">
                <p className="font-semibold text-zinc-600">Formato esperado das colunas:</p>
                <p>O sistema detecta automaticamente as colunas. Use cabeçalhos como <code className="bg-zinc-200 px-1 rounded">Telefone</code>, <code className="bg-zinc-200 px-1 rounded">Nome</code>, <code className="bg-zinc-200 px-1 rounded">Email</code>.</p>
                <p>Formatos aceites: <code className="bg-zinc-200 px-1 rounded">phone / telefone / tel / celular / mobile / whatsapp</code></p>
              </div>
            </CardContent>
          </Card>

          {/* Contacts table */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="w-4 h-4 text-zinc-500" />
                    Base de Contatos <span className="text-zinc-400 font-normal text-sm">({contacts.length} total)</span>
                  </CardTitle>
                  <CardDescription>Todos os contatos disponíveis para disparos.</CardDescription>
                </div>
                <div className="flex gap-2 items-center">
                  {selectedContactIds.size > 0 && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-1.5"
                      onClick={handleDeleteSelectedContacts}
                      disabled={isDeletingContacts}
                    >
                      {isDeletingContacts ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      Excluir {selectedContactIds.size} selecionado(s)
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={fetchContacts} disabled={contactsLoading} title="Atualizar">
                    <RefreshCw className={`w-4 h-4 ${contactsLoading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>
              <div className="relative mt-2">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-400" />
                <Input
                  placeholder="Buscar por nome, telefone ou email..."
                  className="pl-9 h-9 text-sm"
                  value={contactSearch}
                  onChange={e => setContactSearch(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {contactsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
                </div>
              ) : contacts.length === 0 ? (
                <div className="text-center py-12 text-zinc-400">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Nenhum contato encontrado.</p>
                  <p className="text-xs mt-1">Importe um ficheiro acima ou inicie uma campanha para auto-popular a base.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-zinc-50 border-y border-zinc-200 text-xs text-zinc-500 font-semibold uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedContactIds.size === filteredContacts.length && filteredContacts.length > 0}
                            onChange={toggleAllContacts}
                            className="accent-emerald-600"
                          />
                        </th>
                        <th className="px-4 py-3">Nome</th>
                        <th className="px-4 py-3">Telefone</th>
                        <th className="px-4 py-3">Email</th>
                        <th className="px-4 py-3">Fonte</th>
                        <th className="px-4 py-3">Adicionado</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {filteredContacts.map(c => (
                        <tr key={c.id} className={`hover:bg-zinc-50/80 transition-colors ${selectedContactIds.has(c.id) ? "bg-emerald-50/50" : ""}`}>
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedContactIds.has(c.id)}
                              onChange={() => toggleContactSelect(c.id)}
                              className="accent-emerald-600"
                            />
                          </td>
                          <td className="px-4 py-3 font-medium text-zinc-900">{c.name || "—"}</td>
                          <td className="px-4 py-3 font-mono text-zinc-700">{c.phone}</td>
                          <td className="px-4 py-3 text-zinc-500">{c.email || "—"}</td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              c.source === "upload" ? "bg-blue-100 text-blue-700" :
                              c.source === "whatsapp" ? "bg-emerald-100 text-emerald-700" :
                              "bg-zinc-100 text-zinc-600"
                            }`}>
                              {c.source || "sistema"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-zinc-400 text-xs">
                            {c.created_at ? new Date(c.created_at).toLocaleDateString("pt-BR") : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              title="Excluir"
                              onClick={async () => {
                                setSelectedContactIds(new Set([c.id]));
                                await handleDeleteSelectedContacts();
                              }}
                              className="text-zinc-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── MODAL: NOVA CAMPANHA ── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-y-auto max-h-[92vh]">
            <form onSubmit={handleStartCampaign}>
              <CardHeader className="flex flex-row items-start justify-between pb-4">
                <div>
                  <CardTitle>Criar Nova Campanha</CardTitle>
                  <CardDescription>Configure o disparo em massa ou programe o agendamento para envio automático.</CardDescription>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-zinc-400 hover:text-zinc-700"
                  onClick={() => {
                    setIsModalOpen(false);
                    setScheduleMode("now");
                    setScheduledDateTime("");
                    setExcludedPhones(new Set());
                    setShowContactPreview(false);
                    setPreviewSearch("");
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="campaignName">Nome da Campanha</Label>
                  <Input
                    id="campaignName"
                    placeholder="Ex: Promoção de Verão"
                    value={newCampaign.name}
                    onChange={e => setNewCampaign({ ...newCampaign, name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="template">Template Aprovado</Label>
                  <select
                    id="template"
                    className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
                    value={newCampaign.template}
                    onChange={e => handleTemplateChange(e.target.value)}
                  >
                    {approvedTemplates.map(t => (
                      <option key={t.id} value={t.name}>{t.name} ({t.category})</option>
                    ))}
                  </select>
                </div>

                {selectedTemplate?.content && (
                  <div className="bg-zinc-50 border border-zinc-200 rounded-md p-3">
                    <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-1">Preview do Template</p>
                    <p className="text-sm text-zinc-700 whitespace-pre-wrap">{selectedTemplate.content}</p>
                  </div>
                )}

                {templateVariables.length > 0 && (
                  <div className="space-y-3 border border-zinc-200 rounded-lg p-4 bg-zinc-50">
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      <p className="text-sm font-semibold text-zinc-700">Variáveis do Template</p>
                    </div>
                    <p className="text-xs text-zinc-500 -mt-1">Defina o que cada variável representará na mensagem enviada a cada contacto.</p>
                    {templateVariables.map(varToken => {
                      const varIndex = varToken.replace(/\{\{|\}\}/g, "");
                      const currentVal = templateVars[varIndex];
                      // Support both legacy string and new {source, customValue} object
                      const currentSource: string = typeof currentVal === 'object' && currentVal !== null
                        ? (currentVal as any).source || 'client_name'
                        : (currentVal || 'client_name');
                      const isCustom = currentSource === 'custom';
                      const customText: string = typeof currentVal === 'object' && currentVal !== null
                        ? (currentVal as any).customValue || ''
                        : '';

                      const sourceOptions = [
                        { value: 'client_name', label: '👤 Nome do Cliente', description: 'Ex: João Silva' },
                        { value: 'company_name', label: '🏢 Nome da Empresa', description: 'O nome da sua empresa nas configurações' },
                        { value: 'client_phone', label: '📞 Telefone do Cliente', description: 'Ex: +351 912 345 678' },
                        { value: 'client_email', label: '✉️ E-mail do Cliente', description: 'Ex: cliente@email.com' },
                        { value: 'custom', label: '✏️ Texto personalizado', description: 'Mesmo texto para todos os contactos' },
                      ];

                      const selectedOption = sourceOptions.find(o => o.value === currentSource) || sourceOptions[0];

                      return (
                        <div key={varToken} className="space-y-2 bg-white border border-zinc-200 rounded-md p-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">{varToken}</span>
                            <span className="text-xs text-zinc-400">→</span>
                            <span className="text-xs text-zinc-500">{selectedOption.description}</span>
                          </div>
                          <select
                            id={`var_${varIndex}`}
                            className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                            value={currentSource}
                            onChange={e => {
                              const newSource = e.target.value;
                              setTemplateVars(prev => ({
                                ...prev,
                                [varIndex]: newSource === 'custom'
                                  ? { source: 'custom', customValue: customText }
                                  : { source: newSource }
                              }));
                            }}
                          >
                            {sourceOptions.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          {isCustom && (
                            <Input
                              placeholder="Texto fixo para todos os contactos..."
                              value={customText}
                              onChange={e => setTemplateVars(prev => ({
                                ...prev,
                                [varIndex]: { source: 'custom', customValue: e.target.value }
                              }))}
                              className="text-sm"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Botões */}
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
                      {selectedTemplate?.buttons?.length > 0 && (
                        <div className="flex items-start gap-3 p-3 rounded-md bg-white border border-zinc-200">
                          <input
                            id="useTemplateButtons"
                            type="checkbox"
                            checked={useTemplateButtons}
                            onChange={e => { setUseTemplateButtons(e.target.checked); if (e.target.checked) setButtons([]); }}
                            className="mt-0.5 accent-emerald-600"
                          />
                          <div>
                            <Label htmlFor="useTemplateButtons" className="cursor-pointer">Usar botões do template selecionado</Label>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {selectedTemplate.buttons.map((btn: CampaignButton, i: number) => (
                                <span key={i} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                                  {btn.type === "URL" ? <Link2 className="w-3 h-3" /> : btn.type === "PHONE_NUMBER" ? <Phone className="w-3 h-3" /> : <MousePointer2 className="w-3 h-3" />}
                                  {btn.text}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {(!useTemplateButtons || !selectedTemplate?.buttons?.length) && (
                        <>
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-zinc-500">Configure botões para esta campanha (máx. 3).</p>
                            <Button type="button" variant="outline" size="sm" onClick={addButton} disabled={buttons.length >= 3} className="gap-1 text-xs">
                              <Plus className="w-3.5 h-3.5" /> Botão
                            </Button>
                          </div>
                          <ButtonPresetsPicker currentCount={buttons.length} onSelect={applyPreset} />
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
                                      className="flex h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs"
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
                                    <Input className="h-8 text-xs" placeholder="Saiba mais" maxLength={25} value={btn.text} onChange={e => updateButton(idx, "text", e.target.value)} />
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
                  <Label htmlFor="audience">Público Alvo</Label>
                  <select
                    id="audience"
                    className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
                    value={newCampaign.audience}
                    onChange={e => setNewCampaign({ ...newCampaign, audience: e.target.value })}
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
                    onChange={e => setNewCampaign({ ...newCampaign, filters: e.target.value })}
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
                    onChange={e => setNewCampaign({ ...newCampaign, delay_seconds: parseInt(e.target.value) || 5 })}
                  />
                  <p className="text-[10px] text-zinc-500 italic">Recomendamos no mínimo 5 segundos para evitar bloqueios de spam da Meta.</p>
                </div>

                {/* ── PROGRAMAÇÃO / AGENDAMENTO DO DISPARO ── */}
                <div className="space-y-3 border border-zinc-200 rounded-lg p-4 bg-zinc-50/80">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold text-zinc-800 flex items-center gap-2">
                      <CalendarClock className="w-4 h-4 text-indigo-600" />
                      Programação do Envio
                    </Label>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                      scheduleMode === "scheduled" ? "bg-indigo-100 text-indigo-700 font-semibold" : "bg-emerald-100 text-emerald-700"
                    }`}>
                      {scheduleMode === "scheduled" ? "Agendamento Ativo" : "Disparo Imediato"}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setScheduleMode("now")}
                      className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                        scheduleMode === "now"
                          ? "border-emerald-600 bg-white ring-2 ring-emerald-600/20 shadow-sm"
                          : "border-zinc-200 bg-white/60 hover:bg-white hover:border-zinc-300"
                      }`}
                    >
                      <div className={`p-2 rounded-md shrink-0 ${scheduleMode === "now" ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-600"}`}>
                        <Zap className="w-4 h-4" />
                      </div>
                      <div>
                        <p className={`text-xs font-semibold ${scheduleMode === "now" ? "text-emerald-900" : "text-zinc-800"}`}>
                          Enviar Imediatamente
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          Inicia o disparo para a lista logo após a confirmação.
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setScheduleMode("scheduled");
                        if (!scheduledDateTime) {
                          const defaultDate = new Date(Date.now() + 30 * 60000);
                          setScheduledDateTime(formatDateTimeLocal(defaultDate));
                        }
                      }}
                      className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                        scheduleMode === "scheduled"
                          ? "border-indigo-600 bg-white ring-2 ring-indigo-600/20 shadow-sm"
                          : "border-zinc-200 bg-white/60 hover:bg-white hover:border-zinc-300"
                      }`}
                    >
                      <div className={`p-2 rounded-md shrink-0 ${scheduleMode === "scheduled" ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-600"}`}>
                        <CalendarClock className="w-4 h-4" />
                      </div>
                      <div>
                        <p className={`text-xs font-semibold ${scheduleMode === "scheduled" ? "text-indigo-900" : "text-zinc-800"}`}>
                          Agendar para Mais Tarde
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          Define data e hora futuras para o disparo automático.
                        </p>
                      </div>
                    </button>
                  </div>

                  {scheduleMode === "scheduled" && (
                    <div className="mt-3 pt-3 border-t border-zinc-200 space-y-3 animate-in fade-in-50 duration-150">
                      <div className="space-y-1.5">
                        <Label htmlFor="scheduledDateTime" className="text-xs font-medium text-zinc-700 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                            Data e Hora do Disparo Programado
                          </span>
                          <span className="text-[10px] text-zinc-400">Horário Local / Angola (WAT)</span>
                        </Label>
                        <Input
                          id="scheduledDateTime"
                          type="datetime-local"
                          min={formatDateTimeLocal(new Date(Date.now() + 5 * 60000))}
                          value={scheduledDateTime}
                          onChange={e => setScheduledDateTime(e.target.value)}
                          className="h-10 text-sm bg-white border-indigo-200 focus-visible:ring-indigo-500"
                        />
                        <p className="text-[11px] text-zinc-500">
                          O servidor disparará as mensagens automaticamente quando a data e hora forem alcançadas.
                        </p>
                      </div>

                      {/* Atalhos Rápidos */}
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Atalhos Rápidos:</span>
                        <div className="flex flex-wrap gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] px-2.5 bg-white hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300"
                            onClick={() => setScheduledDateTime(formatDateTimeLocal(new Date(Date.now() + 30 * 60000)))}
                          >
                            +30 min
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] px-2.5 bg-white hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300"
                            onClick={() => setScheduledDateTime(formatDateTimeLocal(new Date(Date.now() + 60 * 60000)))}
                          >
                            +1 hora
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] px-2.5 bg-white hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300"
                            onClick={() => setScheduledDateTime(formatDateTimeLocal(new Date(Date.now() + 3 * 3600000)))}
                          >
                            +3 horas
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] px-2.5 bg-white hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300"
                            onClick={() => {
                              const d = new Date();
                              d.setDate(d.getDate() + 1);
                              d.setHours(9, 0, 0, 0);
                              setScheduledDateTime(formatDateTimeLocal(d));
                            }}
                          >
                            Amanhã às 09:00
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] px-2.5 bg-white hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300"
                            onClick={() => {
                              const d = new Date();
                              d.setDate(d.getDate() + 1);
                              d.setHours(14, 0, 0, 0);
                              setScheduledDateTime(formatDateTimeLocal(d));
                            }}
                          >
                            Amanhã às 14:00
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── PREVIEW DE CONTATOS PARA ENVIO ── */}
                <div className="space-y-3 border border-zinc-200 rounded-lg p-4 bg-zinc-50">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between text-sm font-semibold text-zinc-700"
                    onClick={() => setShowContactPreview(v => !v)}
                  >
                    <span className="flex items-center gap-2">
                      <ListChecks className="w-4 h-4 text-emerald-600" />
                      Revisar Contatos para Envio
                      {isEstimating ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
                      ) : previewContacts.length > 0 ? (
                        <span className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                            {effectiveSendCount} para envio
                          </span>
                          {excludedPhones.size > 0 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                              {excludedPhones.size} excluído(s)
                            </span>
                          )}
                        </span>
                      ) : null}
                    </span>
                    {showContactPreview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {showContactPreview && (
                    <div className="space-y-3 pt-1">
                      {isEstimating ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                          <span className="ml-2 text-sm text-zinc-500">Carregando contatos...</span>
                        </div>
                      ) : previewContacts.length === 0 ? (
                        <div className="border-2 border-dashed border-zinc-200 rounded-lg py-6 text-center text-zinc-400 text-xs">
                          <Users className="w-6 h-6 mx-auto mb-2 opacity-40" />
                          Nenhum contato encontrado para o público e filtros selecionados.
                        </div>
                      ) : (
                        <>
                          {/* Barra de ações */}
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="relative flex-1 min-w-[200px]">
                              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-400" />
                              <Input
                                placeholder="Buscar nome, telefone ou email..."
                                className="pl-8 h-9 text-xs"
                                value={previewSearch}
                                onChange={e => setPreviewSearch(e.target.value)}
                              />
                            </div>
                            <div className="flex gap-1.5">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1 text-xs"
                                onClick={includeAllVisible}
                                title="Incluir todos os visíveis no envio"
                              >
                                <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                                Incluir Todos
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1 text-xs"
                                onClick={excludeAllVisible}
                                title="Excluir todos os visíveis deste envio"
                              >
                                <UserMinus className="w-3.5 h-3.5 text-amber-600" />
                                Excluir Todos
                              </Button>
                              {excludedPhones.size > 0 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="gap-1 text-xs text-zinc-500"
                                  onClick={() => setExcludedPhones(new Set())}
                                  title="Limpar todas as exclusões"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  Resetar
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Info box */}
                          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            Contatos excluídos aqui são removidos <strong>apenas deste envio</strong>. Eles continuam na base para campanhas futuras.
                          </div>

                          {/* Lista de contatos */}
                          <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white max-h-64 overflow-y-auto">
                            <table className="w-full text-xs text-left">
                              <thead className="bg-zinc-50 text-zinc-600 border-b border-zinc-200 sticky top-0 z-10">
                                <tr>
                                  <th className="px-3 py-2.5 font-semibold w-10">Status</th>
                                  <th className="px-3 py-2.5 font-semibold">Nome</th>
                                  <th className="px-3 py-2.5 font-semibold">Telefone</th>
                                  <th className="px-3 py-2.5 font-semibold hidden sm:table-cell">Fonte</th>
                                  <th className="px-3 py-2.5 w-10"></th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-100">
                                {filteredPreviewContacts.map(c => {
                                  const isExcluded = excludedPhones.has(c.phone);
                                  return (
                                    <tr
                                      key={c.phone}
                                      className={`transition-colors cursor-pointer ${
                                        isExcluded
                                          ? "bg-amber-50/60 hover:bg-amber-50"
                                          : "hover:bg-zinc-50/80"
                                      }`}
                                      onClick={() => toggleExcludePhone(c.phone)}
                                    >
                                      <td className="px-3 py-2.5 text-center">
                                        {isExcluded ? (
                                          <EyeOff className="w-3.5 h-3.5 text-amber-500 mx-auto" />
                                        ) : (
                                          <Eye className="w-3.5 h-3.5 text-emerald-500 mx-auto" />
                                        )}
                                      </td>
                                      <td className={`px-3 py-2.5 font-medium ${isExcluded ? "text-zinc-400 line-through" : "text-zinc-900"}`}>
                                        {c.name || "—"}
                                      </td>
                                      <td className={`px-3 py-2.5 font-mono ${isExcluded ? "text-zinc-400 line-through" : "text-zinc-700"}`}>
                                        {c.phone}
                                      </td>
                                      <td className="px-3 py-2.5 hidden sm:table-cell">
                                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                          isExcluded ? "bg-zinc-100 text-zinc-400" :
                                          c.source === "upload" ? "bg-blue-100 text-blue-700" :
                                          c.source === "whatsapp" ? "bg-emerald-100 text-emerald-700" :
                                          c.source === "booking" ? "bg-purple-100 text-purple-700" :
                                          "bg-zinc-100 text-zinc-600"
                                        }`}>
                                          {c.source || "sistema"}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2.5">
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); toggleExcludePhone(c.phone); }}
                                          className={`text-xs font-medium px-2 py-1 rounded-md transition-colors ${
                                            isExcluded
                                              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                              : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                                          }`}
                                          title={isExcluded ? "Incluir neste envio" : "Excluir deste envio"}
                                        >
                                          {isExcluded ? "Incluir" : "Excluir"}
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          {/* Resumo */}
                          <div className="flex items-center justify-between text-xs text-zinc-500 pt-1">
                            <span>
                              Mostrando {filteredPreviewContacts.length} de {previewContacts.length} contato(s)
                              {previewSearch && ` (filtrado por "${previewSearch}")`}
                            </span>
                            <span className="font-semibold text-zinc-700">
                              Serão enviados: <span className="text-emerald-700">{effectiveSendCount}</span> / {previewContacts.length}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mt-2">
                  <p className="text-xs text-amber-800 font-medium flex gap-1.5 items-start">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    O envio em massa pode resultar em banimento se os clientes denunciarem as mensagens como spam. Certifique-se de que os contatos fizeram opt-in.
                  </p>
                </div>
              </CardContent>
              <CardFooter className="bg-zinc-50 border-t border-zinc-200 py-4 flex justify-between items-center gap-2 rounded-b-xl">
                <div className="text-xs text-zinc-500">
                  {previewContacts.length > 0 && (
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      <span className="font-semibold text-zinc-700">{effectiveSendCount}</span> contato(s) receberão o disparo
                      {excludedPhones.size > 0 && (
                        <span className="text-amber-600">({excludedPhones.size} excluído{excludedPhones.size > 1 ? "s" : ""})</span>
                      )}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsModalOpen(false);
                      setScheduleMode("now");
                      setScheduledDateTime("");
                      setExcludedPhones(new Set());
                      setShowContactPreview(false);
                      setPreviewSearch("");
                    }}
                    disabled={isSubmitting}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting || effectiveSendCount === 0}
                    className={`min-w-[150px] transition-all ${
                      scheduleMode === "scheduled"
                        ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-200"
                        : "bg-emerald-600 hover:bg-emerald-700 text-white"
                    }`}
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : scheduleMode === "scheduled" ? (
                      <CalendarClock className="w-4 h-4 mr-2" />
                    ) : (
                      <PlayCircle className="w-4 h-4 mr-2" />
                    )}
                    {isSubmitting
                      ? (scheduleMode === "scheduled" ? "Agendando..." : "Iniciando...")
                      : scheduleMode === "scheduled"
                        ? `Agendar Campanha (${effectiveSendCount})`
                        : `Iniciar Disparo (${effectiveSendCount})`
                    }
                  </Button>
                </div>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {/* ── MODAL: RELATÓRIO DETALHADO ── */}
      {isReportOpen && (
        <div className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-4xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-y-auto max-h-[92vh]">
            <CardHeader className="border-b border-zinc-100 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-bold flex items-center gap-2 text-zinc-900">
                    <FileText className="w-5 h-5 text-emerald-600" />
                    Relatório da Campanha
                  </CardTitle>
                  {selectedReport?.campaign && (
                    <CardDescription className="mt-1 flex items-center gap-2 flex-wrap">
                      <span><strong>{selectedReport.campaign.name}</strong> • Template: <strong>{selectedReport.campaign.template}</strong> • Criada em: {selectedReport.campaign.date}</span>
                      {selectedReport.campaign.status === "SCHEDULED" && selectedReport.campaign.scheduledAtFormatted && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <CalendarClock className="w-3.5 h-3.5 text-indigo-600" />
                          Disparo agendado para: {selectedReport.campaign.scheduledAtFormatted}
                        </span>
                      )}
                    </CardDescription>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setIsReportOpen(false)}>✕ Fechar</Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-6 pt-5">
              {isReportLoading ? (
                <div className="flex h-48 items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                </div>
              ) : selectedReport ? (
                <>
                  {/* Métricas */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 text-center">
                      <p className="text-xs text-zinc-500 font-medium">Total de Alvos</p>
                      <p className="text-2xl font-bold text-zinc-900 mt-1">{selectedReport.campaign.totalContacts || selectedReport.logs.length}</p>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-center">
                      <p className="text-xs text-emerald-700 font-medium">Enviados</p>
                      <p className="text-2xl font-bold text-emerald-800 mt-1">{selectedReport.campaign.sentCount}</p>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 text-center">
                      <p className="text-xs text-red-700 font-medium">Falhas</p>
                      <p className="text-2xl font-bold text-red-800 mt-1">{selectedReport.campaign.failedCount}</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 text-center">
                      <p className="text-xs text-blue-700 font-medium">Progresso</p>
                      <p className="text-2xl font-bold text-blue-800 mt-1">{selectedReport.campaign.progress}%</p>
                    </div>
                  </div>

                  {/* Tabela de logs */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <h4 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                        <Users className="w-4 h-4 text-zinc-500" />
                        Números Atingidos ({logsFiltered.length})
                      </h4>
                      <div className="flex gap-2 items-center">
                        {selectedLogIds.size > 0 && (
                          <Button
                            variant="destructive"
                            size="sm"
                            className="gap-1.5 text-xs"
                            onClick={handleDeleteSelectedLogs}
                            disabled={isDeletingLogs}
                          >
                            {isDeletingLogs ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                            Excluir {selectedLogIds.size}
                          </Button>
                        )}
                        <div className="relative w-56">
                          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-400" />
                          <Input
                            placeholder="Buscar telefone ou nome..."
                            className="pl-8 h-9 text-xs"
                            value={reportSearch}
                            onChange={e => setReportSearch(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white max-h-72 overflow-y-auto">
                      {selectedReport.logs.length === 0 ? (
                        <div className="p-8 text-center text-xs text-zinc-500">
                          Nenhum número registrado ainda. Os logs são gravados em tempo real durante o disparo.
                        </div>
                      ) : (
                        <table className="w-full text-xs text-left">
                          <thead className="bg-zinc-50 text-zinc-600 border-b border-zinc-200 sticky top-0">
                            <tr>
                              <th className="px-4 py-2.5">
                                <input
                                  type="checkbox"
                                  checked={selectedLogIds.size === logsFiltered.length && logsFiltered.length > 0}
                                  onChange={toggleAllLogs}
                                  className="accent-emerald-600"
                                />
                              </th>
                              <th className="px-4 py-2.5 font-semibold">Contato</th>
                              <th className="px-4 py-2.5 font-semibold">Telefone</th>
                              <th className="px-4 py-2.5 font-semibold">Status</th>
                              <th className="px-4 py-2.5 font-semibold">Data / Hora</th>
                              <th className="px-4 py-2.5"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100">
                            {logsFiltered.map(log => (
                              <tr key={log.id} className={`hover:bg-zinc-50/80 transition-colors ${selectedLogIds.has(log.id) ? "bg-red-50/40" : ""}`}>
                                <td className="px-4 py-2.5">
                                  <input
                                    type="checkbox"
                                    checked={selectedLogIds.has(log.id)}
                                    onChange={() => toggleLogSelection(log.id)}
                                    className="accent-emerald-600"
                                  />
                                </td>
                                <td className="px-4 py-2.5 font-medium text-zinc-900">{log.name}</td>
                                <td className="px-4 py-2.5 font-mono text-zinc-700">{log.phone}</td>
                                <td className="px-4 py-2.5">
                                  {log.status === "sent" ? (
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
                                <td className="px-4 py-2.5">
                                  <button
                                    title="Remover da lista"
                                    onClick={() => {
                                      setSelectedLogIds(new Set([log.id]));
                                      handleDeleteSelectedLogs();
                                    }}
                                    className="text-zinc-300 hover:text-red-500 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
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
              <Button variant="outline" onClick={() => setIsReportOpen(false)}>Fechar Relatório</Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
