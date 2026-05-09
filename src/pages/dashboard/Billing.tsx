import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { CheckCircle2, Clock, Copy, Loader2, AlertTriangle, ShieldX, CreditCard } from "lucide-react";
import { toast } from "sonner";

interface BillingStatus {
  status: string;
  plan: string;
  daysLeft: number;
  trial_ends_at?: string;
  plan_ends_at?: string;
}

interface PaymentReference {
  reference: string;
  entity: string;
  amount: number;
  description: string;
  expires_at: string;
  payment_id: string;
}

const plans = [
  {
    id: "starter",
    name: "Starter",
    price: "15.000 Kz",
    priceNum: 15000,
    description: "Ideal para pequenos negócios começando com automação.",
    features: [
      "1 Número de WhatsApp",
      "500 Mensagens/mês",
      "IA Gemini Flash",
      "Base de Conhecimento",
      "Suporte por E-mail"
    ],
    popular: false
  },
  {
    id: "pro",
    name: "Pro",
    price: "45.000 Kz",
    priceNum: 45000,
    description: "Para empresas que precisam de escala e inteligência avançada.",
    features: [
      "3 Números de WhatsApp",
      "Mensagens Ilimitadas*",
      "IA Gemini Pro (Mais inteligente)",
      "Base de Conhecimento Expandida",
      "Campanhas em Massa",
      "Automações Avançadas",
      "Suporte via WhatsApp"
    ],
    popular: true
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Sob Consulta",
    priceNum: 0,
    description: "Solução completa com white-label e suporte dedicado.",
    features: [
      "Números Ilimitados",
      "Mensagens Ilimitadas",
      "IA Personalizada",
      "White-label (Sua marca)",
      "Gerente de Conta Dedicado",
      "SLA de 99.9%"
    ],
    popular: false
  }
];

