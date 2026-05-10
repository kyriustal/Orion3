import { Link } from "react-router-dom";
import { Bot, MessageSquare, Zap, ShieldCheck, CheckCircle2, BotMessageSquare, Sparkles } from "lucide-react";
import { Button } from "@/src/components/ui/button";

export default function Home() {
  return (
    <div className="w-full overflow-x-hidden">
      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-12 md:pt-20 pb-20 md:pb-32">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center mb-16 md:mb-20">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-sm font-medium mb-6">
              <Sparkles className="w-4 h-4" />
              <span>Plataforma Oficial WhatsApp Cloud API</span>
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-8 text-zinc-900">
              O Suporte Perfeito.<br />
              <span className="text-emerald-600">100% Automático.</span>
            </h1>
            <p className="text-xl text-zinc-600 leading-relaxed mb-8 max-w-lg">
              Construa um Agente de IA avançado que atende pelo seu número de WhatsApp. Treine-o com os PDFs e regras da sua empresa em segundos.
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              <Link to="/register" target="_blank" className="w-full sm:w-auto">
                <Button className="w-full rounded-full bg-emerald-600 text-white hover:bg-emerald-700 px-8 py-6 text-lg font-semibold shadow-lg shadow-emerald-200">
                  Começar Gratuitamente
                </Button>
              </Link>
              <Link to="/funcionalidades" className="w-full sm:w-auto">
                <Button variant="outline" className="w-full rounded-full px-8 py-6 text-lg border-zinc-200 hover:bg-zinc-50 font-medium">
                  Ver Funcionalidades
                </Button>
              </Link>
            </div>
          </div>
          <div className="relative mt-8 md:mt-0">
            <div className="absolute inset-0 bg-gradient-to-tr from-emerald-100 to-teal-50 rounded-[2rem] md:rounded-[3rem] transform md:rotate-3 md:scale-105 -z-10"></div>
            <div className="bg-white border text-zinc-800 border-zinc-100 shadow-xl rounded-[2rem] p-6 lg:p-8">
              <div className="flex items-center gap-4 border-b border-zinc-100 pb-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-emerald-100 flexItems-center justify-center flex items-center">
                  <Bot className="w-6 h-6 text-emerald-600 mx-auto" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Orion Assistant</h3>
                  <p className="text-sm text-emerald-600 font-medium">Online agora</p>
                </div>
              </div>
              <div className="space-y-4 mb-6">
                <div className="bg-zinc-100 px-4 py-3 rounded-2xl rounded-tl-none w-[85%]">
                  Olá! Bem-vindo ao suporte automatizado. Como posso ajudar com sua compra de hoje?
                </div>
                <div className="bg-emerald-600 text-white px-4 py-3 rounded-2xl rounded-tr-none w-[80%] ml-auto">
                  Quais são as regras de Frete Grátis da empresa?
                </div>
                <div className="bg-zinc-100 px-4 py-3 rounded-2xl rounded-tl-none w-[90%]">
                  O Frete Grátis para fora de Luanda aplica-se automaticamente para compras acima de 30.000 kZ. Posso calcular seu carrinho?
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-zinc-100 text-center text-sm text-zinc-400">
                Respostas geradas com base nos documentos enviados ({'< 800ms'})
              </div>
            </div>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 mb-20 md:mb-32">
          <div className="bg-zinc-50 rounded-3xl p-8 hover:bg-zinc-100 transition-colors">
            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-6">
              <BotMessageSquare className="w-6 h-6 text-emerald-600" />
            </div>
            <h3 className="text-xl font-bold mb-3">Conexão Oficial Meta</h3>
            <p className="text-zinc-600">Conectamos diretamente na WhatsApp Cloud API. Sem uso de aparelhos celulares físicos ou QR Codes instáveis.</p>
          </div>
          <div className="bg-zinc-50 rounded-3xl p-8 hover:bg-zinc-100 transition-colors">
            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-6">
              <Zap className="w-6 h-6 text-amber-500" />
            </div>
            <h3 className="text-xl font-bold mb-3">Modelos Gemini Integrados</h3>
            <p className="text-zinc-600">Acesse nativamente o poder da inteligência do Google Gemini 2.5 Flash, para respostas rápidas, contextuais e humanas.</p>
          </div>
          <div className="bg-zinc-50 rounded-3xl p-8 hover:bg-zinc-100 transition-colors">
            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-6">
              <ShieldCheck className="w-6 h-6 text-blue-500" />
            </div>
            <h3 className="text-xl font-bold mb-3">Banco da Empresa (RAG)</h3>
            <p className="text-zinc-600">Dê adeus às alucinações. Faça upload dos seus manuais (PDF/TXT) no painel, e a IA só responderá com base neles.</p>
          </div>
        </div>

        {/* Deep Dive Section */}
        <div className="bg-[#f5f5f0] rounded-[2rem] md:rounded-[3rem] p-4 sm:p-8 md:p-16 mb-20 md:mb-32">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">Apenas Ensine. Ele Atende.</h2>
            <p className="text-xl text-zinc-600">
              O Orion não é apenas um chatbot de fluxograma. Ele é um agente livre com cérebro em nuvem. Você fornece os documentos da empresa, e nós extraímos e injetamos as regras na memória dinâmica da Inteligência Artificial.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 bg-white rounded-[1.5rem] md:rounded-[2rem] p-6 md:p-8 shadow-sm items-center">
            <div>
              <h3 className="text-2xl font-bold mb-6">Como o processo funciona:</h3>
              <ul className="space-y-6">
                <li className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">1</div>
                  <div>
                    <h4 className="font-bold text-zinc-900 text-lg">Upload de Conhecimento</h4>
                    <p className="text-zinc-600 mt-1">Envie PDFs de "Política de Trocas", FAQ, catálogo de produtos e tom de voz.</p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">2</div>
                  <div>
                    <h4 className="font-bold text-zinc-900 text-lg">Processamento em Nuvem</h4>
                    <p className="text-zinc-600 mt-1">O sistema isola seus dados de forma segura (Multi-tenant) em nosso Supabase.</p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">3</div>
                  <div>
                    <h4 className="font-bold text-zinc-900 text-lg">Atendimento no WhatsApp</h4>
                    <p className="text-zinc-600 mt-1">O cliente pergunta. O robô resgata e interpreta as regras invisivelmente e responde simulando um humano.</p>
                  </div>
                </li>
              </ul>
              <div className="mt-10">
                <Link to="/register" target="_blank">
                  <Button className="rounded-full bg-zinc-900 text-white px-8 py-6 text-md font-semibold">Configurar Meu Agente Agora</Button>
                </Link>
              </div>
            </div>

            <div className="bg-zinc-50 rounded-2xl p-6 border border-zinc-100">
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-zinc-200">
                <div className="font-semibold text-zinc-800">Seu Dashboard Orion</div>
                <div className="text-xs font-bold bg-zinc-200 px-2 py-1 rounded">Ao_Vivo</div>
              </div>
              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-3 p-3 bg-white rounded-lg shadow-sm">
                  <CheckCircle2 className="text-emerald-500 w-5 h-5" />
                  <span className="text-sm font-medium">politica_de_reembolso_v2.pdf</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-white rounded-lg shadow-sm border border-emerald-500">
                  <CheckCircle2 className="text-emerald-500 w-5 h-5" />
                  <span className="text-sm font-medium">catalogo_completo_dezembro.txt</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-white rounded-lg shadow-sm">
                  <CheckCircle2 className="text-emerald-500 w-5 h-5" />
                  <span className="text-sm font-medium">regras_falar_com_humano.pdf</span>
                </div>
              </div>
              <p className="text-xs text-center text-zinc-400 uppercase tracking-widest font-bold">Base Sincronizada com Sucesso</p>
            </div>
          </div>
        </div>

        {/* API Section */}
        <div className="border-t border-zinc-200 pt-32 mb-16">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-16 gap-8">
            <div>
              <div className="text-sm font-bold tracking-widest text-emerald-600 uppercase mb-4">Desenvolvedores</div>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight">Escalabilidade com a<br />Orion Webhook API</h2>
            </div>
            <Link to="/api-docs">
              <Button variant="outline" className="rounded-full px-8 py-6 font-semibold">Explorar documentação REST</Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 pb-16">
            <div>
              <p className="text-lg text-zinc-600 mb-8">Nossa infraestrutura intermedeia automaticamente os Webhooks da Meta com o seu Cérebro Gemini. Mas você também pode criar regras, integrações de faturamento e CRMs acoplando-se à nossa arquitetura transparente baseada em Express e Supabase.</p>

              <ul className="space-y-4">
                <li className="flex gap-3 text-zinc-700 font-medium">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  Gatilhos e Ações Customizadas na Conversa
                </li>
                <li className="flex gap-3 text-zinc-700 font-medium">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  Function Callings Ativos (ex: TransferToHuman)
                </li>
                <li className="flex gap-3 text-zinc-700 font-medium">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  PostgreSQL nativo liberado
                </li>
              </ul>
            </div>
            <div className="bg-zinc-900 rounded-2xl p-6 font-mono text-sm text-green-400 overflow-x-auto shadow-2xl">
              <pre>
                {`import { OrionClient } from "@orion/sdk";

// Conecte sua organização ao WhatsApp Instantaneamente
const agent = new OrionClient({ 
  orgId: "sua_empresa_id",
  apiKey: "sk_orion_super_secret" 
});

await agent.knowledgeBase.uploadData({
  file: "./tabela_precos.pdf",
  autoTrain: true
});

agent.listenWhatsAppWebhook();`}
              </pre>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
