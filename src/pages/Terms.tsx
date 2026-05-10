import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { FileText } from "lucide-react";

export default function Terms() {
  return (
    <div className="min-h-screen bg-zinc-50 py-12 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-zinc-900 text-white rounded-xl mb-4">
            <FileText className="w-6 h-6" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Termos de Uso</h1>
          <p className="text-zinc-500">Última atualização: Maio de 2026</p>
        </div>

        <Card className="border-zinc-200 shadow-sm">
          <CardHeader>
            <CardTitle>1. Aceitação dos Termos</CardTitle>
          </CardHeader>
          <CardContent className="text-zinc-600 leading-relaxed space-y-4">
            <p>Ao acessar e usar a plataforma Orion, você concorda em cumprir estes termos e todas as leis aplicáveis ao uso de comunicações automatizadas via WhatsApp.</p>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 shadow-sm">
          <CardHeader>
            <CardTitle>2. Uso Permitido</CardTitle>
          </CardHeader>
          <CardContent className="text-zinc-600 leading-relaxed space-y-4">
            <p>O usuário é inteiramente responsável pelo conteúdo das mensagens enviadas e pelo cumprimento das políticas Anti-Spam da Meta. O uso do Orion para envio de mensagens não solicitadas ou ofensivas pode resultar no bloqueio imediato da conta.</p>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 shadow-sm">
          <CardHeader>
            <CardTitle>3. Limitação de Responsabilidade</CardTitle>
          </CardHeader>
          <CardContent className="text-zinc-600 leading-relaxed space-y-4">
            <p>O Orion é uma ferramenta de automação. Não nos responsabilizamos por eventuais banimentos de números impostos pela Meta devido ao uso indevido da ferramenta por parte do usuário.</p>
          </CardContent>
        </Card>

        <div className="text-center text-sm text-zinc-400 py-8">
          © 2026 Orion - Tecnologia e Automação.
        </div>
      </div>
    </div>
  );
}
