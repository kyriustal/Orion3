import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Switch } from "@/src/components/ui/switch";
import { 
  Smartphone, Copy, AlertCircle, Plus, Loader2, Trash2, 
  RefreshCw, CheckCircle2, Key, Building, Webhook, ShieldCheck, 
  Eye, EyeOff, Pencil, Lock, ExternalLink 
} from "lucide-react";
import { PasswordConfirmationModal } from "@/src/components/auth/PasswordConfirmationModal";

type WhatsAppConfigData = {
  id?: string;
  phone_number_id: string;
  waba_id?: string;
  access_token: string;
  display_name?: string;
  phone?: string;
  app_id?: string;
  client_secret?: string;
  description?: string;
  business_category?: string;
  profile_picture_url?: string;
  website?: string;
  support_email?: string;
  is_active: boolean;
};

type WhatsAppNumber = {
  id: string;
  phone: string;
  phoneId: string;
  wabaId: string;
  appId?: string;
  status: 'connected' | 'testing' | 'error';
  token?: string;
  displayName?: string;
  businessCategory?: string;
  website?: string;
  supportEmail?: string;
  description?: string;
};

const newNumberSchema = z.object({
  phone: z.string().min(6, "Número de exibição é obrigatório"),
  phoneId: z.string().min(5, "ID inválido"),
  wabaId: z.string().min(5, "WABA ID inválido"),
  token: z.string().min(10, "Token inválido"),
  appId: z.string().optional(),
  clientSecret: z.string().optional(),
  displayName: z.string().min(2, "O Nome do Bot é obrigatório"),
  businessCategory: z.string().optional(),
  description: z.string().optional(),
  profilePictureUrl: z.union([z.literal(""), z.string().url("URL de imagem inválida").optional()]),
  website: z.union([z.literal(""), z.string().url("Website inválido").optional()]),
  supportEmail: z.union([z.literal(""), z.string().email("E-mail inválido").optional()])
});

type NewNumberFormValues = z.infer<typeof newNumberSchema>;

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

