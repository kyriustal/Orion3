import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Shield } from "lucide-react";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-zinc-50 py-12 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl mb-4">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Política de Privacidade</h1>
          <p className="text-zinc-500">Última atualização: Maio de 2026</p>
        </div>

        <Card className="border-zinc-200 shadow-sm">
          <CardHeader>
            <CardTitle>1. Coleta de Informações</CardTitle>
          </CardHeader>
          <CardContent className="text-zinc-600 leading-relaxed space-y-4">
            <p>O Orion 2 coleta informações necessárias para a prestação de serviços de automação via WhatsApp. Isso inclui dados fornecidos voluntariamente pelos usuários e logs de interação com a API da Meta.</p>
            <p>Não compartilhamos dados pessoais com terceiros, exceto quando necessário para o funcionamento técnico da plataforma (ex: integração oficial com a Meta Cloud API).</p>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 shadow-sm">
          <CardHeader>
            <CardTitle>2. Uso de Dados da Meta</CardTitle>
          </CardHeader>
          <CardContent className="text-zinc-600 leading-relaxed space-y-4">
            <p>Nossa plataforma utiliza a Meta Cloud API para processar mensagens. As mensagens enviadas e recebidas são processadas por nossos modelos de IA (Gemini) para fornecer respostas automatizadas e personalizadas.</p>
            <p>Garantimos que o uso desses dados segue estritamente as Políticas do Desenvolvedor da Meta.</p>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 shadow-sm">
          <CardHeader>
            <CardTitle>3. Seus Direitos</CardTitle>
          </CardHeader>
          <CardContent className="text-zinc-600 leading-relaxed space-y-4">
            <p>Você tem o direito de solicitar a exclusão de seus dados de nossa base a qualquer momento através do suporte oficial no painel Orion.</p>
          </CardContent>
        </Card>

        <div className="text-center text-sm text-zinc-400 py-8">
          © 2026 Orion 2 - Todos os direitos reservados.
        </div>
      </div>
    </div>
  );
}
