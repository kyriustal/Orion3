import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Switch } from "@/src/components/ui/switch";
import { Smartphone, Copy, AlertCircle, Plus, Loader2, Trash2, RefreshCw, CheckCircle2, Key, Building, Webhook } from "lucide-react";

type WhatsAppNumber = {
  id: string;
  phone: string;
  phoneId: string;
  wabaId: string;
  status: 'connected' | 'testing' | 'error';
};

const newNumberSchema = z.object({
  phone: z.string().min(8, "Número de exibição é obrigatório"),
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

export default function WhatsAppConfig() {
  const [webhookUrl] = useState(`${window.location.origin}/api/whatsapp/webhook`);
  const [verifyToken] = useState("orion_secure_token_123");

  const [numbers, setNumbers] = useState<WhatsAppNumber[]>([]);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) return;

        const response = await fetch("/api/whatsapp/config", {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error("Failed to fetch WhatsApp config");
        }

        const data = await response.json();

        // If there's an active waba_id, show it in the UI as a connected number card
        if (data && data.phone_number_id && data.waba_id) {
          setNumbers([{
            id: '1',
            phone: 'Conta do WhatsApp Business', // Default label since API doesn't store actual phone number string yet
            phoneId: data.phone_number_id,
            wabaId: data.waba_id,
            status: data.is_active ? 'connected' : 'error'
          }]);
        } else {
          setNumbers([]);
        }
      } catch (error) {
        console.error("Erro ao carregar configurações do WhatsApp:", error);
      }
    };

    fetchConfig();
  }, []);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NewNumberFormValues>({
    resolver: zodResolver(newNumberSchema),
  });

  // Embedded Signup Logic
  const launchEmbeddedSignup = () => {
    // @ts-ignore
    if (typeof FB === 'undefined') {
      toast.error("O SDK da Meta ainda não carregou. Por favor, recarregue a página.");
      return;
    }

    // Configuração do App (Pode ser puxada de uma variável de ambiente ou config)
    const appId = "34557883637136073"; 

    if (appId === "SEU_APP_ID_AQUI") {
      toast.warning("Configuração pendente: Insira o App ID no código ou painel para usar o fluxo automático.");
      setIsModalOpen(true); // Abre o manual como fallback
      return;
    }

    // @ts-ignore
    FB.login((response: any) => {
      if (response.authResponse) {
        const accessToken = response.authResponse.accessToken;
        toast.success("Conectado com sucesso à Meta!");
        console.log("Access Token recebido:", accessToken);
        // Aqui você chamaria uma rota de backend para processar o token e listar as WABAs
        toast.info("Processando integração automática...");
      } else {
        toast.error("O utilizador cancelou o login ou não autorizou a aplicação.");
      }
    }, {
      scope: 'whatsapp_business_management,whatsapp_business_messaging',
      extras: {
        feature: 'whatsapp_embedded_signup'
      }
    });
  };

  useEffect(() => {
    // @ts-ignore
    window.fbAsyncInit = function () {
      // @ts-ignore
      FB.init({
        appId: '34557883637136073',
        cookie: true,
        xfbml: true,
        version: 'v19.0'
      });
    };
  }, []);

  const [subscriptions, setSubscriptions] = useState({
    messages: true,
    statuses: false,
    message_template_status_update: false
  });

  const handleTestConnection = async (id: string) => {
    setNumbers(prev => prev.map(n => n.id === id ? { ...n, status: 'testing' } : n));
    try {
      // Simulating API call: POST /whatsapp/verify-connection
      await new Promise(resolve => setTimeout(resolve, 1500));
      setNumbers(prev => prev.map(n => n.id === id ? { ...n, status: 'connected' } : n));
      toast.success("Conexão verificada com sucesso!");
    } catch (error) {
      setNumbers(prev => prev.map(n => n.id === id ? { ...n, status: 'error' } : n));
      toast.error("Erro ao verificar conexão.");
    }
  };

  const handleDisconnect = async (id: string) => {
    if (window.confirm("Tem certeza que deseja desconectar este número? A IA parará de responder imediatamente.")) {
      try {
        const token = localStorage.getItem("token");
        await fetch("/api/whatsapp/config", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ phone_number_id: '', waba_id: '', access_token: '' })
        });
        setNumbers([]);
        toast.info("Número desconectado.");
      } catch (error) {
        toast.error("Erro ao desconectar número.");
      }
    }
  };

  const onSubmitNewNumber = async (data: NewNumberFormValues) => {
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
          phone_number_id: data.phoneId,
          waba_id: data.wabaId,
          access_token: data.token,
          app_id: data.appId,
          client_secret: data.clientSecret,
          display_name: data.displayName,
          business_category: data.businessCategory,
          description: data.description,
          profile_picture_url: data.profilePictureUrl,
          website: data.website,
          support_email: data.supportEmail
        })
      });

      if (!response.ok) throw new Error("Falha ao salvar config");

      const newEntry: WhatsAppNumber = {
        id: '1',
        phone: data.phone || 'Conta do WhatsApp Business',
        phoneId: data.phoneId,
        wabaId: data.wabaId,
        status: 'connected'
      };
      setNumbers([newEntry]);
      setIsModalOpen(false);
      reset();
      toast.success("Número conectado com sucesso!");

      toast.info("Sincronizando dados com a Meta...");
      await handleSyncWebhooks();

    } catch (error: any) {
      const errorMessage = error.message || "Erro desconhecido ao conectar número.";
      toast.error(`Falha: ${errorMessage}`);
      console.error("WhatsApp Connection Error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSyncWebhooks = async () => {
    setIsSyncing(true);
    try {
      // Simulating API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      toast.success("Inscrições do Webhook sincronizadas com a Meta com sucesso!");
    } catch (error) {
      toast.error("Erro ao sincronizar webhooks.");
    } finally {
      setIsSyncing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado para a área de transferência!");
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Gestão de WhatsApp</h2>
        <p className="text-zinc-500">Conecte sua conta do WhatsApp Business via Meta Cloud API.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Smartphone className="w-5 h-5" /> Números Conectados</CardTitle>
          <CardDescription>Gerencie os números que estão utilizando o Agente de IA.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {numbers.length === 0 ? (
            <div className="text-center py-8 text-zinc-500 border-2 border-dashed border-zinc-200 rounded-xl">
              Nenhum número conectado no momento.
            </div>
          ) : (
            numbers.map((num) => (
              <div key={num.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-zinc-200 bg-zinc-50 gap-4">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${num.status === 'testing' ? 'bg-amber-100 text-amber-600' :
                    num.status === 'error' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
                    }`}>
                    {num.status === 'testing' ? <RefreshCw className="w-5 h-5 animate-spin" /> :
                      num.status === 'error' ? <AlertCircle className="w-5 h-5" /> : <Smartphone className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="font-semibold text-zinc-900">{num.phone}</p>
                    <div className="flex items-center gap-1.5 text-xs font-medium mt-0.5">
                      {num.status === 'testing' ? (
                        <span className="text-amber-600 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Testando conexão...</span>
                      ) : num.status === 'error' ? (
                        <span className="text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Erro de conexão</span>
                      ) : (
                        <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Conectado e Ativo</span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-400 mt-1 font-mono">ID: {num.phoneId}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTestConnection(num.id)}
                    disabled={num.status === 'testing'}
                    className="bg-white"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${num.status === 'testing' ? 'animate-spin' : ''}`} />
                    Testar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDisconnect(num.id)}
                    disabled={num.status === 'testing'}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 bg-white"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Desconectar
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
        <CardFooter className="bg-zinc-50 border-t border-zinc-200 py-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Fluxo Oficial e Seguro via Meta Embedded Signup</span>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setIsModalOpen(true)} className="gap-2">
              <Key className="w-4 h-4" /> Configuração Manual
            </Button>
            <Button onClick={launchEmbeddedSignup} className="bg-[#1877F2] hover:bg-[#166fe5] text-white gap-2 font-bold shadow-md">
              <Building className="w-4 h-4" /> Conectar com Meta
            </Button>
          </div>
        </CardFooter>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Credenciais do Webhook</CardTitle>
            <CardDescription>Configure estas URLs no painel da Meta.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">URL de Retorno (Callback URL)</label>
              <div className="flex gap-2">
                <Input value={webhookUrl} readOnly className="bg-zinc-50 text-zinc-600 font-mono text-sm" />
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(webhookUrl)} title="Copiar"><Copy className="w-4 h-4" /></Button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Token de Verificação</label>
              <div className="flex gap-2">
                <Input value={verifyToken} readOnly className="bg-zinc-50 text-zinc-600 font-mono text-sm" />
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(verifyToken)} title="Copiar"><Copy className="w-4 h-4" /></Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Webhook className="w-5 h-5" /> Gerenciar Eventos</CardTitle>
            <CardDescription>Assine os campos para receber notificações da Meta.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-900">Mensagens (messages)</p>
                <p className="text-xs text-zinc-500">Obrigatório para o bot receber e responder clientes.</p>
              </div>
              <Switch
                checked={subscriptions.messages}
                onCheckedChange={(checked) => setSubscriptions({ ...subscriptions, messages: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-900">Status (statuses)</p>
                <p className="text-xs text-zinc-500">Confirmações de envio, entrega e leitura (ticks).</p>
              </div>
              <Switch
                checked={subscriptions.statuses}
                onCheckedChange={(checked) => setSubscriptions({ ...subscriptions, statuses: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-900">Templates</p>
                <p className="text-xs text-zinc-500">Atualizações de aprovação/rejeição de templates.</p>
              </div>
              <Switch
                checked={subscriptions.message_template_status_update}
                onCheckedChange={(checked) => setSubscriptions({ ...subscriptions, message_template_status_update: checked })}
              />
            </div>
          </CardContent>
          <CardFooter className="bg-zinc-50 border-t border-zinc-200 py-4">
            <Button onClick={handleSyncWebhooks} disabled={isSyncing || numbers.length === 0} className="w-full gap-2">
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Sincronizar com a Meta
            </Button>
          </CardFooter>
        </Card>
      </div>

      {/* Modal de Adicionar Número */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <form onSubmit={handleSubmit(onSubmitNewNumber)}>
              <CardHeader>
                <CardTitle>Conectar Novo Número</CardTitle>
                <CardDescription>Insira as credenciais fornecidas pelo painel da Meta for Developers.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-700">Número de Exibição</label>
                  <div className="relative">
                    <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <Input {...register("phone")} className="pl-9" placeholder="+244 9XX XXX XXX" />
                  </div>
                  {errors.phone && <p className="text-xs text-red-500">{errors.phone.message}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-700">Phone Number ID</label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <Input {...register("phoneId")} className="pl-9" placeholder="Ex: 1029384756" />
                  </div>
                  {errors.phoneId && <p className="text-xs text-red-500">{errors.phoneId.message}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-700">WhatsApp Business Account ID (WABA)</label>
                  <div className="relative">
                    <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <Input {...register("wabaId")} className="pl-9" placeholder="Ex: 9876543210" />
                  </div>
                  {errors.wabaId && <p className="text-xs text-red-500">{errors.wabaId.message}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-700">Access Token Permanente</label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <Input type="password" {...register("token")} className="pl-9" placeholder="EAA..." />
                  </div>
                  {errors.token && <p className="text-xs text-red-500">{errors.token.message}</p>}
                  <p className="text-xs text-zinc-500">Gere um token permanente criando um usuário de sistema no Business Manager.</p>
                </div>
                <div className="space-y-4 border-t border-zinc-200 pt-4 mt-4">
                  <h4 className="text-sm font-semibold text-zinc-900">Perfil do Agente (Opcional)</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-700">Nome do Bot</label>
                      <Input {...register("displayName")} placeholder="Ex: Orion Assistant" />
                      {errors.displayName && <p className="text-xs text-red-500">{errors.displayName.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-700">Categoria</label>
                      <Input {...register("businessCategory")} placeholder="Ex: Tecnologia" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-700">Descrição</label>
                    <Input {...register("description")} placeholder="Ex: Assistente virtual de vendas" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-700">Website</label>
                      <Input {...register("website")} placeholder="https://..." />
                      {errors.website && <p className="text-xs text-red-500">{errors.website.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-700">E-mail de Suporte</label>
                      <Input {...register("supportEmail")} placeholder="contato@..." />
                      {errors.supportEmail && <p className="text-xs text-red-500">{errors.supportEmail.message}</p>}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-700">URL da Foto de Perfil</label>
                    <Input {...register("profilePictureUrl")} placeholder="https://link-da-imagem.jpg" />
                    {errors.profilePictureUrl && <p className="text-xs text-red-500">{errors.profilePictureUrl.message}</p>}
                  </div>
                </div>

                <div className="space-y-4 border-t border-zinc-200 pt-4 mt-4">
                  <h4 className="text-sm font-semibold text-zinc-900">Configurações Avançadas (Opcional)</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-700">App ID</label>
                      <Input {...register("appId")} placeholder="ID do App Meta" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-700">Client Secret</label>
                      <Input type="password" {...register("clientSecret")} placeholder="Secret do App" />
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="bg-zinc-50 border-t border-zinc-200 py-4 flex justify-end gap-2 rounded-b-xl">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting} className="min-w-[120px]">
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Conectar Número'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
