import { ShieldX, CreditCard, Clock } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { useNavigate } from "react-router-dom";

interface TrialExpiredGateProps {
  status: "expired" | "debt";
  daysLeft?: number;
}

export default function TrialExpiredGate({ status, daysLeft }: TrialExpiredGateProps) {
  const navigate = useNavigate();

  const isDebt = status === "debt";

  return (
    <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center space-y-6 animate-in fade-in zoom-in-95 duration-300">
        {/* Icon */}
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto ${
          isDebt ? "bg-red-100" : "bg-amber-100"
        }`}>
          {isDebt
            ? <ShieldX className="w-10 h-10 text-red-500" />
            : <Clock className="w-10 h-10 text-amber-500" />
          }
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-zinc-900">
            {isDebt ? "Conta em Dívida" : "Período de Teste Encerrado"}
          </h2>
          <p className="text-zinc-500 text-sm leading-relaxed">
            {isDebt
              ? "Identificámos que a sua empresa já utilizou o período experimental gratuito nesta plataforma. Por favor, efectue o pagamento de um plano para continuar."
              : "O seu período de teste de 7 dias terminou. Os seus dados estão seguros e serão restaurados assim que subscrever um plano."
            }
          </p>
        </div>

        {/* Plan highlight */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-1">
          <p className="text-sm font-semibold text-emerald-800">🚀 Plano Starter a partir de</p>
          <p className="text-3xl font-bold text-emerald-700">15.000 Kz<span className="text-base font-normal text-emerald-600">/mês</span></p>
          <p className="text-xs text-emerald-600">Pagamento por referência Multicaixa Express</p>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700 h-12 text-base gap-2"
            onClick={() => navigate("/dashboard/billing")}
          >
            <CreditCard className="w-5 h-5" />
            Escolher um Plano
          </Button>
          <p className="text-xs text-zinc-400">
            Após o pagamento, a sua conta é reativada automaticamente em até 15 minutos.
          </p>
        </div>
      </div>
    </div>
  );
}