export default function Billing() {
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [paymentRef, setPaymentRef] = useState<PaymentReference | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  useEffect(() => {
    fetchBillingStatus();
  }, []);

  const fetchBillingStatus = async () => {
    try {
      const response = await fetch("/api/billing/status", {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      if (response.ok) {
        const data = await response.json();
        setBillingStatus(data);
      }
    } catch (error) {
      console.error("Erro ao buscar status de billing", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubscribe = async (planId: string) => {
    if (planId === "enterprise") {
      window.open("https://wa.me/244900000000?text=Olá! Tenho interesse no plano Enterprise da Orion.", "_blank");
      return;
    }

    setSelectedPlan(planId);
    setIsGenerating(true);
    try {
      const response = await fetch("/api/billing/payment/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ plan: planId })
      });

      if (!response.ok) throw new Error("Erro ao gerar referência");

      const data = await response.json();
      setPaymentRef(data);
      setShowPaymentModal(true);
    } catch (error: any) {
      toast.error("Erro ao gerar referência Multicaixa. Tente novamente.");
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const getStatusBadge = () => {
    if (!billingStatus) return null;

    if (billingStatus.plan === "vip" || billingStatus.plan === "enterprise") {
      return (
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-full text-amber-700 text-sm font-semibold">
          <CheckCircle2 className="w-4 h-4" />
          Conta Enterprise (VIP) — Acesso Total
        </div>
      );
    }

    if (billingStatus.status === "debt") {
      return (
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-full text-red-700 text-sm font-semibold">
          <ShieldX className="w-4 h-4" />
          Conta em Dívida — Regularize para continuar
        </div>
      );
    }

    if (billingStatus.status === "expired") {
      return (
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-full text-red-700 text-sm font-semibold">
          <AlertTriangle className="w-4 h-4" />
          Período de teste expirado — Escolha um plano
        </div>
      );
    }

    if (billingStatus.plan === "trial") {
      const urgent = billingStatus.daysLeft <= 2;
      return (
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border ${
          urgent
            ? "bg-red-50 border-red-200 text-red-700"
            : "bg-emerald-50 border-emerald-200 text-emerald-700"
        }`}>
          <Clock className="w-4 h-4" />
          {billingStatus.daysLeft > 0
            ? `Período de Teste — ${billingStatus.daysLeft} dia${billingStatus.daysLeft !== 1 ? "s" : ""} restante${billingStatus.daysLeft !== 1 ? "s" : ""}`
            : "Período de Teste Expirado"
          }
        </div>
      );
    }

    return (
      <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-full text-emerald-700 text-sm font-semibold">
        <CheckCircle2 className="w-4 h-4" />
        Plano {billingStatus.plan?.charAt(0).toUpperCase() + billingStatus.plan?.slice(1)} — Ativo
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="text-center max-w-2xl mx-auto space-y-4">
        <h2 className="text-3xl font-bold tracking-tight text-zinc-900">Planos e Faturamento</h2>
        <p className="text-zinc-500">Escolha o plano ideal para escalar o atendimento da sua empresa com Inteligência Artificial.</p>
        {getStatusBadge()}
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {plans.map((plan) => (
          <Card key={plan.id} className={`relative flex flex-col transition-shadow hover:shadow-lg ${
            plan.popular ? "border-emerald-500 shadow-lg shadow-emerald-100" : "border-zinc-200"
          }`}>
            {plan.popular && (
              <div className="absolute -top-4 left-0 right-0 flex justify-center">
                <span className="bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                  Mais Popular
                </span>
              </div>
            )}
            <CardHeader className="text-center pb-8 pt-8">
              <CardTitle className="text-xl font-semibold text-zinc-900">{plan.name}</CardTitle>
              <div className="mt-4 flex items-baseline justify-center gap-x-2">
                <span className="text-4xl font-bold tracking-tight text-zinc-900">{plan.price}</span>
                {plan.priceNum > 0 && <span className="text-sm font-semibold leading-6 text-zinc-500">/mês</span>}
              </div>
              <CardDescription className="mt-4 text-sm leading-6 text-zinc-500">{plan.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <ul className="space-y-4 text-sm leading-6 text-zinc-600">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-x-3">
                    <CheckCircle2 className="h-6 w-5 flex-none text-emerald-600" />
                    {feature}
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter className="mt-8">
              <Button
                className={`w-full gap-2 ${plan.popular ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-zinc-900 hover:bg-zinc-800 text-white"}`}
                onClick={() => handleSubscribe(plan.id)}
                disabled={isGenerating && selectedPlan === plan.id}
              >
                {isGenerating && selectedPlan === plan.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CreditCard className="w-4 h-4" />
                )}
                {plan.id === "enterprise" ? "Falar com Consultor" : `Assinar ${plan.name}`}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <div className="mt-12 text-center text-sm text-zinc-500 space-y-1">
        <p>* O uso ilimitado está sujeito à política de uso justo (Fair Use Policy).</p>
        <p>Pagamentos processados de forma segura via <strong>Multicaixa Express</strong> (Referências Bancárias).</p>
      </div>

      {/* Modal de Pagamento Multicaixa */}
      {showPaymentModal && paymentRef && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-300 border-emerald-200">
            <CardHeader className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-t-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-white">Pagar via Multicaixa Express</CardTitle>
                  <CardDescription className="text-emerald-100 text-xs">Use a referência abaixo no seu banco ou app</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 pt-6">
              <div className="bg-zinc-50 rounded-xl p-4 space-y-4 border border-zinc-200">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Entidade</span>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-zinc-900 font-mono">{paymentRef.entity}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(paymentRef.entity, "Entidade")}>
                      <Copy className="w-3.5 h-3.5 text-zinc-400" />
                    </Button>
                  </div>
                </div>

                <div className="border-t border-zinc-200 pt-4 flex justify-between items-center">
                  <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Referência</span>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-zinc-900 font-mono tracking-widest">{paymentRef.reference}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(paymentRef.reference, "Referência")}>
                      <Copy className="w-3.5 h-3.5 text-zinc-400" />
                    </Button>
                  </div>
                </div>

                <div className="border-t border-zinc-200 pt-4 flex justify-between items-center">
                  <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Valor</span>
                  <span className="text-2xl font-bold text-emerald-600">{paymentRef.amount.toLocaleString('pt-AO')} Kz</span>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-800 font-medium leading-relaxed">
                  ⏰ Esta referência expira em <strong>{new Date(paymentRef.expires_at).toLocaleDateString('pt-AO', { day: '2-digit', month: 'long', year: 'numeric' })}</strong>. Após o pagamento, a sua conta será ativada automaticamente em até 15 minutos.
                </p>
              </div>

              <div className="text-xs text-zinc-400 space-y-1">
                <p>• Aceda ao seu banco ou à app Multicaixa Express</p>
                <p>• Escolha "Pagamento de Serviços" ou "Referências"</p>
                <p>• Insira a Entidade e a Referência acima</p>
                <p>• Confirme o valor e autorize o pagamento</p>
              </div>
            </CardContent>
            <CardFooter className="bg-zinc-50 border-t border-zinc-100 rounded-b-xl flex justify-end gap-3 py-4">
              <Button variant="outline" onClick={() => setShowPaymentModal(false)}>
                Fechar
              </Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { copyToClipboard(paymentRef.reference, "Referência"); }}>
                <Copy className="w-4 h-4 mr-2" />
                Copiar Referência
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