export default function WhatsAppConfig() {
  const [webhookUrl] = useState(`${window.location.origin}/api/whatsapp/webhook`);
  const [verifyToken] = useState("orion_secure_token_123");
  const metaAppId = import.meta.env.VITE_META_APP_ID || "34557883637136073";
  const metaWhatsappConfigId = import.meta.env.VITE_META_WHATSAPP_CONFIG_ID || "";
  const metaWhatsappFeatureType = import.meta.env.VITE_META_WHATSAPP_FEATURE_TYPE || "";

  const [numbers, setNumbers] = useState<WhatsAppNumber[]>([]);
  const [rawConfig, setRawConfig] = useState<WhatsAppConfigData | null>(null);
  const [webhookDiagnostic, setWebhookDiagnostic] = useState<any>(null);
  const [showTokenPreview, setShowTokenPreview] = useState(false);

  // Modais
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [pendingCredentialAction, setPendingCredentialAction] = useState<null | 'showToken' | 'copyToken'>(null);
  const [hasCredentialAccess, setHasCredentialAccess] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isEmbeddedSignupStarting, setIsEmbeddedSignupStarting] = useState(false);
  const embeddedAuthRef = useRef<{ code?: string; accessToken?: string } | null>(null);
  const embeddedSessionRef = useRef<{ wabaId?: string; phoneNumberId?: string } | null>(null);
  const embeddedCompletionStartedRef = useRef(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<NewNumberFormValues>({
    resolver: zodResolver(newNumberSchema),
  });

  const fetchConfig = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      const response = await fetch("/api/whatsapp/config", {
        headers: { "Authorization": `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error("Failed to fetch WhatsApp config");
      }

      const data = await response.json();

      if (data && data.is_active && data.phone_number_id) {
        setRawConfig(data);
        const resolvedPhone = data.phone || data.display_name || 'Conta WhatsApp Business Conectada';
        setNumbers([{
          id: data.id || '1',
          phone: resolvedPhone,
          phoneId: data.phone_number_id,
          wabaId: data.waba_id || 'Não especificado',
          appId: data.app_id || '',
          status: 'connected',
          token: data.access_token || '',
          displayName: data.display_name || '',
          businessCategory: data.business_category || '',
          website: data.website || '',
          supportEmail: data.support_email || '',
          description: data.description || '',
        }]);
      } else {
        setRawConfig(null);
        setNumbers([]);
      }
    } catch (error) {
      console.error("Erro ao carregar configurações do WhatsApp:", error);
    }
  };

  const fetchWebhookDiagnostics = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const response = await fetch("/api/whatsapp/webhook-diagnostics", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (response.ok) {
        setWebhookDiagnostic(await response.json());
      }
    } catch (error) {
      console.warn("Erro ao carregar diagnóstico do webhook:", error);
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchWebhookDiagnostics();
  }, []);

  // Preencher formulário ao abrir edição
  const handleOpenEditModal = () => {
    if (rawConfig) {
      setValue("phone", rawConfig.phone || rawConfig.display_name || "");
      setValue("phoneId", rawConfig.phone_number_id || "");
      setValue("wabaId", rawConfig.waba_id || "");
      setValue("token", rawConfig.access_token || "");
      setValue("appId", rawConfig.app_id || "");
      setValue("displayName", rawConfig.display_name || "Orion Assistant");
      setValue("businessCategory", rawConfig.business_category || "");
      setValue("description", rawConfig.description || "");
      setValue("website", rawConfig.website || "");
      setValue("supportEmail", rawConfig.support_email || "");
      setValue("profilePictureUrl", rawConfig.profile_picture_url || "");
    }
    setIsModalOpen(true);
  };

  const handleOpenNewModal = () => {
    reset({
      phone: "",
      phoneId: "",
      wabaId: "",
      token: "",
      displayName: "Orion Assistant",
      businessCategory: "",
      description: "",
      appId: metaAppId,
      clientSecret: "",
      website: "",
      supportEmail: "",
      profilePictureUrl: ""
    });
    setIsModalOpen(true);
  };

  // Submissão do formulário: configuração/edição não exige palavra-passe.
  const onSubmitNewNumber = (data: NewNumberFormValues) => {
    executeSaveConfig(data);
  };

  const executeSaveConfig = async (formData: NewNumberFormValues) => {
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/whatsapp/config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          phone_number_id: formData.phoneId,
          waba_id: formData.wabaId,
          access_token: formData.token,
          app_id: formData.appId,
          client_secret: formData.clientSecret,
          display_name: formData.displayName,
          phone: formData.phone,
          business_category: formData.businessCategory,
          description: formData.description,
          profile_picture_url: formData.profilePictureUrl,
          website: formData.website,
          support_email: formData.supportEmail,
        })
      });

      const resData = await response.json();

      if (!response.ok) {
        throw new Error(resData.error || resData.message || "Falha ao salvar configuração.");
      }

      toast.success(resData.message || "WhatsApp configurado e verificado com sucesso!");
      setIsModalOpen(false);
      setIsPasswordModalOpen(false);
      reset();
      await fetchConfig();

      toast.info("A sincronizar dados com a Meta...");
      await handleSyncWebhooks();

    } catch (error: any) {
      toast.error(`Falha: ${error.message}`);
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  const [subscriptions, setSubscriptions] = useState({
    messages: true,
    statuses: false,
    message_template_status_update: false
  });

  const handleTestConnection = async (id: string) => {
    setNumbers(prev => prev.map(n => n.id === id ? { ...n, status: 'testing' } : n));
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/whatsapp/ping", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.config_active) {
        setNumbers(prev => prev.map(n => n.id === id ? { ...n, status: 'connected' } : n));
        toast.success(`Conexão verificada com sucesso! Bot: ${data.bot_name}`);
      } else {
        throw new Error("Configuração inativa");
      }
    } catch {
      setNumbers(prev => prev.map(n => n.id === id ? { ...n, status: 'error' } : n));
      toast.error("Erro ao verificar conexão com o WhatsApp.");
    }
  };

  const handleDisconnect = async (id: string) => {
    if (!window.confirm("Tem certeza que deseja desconectar este número? A IA parará de responder imediatamente.")) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/whatsapp/config", {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) {
        let errMsg = `Erro ${res.status}`;
        try { const d = await res.json(); errMsg = d.error || d.message || errMsg; } catch {}
        throw new Error(errMsg);
      }
      setNumbers([]);
      setRawConfig(null);
      toast.success("Número desconectado com sucesso.");
    } catch (error: any) {
      toast.error(`Erro ao desconectar: ${error.message}`);
    }
  };

  const handleSyncWebhooks = async () => {
    setIsSyncing(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/whatsapp/webhook-sync", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao sincronizar webhooks.");
      }
      toast.success(data.message || "Inscrições do Webhook sincronizadas com a Meta com sucesso!");
      await fetchWebhookDiagnostics();
    } catch (error: any) {
      toast.error(error.message || "Erro ao sincronizar webhooks.");
    } finally {
      setIsSyncing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success("Copiado para a área de transferência!");
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
    const token = numbers[0]?.token || "";
    if (action === 'showToken') setShowTokenPreview(true);
    if (action === 'copyToken') copyToClipboard(token);
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

  const ensureMetaSdk = () => new Promise<void>((resolve, reject) => {
    if (window.FB) {
      window.FB.init({
        appId: metaAppId,
        cookie: true,
        xfbml: true,
        version: 'v19.0'
      });
      resolve();
      return;
    }

    const timeout = window.setTimeout(() => {
      reject(new Error("O SDK da Meta demorou demasiado a carregar."));
    }, 12000);

    window.fbAsyncInit = function () {
      window.clearTimeout(timeout);
      window.FB?.init({
        appId: metaAppId,
        cookie: true,
        xfbml: true,
        version: 'v19.0'
      });
      resolve();
    };

    if (!document.getElementById('facebook-jssdk')) {
      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.async = true;
      script.defer = true;
      script.crossOrigin = 'anonymous';
      script.src = 'https://connect.facebook.net/pt_PT/sdk.js';
      script.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error("Não foi possível carregar o SDK da Meta. Verifique bloqueadores de anúncios ou permissões do navegador."));
      };
      document.body.appendChild(script);
    }
  });

  const completeEmbeddedSignup = async () => {
    const auth = embeddedAuthRef.current;
    const session = embeddedSessionRef.current;
    if (embeddedCompletionStartedRef.current || !auth || !session) return;

    embeddedCompletionStartedRef.current = true;
    setIsEmbeddedSignupStarting(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/whatsapp/embedded-signup/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          code: auth.code,
          access_token: auth.accessToken,
          waba_id: session.wabaId,
          phone_number_id: session.phoneNumberId,
          app_id: metaAppId,
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Não foi possível concluir a conexão automática com a Meta.");
      }

      toast.success(data.message || "WhatsApp conectado com a Meta.");
      await fetchConfig();
      await fetchWebhookDiagnostics();
    } catch (error: any) {
      embeddedCompletionStartedRef.current = false;
      toast.error(error.message || "Erro ao concluir conexão com a Meta.");
      if (embeddedSessionRef.current) {
        reset({
          phone: "",
          phoneId: embeddedSessionRef.current.phoneNumberId || "",
          wabaId: embeddedSessionRef.current.wabaId || "",
          token: "",
          appId: metaAppId,
          clientSecret: "",
          displayName: "Orion Assistant",
          businessCategory: "",
          description: "",
          website: "",
          supportEmail: "",
          profilePictureUrl: ""
        });
        setIsModalOpen(true);
      }
    } finally {
      setIsEmbeddedSignupStarting(false);
    }
  };

  // Embedded Signup Logic
  const launchEmbeddedSignup = async () => {
    if (!metaWhatsappConfigId) {
      toast.error("Falta configurar o ID da configuração de Login for Business da Meta.");
      toast.info("Adicione VITE_META_WHATSAPP_CONFIG_ID no ambiente ou use a configuração manual.");
      handleOpenNewModal();
      return;
    }

    setIsEmbeddedSignupStarting(true);
    embeddedAuthRef.current = null;
    embeddedSessionRef.current = null;
    embeddedCompletionStartedRef.current = false;

    try {
      await ensureMetaSdk();

      const extras: Record<string, any> = {
        setup: {},
        sessionInfoVersion: '3',
      };
      if (metaWhatsappFeatureType) {
        extras.featureType = metaWhatsappFeatureType;
        extras.version = 'v3';
      }

      window.FB.login((response: any) => {
        if (response?.authResponse?.code) {
          embeddedAuthRef.current = { code: response.authResponse.code };
          toast.success("Autorização recebida da Meta.");
          completeEmbeddedSignup();
          return;
        }

        if (response?.authResponse?.accessToken) {
          embeddedAuthRef.current = { accessToken: response.authResponse.accessToken };
          toast.success("Sessão Meta autorizada.");
          completeEmbeddedSignup();
          return;
        }

        setIsEmbeddedSignupStarting(false);
        toast.error("A conexão com a Meta foi cancelada ou não foi autorizada.");
      }, {
        config_id: metaWhatsappConfigId,
        response_type: 'code',
        override_default_response_type: true,
        extras
      });
    } catch (error: any) {
      setIsEmbeddedSignupStarting(false);
      toast.error(error.message || "Erro ao iniciar conexão com a Meta.");
    }
  };

  useEffect(() => {
    const handleEmbeddedSignupMessage = (event: MessageEvent) => {
      let isMetaOrigin = false;
      try {
        const hostname = new URL(event.origin).hostname;
        isMetaOrigin = hostname === "facebook.com" || hostname.endsWith(".facebook.com");
      } catch {
        isMetaOrigin = false;
      }
      if (!isMetaOrigin) return;

      let payload: any = event.data;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }

      if (payload?.type !== "WA_EMBEDDED_SIGNUP") return;

      if (payload.event === "FINISH" || payload.event === "FINISH_ONLY_WABA") {
        const phoneNumberId = payload.data?.phone_number_id || "";
        const wabaId = payload.data?.waba_id || payload.data?.business_account_id || "";

        embeddedSessionRef.current = { phoneNumberId, wabaId };
        toast.success("Dados da conta WhatsApp recebidos da Meta.");
        completeEmbeddedSignup();
      }

      if (payload.event === "CANCEL") {
        setIsEmbeddedSignupStarting(false);
        toast.error("A conexão com a Meta foi cancelada antes de terminar.");
      }
    };

    window.addEventListener("message", handleEmbeddedSignupMessage);
    return () => window.removeEventListener("message", handleEmbeddedSignupMessage);
  }, [metaAppId, reset]);

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Gestão de WhatsApp</h2>
        <p className="text-zinc-500 text-sm mt-1">Conecte, pré-visualize e edite os parâmetros da sua conta do WhatsApp Business via Meta Cloud API.</p>
      </div>

      {webhookDiagnostic && (!webhookDiagnostic.callbackOk || !webhookDiagnostic.environment?.hasMetaAppId || !webhookDiagnostic.environment?.hasMetaAppSecret) && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-amber-900">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-amber-950">Webhook da Meta ainda não está pronto para receber mensagens.</p>
            {!webhookDiagnostic.callbackOk && (
              <p className="text-xs text-amber-800">{webhookDiagnostic.callbackIssue}</p>
            )}
            {!webhookDiagnostic.environment?.hasMetaAppId && (
              <p className="text-xs text-amber-800">Configure <code className="font-mono bg-amber-100 px-1 rounded">META_APP_ID</code> no backend.</p>
            )}
            {!webhookDiagnostic.environment?.hasMetaAppSecret && (
              <p className="text-xs text-amber-800">Configure <code className="font-mono bg-amber-100 px-1 rounded">META_APP_SECRET</code> no backend.</p>
            )}
            <p className="text-xs text-amber-800">
              URL atual do webhook: <code className="font-mono bg-white/70 px-1 rounded break-all">{webhookDiagnostic.callbackUrl}</code>
            </p>
          </div>
        </div>
      )}

      {/* Card Principal: Números Conectados & Pré-visualização de Dados */}
      <Card className="border-zinc-200/80 shadow-sm overflow-hidden">
        <CardHeader className="bg-zinc-50/50 border-b border-zinc-100 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg text-zinc-900">
                <Smartphone className="w-5 h-5 text-emerald-600" /> WhatsApp Business Conectado
              </CardTitle>
              <CardDescription>
                Consulte os IDs, tokens e dados da integração ou edite os parâmetros com segurança.
              </CardDescription>
            </div>
            {numbers.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 w-fit">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Meta Cloud API Ativa
              </span>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {numbers.length === 0 ? (
            <div className="text-center py-10 text-zinc-500 border-2 border-dashed border-zinc-200 rounded-2xl bg-zinc-50/40">
              <Smartphone className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
              <p className="font-medium text-zinc-700">Nenhum número de WhatsApp conectado no momento.</p>
              <p className="text-xs text-zinc-400 mt-1">Clique em "Conectar com Meta" ou realize a "Configuração Manual".</p>
            </div>
          ) : (
            numbers.map((num) => (
              <div key={num.id} className="space-y-4">
                {/* Cabeçalho do Número */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-zinc-200 bg-white shadow-xs gap-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                      num.status === 'testing' ? 'bg-amber-100 text-amber-600' :
                      num.status === 'error' ? 'bg-red-100 text-red-600' : 'bg-emerald-500 text-white'
                    }`}>
                      {num.status === 'testing' ? <RefreshCw className="w-6 h-6 animate-spin" /> :
                        num.status === 'error' ? <AlertCircle className="w-6 h-6" /> : <Smartphone className="w-6 h-6" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-zinc-900 text-base">{num.displayName || "WhatsApp Business"}</p>
                        <span className="text-xs px-2 py-0.5 rounded-md font-mono bg-zinc-100 text-zinc-600 font-semibold">
                          {num.phone}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-medium mt-1">
                        {num.status === 'testing' ? (
                          <span className="text-amber-600 flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> A testar conexão...</span>
                        ) : num.status === 'error' ? (
                          <span className="text-red-600 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> Erro de conexão</span>
                        ) : (
                          <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Conectado e a Responder</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Ações de teste, edição e desconexão */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTestConnection(num.id)}
                      disabled={num.status === 'testing'}
                      className="bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-700"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${num.status === 'testing' ? 'animate-spin' : ''}`} />
                      Testar
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleOpenEditModal}
                      className="bg-white hover:bg-emerald-50 border-emerald-200 text-emerald-700 font-medium"
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                      Editar Dados
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDisconnect(num.id)}
                      disabled={num.status === 'testing'}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 bg-white"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                      Desconectar
                    </Button>
                  </div>
                </div>

                {/* PAINEL DE PRÉ-VISUALIZAÇÃO COMPLETA DOS DADOS (IDs, Tokens, Telefone) */}
                <div className="p-5 rounded-2xl bg-zinc-50/80 border border-zinc-200/90 space-y-4">
                  <div className="flex items-center justify-between border-b border-zinc-200 pb-2">
                    <div className="flex items-center gap-2">
                      <Key className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-bold uppercase tracking-wider text-zinc-700">
                        Pré-visualização de Credenciais & Identificadores Meta
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <Lock className="w-3.5 h-3.5" />
                      <span>Protegido com Palavra-passe</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Phone Number ID */}
                    <div className="bg-white p-3.5 rounded-xl border border-zinc-200 shadow-2xs">
                      <div className="flex items-center justify-between text-xs text-zinc-500 font-medium mb-1">
                        <span>Phone Number ID</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyToClipboard(num.phoneId)}
                          className="h-6 w-6 text-zinc-400 hover:text-zinc-700"
                          title="Copiar Phone Number ID"
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                      <p className="font-mono text-xs font-bold text-zinc-800 break-all select-all">
                        {num.phoneId}
                      </p>
                    </div>

                    {/* WABA ID */}
                    <div className="bg-white p-3.5 rounded-xl border border-zinc-200 shadow-2xs">
                      <div className="flex items-center justify-between text-xs text-zinc-500 font-medium mb-1">
                        <span>WhatsApp Business Account ID (WABA)</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyToClipboard(num.wabaId)}
                          className="h-6 w-6 text-zinc-400 hover:text-zinc-700"
                          title="Copiar WABA ID"
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                      <p className="font-mono text-xs font-bold text-zinc-800 break-all select-all">
                        {num.wabaId}
                      </p>
                    </div>

                    {/* Número de Telefone Registado */}
                    <div className="bg-white p-3.5 rounded-xl border border-zinc-200 shadow-2xs">
                      <div className="flex items-center justify-between text-xs text-zinc-500 font-medium mb-1">
                        <span>Número de Telefone Registado</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyToClipboard(num.phone)}
                          className="h-6 w-6 text-zinc-400 hover:text-zinc-700"
                          title="Copiar Telefone"
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                      <p className="font-mono text-xs font-bold text-emerald-700 select-all">
                        {num.phone}
                      </p>
                    </div>

                    {/* Meta App ID */}
                    <div className="bg-white p-3.5 rounded-xl border border-zinc-200 shadow-2xs">
                      <div className="flex items-center justify-between text-xs text-zinc-500 font-medium mb-1">
                        <span>Meta App ID</span>
                        {num.appId && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => copyToClipboard(num.appId || "")}
                            className="h-6 w-6 text-zinc-400 hover:text-zinc-700"
                            title="Copiar App ID"
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                      <p className="font-mono text-xs font-bold text-zinc-800 select-all">
                        {num.appId || "34557883637136073 (Padrão Orion)"}
                      </p>
                    </div>

                    {/* Access Token com Toggle Ver/Ocultar e Copiar */}
                    <div className="bg-white p-3.5 rounded-xl border border-zinc-200 shadow-2xs md:col-span-2">
                      <div className="flex items-center justify-between text-xs text-zinc-500 font-medium mb-1">
                        <span>Access Token Meta (Graph API)</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => showTokenPreview ? setShowTokenPreview(false) : requestCredentialAccess('showToken')}
                            className="p-1 text-zinc-400 hover:text-zinc-700 rounded-md hover:bg-zinc-100 transition-colors"
                            title={showTokenPreview ? "Ocultar Token" : "Mostrar Token"}
                          >
                            {showTokenPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => requestCredentialAccess('copyToken')}
                            className="h-6 w-6 text-zinc-400 hover:text-zinc-700"
                            title="Copiar Token Completo"
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      <p className="font-mono text-xs font-semibold text-zinc-800 truncate select-all">
                        {showTokenPreview
                          ? (num.token || "Não disponível")
                          : (num.token ? `${num.token.substring(0, 10)}••••••••••••••••${num.token.substring(num.token.length - 6)}` : "••••••••••••••••")}
                      </p>
                    </div>

                    {/* Outros dados do Bot e Perfil */}
                    {(num.displayName || num.businessCategory || num.website || num.supportEmail || num.description) && (
                      <div className="md:col-span-2 bg-zinc-50 p-3.5 rounded-xl border border-zinc-200/90 space-y-2">
                        <span className="text-xs font-bold text-zinc-700 uppercase tracking-wider block">
                          Outros Dados do Perfil Comercial
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {num.displayName && (
                            <div className="bg-white p-2 rounded-lg border border-zinc-200">
                              <span className="text-[11px] text-zinc-400 block">Nome de Exibição</span>
                              <span className="font-medium text-zinc-800">{num.displayName}</span>
                            </div>
                          )}
                          {num.businessCategory && (
                            <div className="bg-white p-2 rounded-lg border border-zinc-200">
                              <span className="text-[11px] text-zinc-400 block">Categoria</span>
                              <span className="font-medium text-zinc-800">{num.businessCategory}</span>
                            </div>
                          )}
                          {num.website && (
                            <div className="bg-white p-2 rounded-lg border border-zinc-200">
                              <span className="text-[11px] text-zinc-400 block">Website</span>
                              <span className="font-medium text-emerald-700 truncate block">{num.website}</span>
                            </div>
                          )}
                          {num.supportEmail && (
                            <div className="bg-white p-2 rounded-lg border border-zinc-200">
                              <span className="text-[11px] text-zinc-400 block">E-mail de Suporte</span>
                              <span className="font-medium text-zinc-800 truncate block">{num.supportEmail}</span>
                            </div>
                          )}
                        </div>
                        {num.description && (
                          <div className="bg-white p-2 rounded-lg border border-zinc-200 text-xs">
                            <span className="text-[11px] text-zinc-400 block">Descrição do Perfil</span>
                            <span className="text-zinc-600 italic block">{num.description}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>

        <CardFooter className="bg-zinc-50 border-t border-zinc-200 py-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Fluxo Oficial e Seguro com Validação na Meta Cloud API</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <Button 
              variant="outline" 
              onClick={rawConfig ? handleOpenEditModal : handleOpenNewModal} 
              className="gap-2 w-full sm:w-auto justify-center bg-white"
            >
              {rawConfig ? <Pencil className="w-4 h-4 text-emerald-600" /> : <Key className="w-4 h-4" />}
              {rawConfig ? "Editar Configuração" : "Configuração Manual"}
            </Button>
            <Button 
              onClick={launchEmbeddedSignup} 
              disabled={isEmbeddedSignupStarting}
              className="bg-[#1877F2] hover:bg-[#166fe5] text-white gap-2 font-bold shadow-md w-full sm:w-auto justify-center"
            >
              {isEmbeddedSignupStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building className="w-4 h-4" />}
              Conectar com Meta
            </Button>
          </div>
        </CardFooter>
      </Card>

      {/* Seção de Webhook e Eventos */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="border-zinc-200/80 shadow-xs">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Webhook className="w-4 h-4 text-emerald-600" /> Credenciais do Webhook
            </CardTitle>
            <CardDescription className="text-xs">Configure estes parâmetros no Meta App Dashboard → WhatsApp → Configuration.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700">URL de Retorno (Callback URL)</label>
              <div className="flex gap-2 w-full">
                <Input value={webhookUrl} readOnly className="bg-zinc-50 text-zinc-600 font-mono text-xs truncate flex-1" />
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(webhookUrl)} title="Copiar" className="shrink-0"><Copy className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700">Token de Verificação (Verify Token)</label>
              <div className="flex gap-2 w-full">
                <Input value={verifyToken} readOnly className="bg-zinc-50 text-zinc-600 font-mono text-xs truncate flex-1" />
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(verifyToken)} title="Copiar" className="shrink-0"><Copy className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200/80 shadow-xs">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Webhook className="w-4 h-4 text-emerald-600" /> Gerenciar Eventos Webhook
            </CardTitle>
            <CardDescription className="text-xs">Campos que devem ser subscritos no painel de desenvolvedor da Meta.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-zinc-900">Mensagens (messages)</p>
                <p className="text-zinc-500">Obrigatório para receber e responder clientes.</p>
              </div>
              <Switch
                checked={subscriptions.messages}
                onCheckedChange={(checked) => setSubscriptions({ ...subscriptions, messages: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-zinc-900">Status (statuses)</p>
                <p className="text-zinc-500">Confirmações de envio, entrega e leitura.</p>
              </div>
              <Switch
                checked={subscriptions.statuses}
                onCheckedChange={(checked) => setSubscriptions({ ...subscriptions, statuses: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-zinc-900">Templates (template_status)</p>
                <p className="text-zinc-500">Atualizações de aprovação de modelos.</p>
              </div>
              <Switch
                checked={subscriptions.message_template_status_update}
                onCheckedChange={(checked) => setSubscriptions({ ...subscriptions, message_template_status_update: checked })}
              />
            </div>
          </CardContent>
          <CardFooter className="bg-zinc-50 border-t border-zinc-100 py-3">
            <Button onClick={handleSyncWebhooks} disabled={isSyncing || numbers.length === 0} size="sm" className="w-full gap-2 text-xs">
              {isSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Sincronizar Inscrições com a Meta
            </Button>
          </CardFooter>
        </Card>
      </div>

      {/* Modal de Conectar / Editar Número */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 border-zinc-200">
            <form onSubmit={handleSubmit(onSubmitNewNumber)}>
              <CardHeader className="border-b border-zinc-100 pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-emerald-600" />
                  {rawConfig ? "Editar Parâmetros do WhatsApp" : "Conectar Novo Número WhatsApp"}
                </CardTitle>
                <CardDescription className="text-xs">
                  {rawConfig 
                    ? "Altere os identificadores e tokens. A palavra-passe só será solicitada ao visualizar ou copiar credenciais sensíveis."
                    : "Insira as credenciais fornecidas pelo painel da Meta for Developers."}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4 max-h-[70vh] overflow-y-auto p-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-700">Número de Telefone / Exibição</label>
                  <div className="relative">
                    <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <Input {...register("phone")} className="pl-9 text-sm" placeholder="+244 9XX XXX XXX" />
                  </div>
                  {errors.phone && <p className="text-xs text-red-500">{errors.phone.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-700">Phone Number ID</label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <Input {...register("phoneId")} className="pl-9 font-mono text-sm" placeholder="Ex: 1029384756" />
                  </div>
                  {errors.phoneId && <p className="text-xs text-red-500">{errors.phoneId.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-700">WhatsApp Business Account ID (WABA)</label>
                  <div className="relative">
                    <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <Input {...register("wabaId")} className="pl-9 font-mono text-sm" placeholder="Ex: 9876543210" />
                  </div>
                  {errors.wabaId && <p className="text-xs text-red-500">{errors.wabaId.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-700">Access Token Permanente</label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <Input type="password" {...register("token")} className="pl-9 font-mono text-sm" placeholder="EAA..." />
                  </div>
                  {errors.token && <p className="text-xs text-red-500">{errors.token.message}</p>}
                  <p className="text-[11px] text-zinc-500">Token gerado com permissões whatsapp_business_messaging e whatsapp_business_management.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-zinc-100 pt-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-700">Meta App ID</label>
                    <div className="relative">
                      <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <Input {...register("appId")} className="pl-9 font-mono text-sm" placeholder="Ex: 3455788..." />
                    </div>
                    <p className="text-[11px] text-zinc-500">ID da aplicação criada no Meta for Developers.</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-700">Meta App Secret</label>
                    <div className="relative">
                      <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <Input type="password" {...register("clientSecret")} className="pl-9 font-mono text-sm" placeholder="Opcional" />
                    </div>
                    <p className="text-[11px] text-zinc-500">Opcional, usado quando a sua aplicação Meta exigir secret.</p>
                  </div>
                </div>

                <div className="space-y-4 border-t border-zinc-100 pt-4 mt-4">
                  <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">Identificação do Bot</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-zinc-700">Nome do Bot</label>
                      <Input {...register("displayName")} className="text-sm" placeholder="Ex: Orion Assistant" />
                      {errors.displayName && <p className="text-xs text-red-500">{errors.displayName.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-zinc-700">Categoria</label>
                      <Input {...register("businessCategory")} className="text-sm" placeholder="Ex: Vendas / Apoio" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-700">Descrição do Serviço</label>
                    <Input {...register("description")} className="text-sm" placeholder="Ex: Atendimento ao cliente automatizado" />
                  </div>
                </div>
              </CardContent>

              <CardFooter className="bg-zinc-50 border-t border-zinc-200 py-4 flex justify-end gap-3 rounded-b-xl">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[140px]">
                  {isSubmitting ? (
                    <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> A validar...</span>
                  ) : rawConfig ? 'Salvar Alterações' : 'Conectar Número'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {/* Modal de Confirmação de Palavra-Passe */}
      <PasswordConfirmationModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        onConfirm={confirmCredentialAccess}
        title="Desbloquear Credenciais WhatsApp"
        description="Por motivos de segurança, introduza a sua palavra-passe de acesso ao Orion para visualizar ou copiar credenciais da Meta."
        actionLabel="Desbloquear Credenciais"
      />
    </div>
  );
}
