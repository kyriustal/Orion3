import { Bot, MessageSquare, Zap, ShieldCheck, Clock, Brain, Mic, FileText, Image as ImageIcon, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/src/components/ui/button';

export default function WhatsappIA() {
  const features = [
    { icon: Brain, title: 'Gemini 2.5 Flash com Raciocínio', desc: 'O modelo mais avançado da Google para respostas precisas, com capacidade de raciocínio activada para situações complexas.' },
    { icon: Clock, title: 'Disponibilidade 24/7', desc: 'Nunca perde uma mensagem. O agente responde em segundos a qualquer hora do dia, sem interrupções.' },
    { icon: MessageSquare, title: 'Memória Contextual (50 msgs)', desc: 'A IA lembra as últimas 50 mensagens da conversa nas últimas 24h, respondendo com total coerência e contexto.' },
    { icon: Mic, title: 'Transcrição de Áudio', desc: 'Converte mensagens de voz em texto e responde de forma inteligente ao conteúdo do áudio.' },
    { icon: FileText, title: 'Leitura de Documentos', desc: 'Processa PDFs e DOCX enviados pelo cliente, extraindo informação relevante para responder com precisão.' },
    { icon: ImageIcon, title: 'Visão por Imagem', desc: 'Analisa imagens enviadas pelo cliente (fotos de produtos, documentos, recibos) com capacidade multimodal.' },
    { icon: ShieldCheck, title: 'Coexistência Humano/IA', desc: 'O agente pausa automaticamente quando um humano intervém e retoma proativamente após um período configurável.' },
    { icon: Zap, title: 'Integração Oficial Meta Cloud API', desc: 'Conexão directa e segura com a Cloud API oficial da Meta. Mesma URL e token — sem intermediários.' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-6 py-20">
      {/* Hero */}
      <div className="text-center mb-20">
        <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-2 rounded-full text-sm font-medium mb-6">
          <Brain className="w-4 h-4" />
          Powered by Gemini 2.5 Flash
        </div>
        <h1 className="text-5xl font-bold mb-6 tracking-tight">WhatsApp com <span className="text-emerald-600">Inteligência Artificial</span></h1>
        <p className="text-xl text-zinc-600 max-w-3xl mx-auto leading-relaxed">
          Transforme o seu WhatsApp Business numa máquina de vendas e atendimento inteligente, com IA que compreende contexto, lê documentos, ouve áudios e aprende com o perfil do seu negócio.
        </p>
        <div className="flex items-center justify-center gap-4 mt-8">
          <Link to="/register">
            <Button className="bg-emerald-600 hover:bg-emerald-700 h-12 px-8 text-base gap-2">
              Começar Gratuitamente <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <Link to="/precos">
            <Button variant="outline" className="h-12 px-8 text-base">Ver Planos</Button>
          </Link>
        </div>
      </div>

      {/* Demo Chat */}
      <div className="grid md:grid-cols-2 gap-12 items-center mb-24">
        <div>
          <h2 className="text-3xl font-bold mb-6">Automação inteligente sem complicações</h2>
          <p className="text-lg text-zinc-600 mb-6 leading-relaxed">
            A nossa IA não apenas responde — ela compreende o contexto completo da conversa, usa a base de conhecimento do seu negócio e adapta o tom ao seu cliente.
          </p>
          <ul className="space-y-3">
            {['Respostas em &lt; 3 segundos', 'Integração directa com Meta Cloud API', 'Personalidade configurável pelo dashboard', 'Suporte a texto, voz, imagem e documentos'].map(item => (
              <li key={item} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs flex-shrink-0">✓</div>
                <span className="text-zinc-700" dangerouslySetInnerHTML={{ __html: item }} />
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-zinc-900 rounded-3xl p-6 shadow-2xl">
          <div className="flex items-center gap-2 mb-4 text-zinc-400 text-xs">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            WhatsApp Business — IA Activa
          </div>
          <div className="space-y-3">
            {[
              { from: 'user', text: 'Boa tarde! Têm entrega para o Huambo?' },
              { from: 'bot',  text: 'Boa tarde! 😊 Sim, fazemos entrega para o Huambo. O prazo é de 3 a 5 dias úteis e o custo é de 2 500 Kz. Deseja fazer um pedido agora?' },
              { from: 'user', text: 'Sim! Quero o modelo X512 em preto.' },
              { from: 'bot',  text: 'Perfeito! O X512 em preto está disponível por 89 000 Kz. Vou enviar o link de pagamento. Qual é o seu nome completo?' },
            ].map((msg, i) => (
              <div key={i} className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                  msg.from === 'user'
                    ? 'bg-emerald-600 text-white rounded-tr-sm'
                    : 'bg-zinc-800 text-zinc-100 rounded-tl-sm'
                }`}>
                  {msg.from === 'bot' && (
                    <div className="flex items-center gap-1 mb-1 text-emerald-400 text-[10px] font-medium">
                      <Brain className="w-3 h-3" /> Gemini 2.5 Flash
                    </div>
                  )}
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="mb-24">
        <h2 className="text-3xl font-bold text-center mb-12">Tudo o que precisa num só lugar</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map(f => (
            <div key={f.title} className="border border-zinc-200 rounded-2xl p-6 bg-white hover:shadow-md hover:border-emerald-200 transition-all">
              <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-4">
                <f.icon className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-zinc-900 mb-2 text-sm">{f.title}</h3>
              <p className="text-zinc-500 text-xs leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 rounded-3xl p-12 text-center text-white">
        <h2 className="text-3xl font-bold mb-4">Pronto para activar a sua IA?</h2>
        <p className="text-emerald-100 mb-8 max-w-xl mx-auto">Comece com 7 dias gratuitos. Sem cartão de crédito, sem compromisso.</p>
        <Link to="/register">
          <Button className="bg-white text-emerald-700 hover:bg-emerald-50 h-12 px-10 text-base font-bold gap-2">
            Criar Conta Gratuita <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
