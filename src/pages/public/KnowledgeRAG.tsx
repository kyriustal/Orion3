import { BookOpen, Upload, Search, Zap, FileText, Brain, CheckCircle, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/src/components/ui/button';

export default function KnowledgeRAG() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-20">
      {/* Hero */}
      <div className="text-center mb-20">
        <div className="inline-flex items-center gap-2 bg-violet-50 text-violet-700 border border-violet-200 px-4 py-2 rounded-full text-sm font-medium mb-6">
          <Brain className="w-4 h-4" />
          Retrieval-Augmented Generation
        </div>
        <h1 className="text-5xl font-bold mb-6 tracking-tight">
          IA que <span className="text-violet-600">conhece</span> o seu negócio
        </h1>
        <p className="text-xl text-zinc-600 max-w-3xl mx-auto leading-relaxed">
          Carregue documentos com informações sobre os seus produtos, serviços, preços e políticas. A IA usa essa base de conhecimento para responder com precisão aos seus clientes.
        </p>
      </div>

      {/* How it works */}
      <div className="grid md:grid-cols-3 gap-8 mb-24">
        {[
          { step: '01', icon: Upload, title: 'Carregue os seus documentos', desc: 'PDFs, DOCX, listas de preços, catálogos, FAQs. A plataforma extrai o texto automaticamente.' },
          { step: '02', icon: Search, title: 'A IA processa e aprende', desc: 'O Gemini 2.5 Flash usa a base de conhecimento para contextualizar cada resposta com precisão.' },
          { step: '03', icon: Zap, title: 'Respostas precisas e instantâneas', desc: 'O agente responde como se fosse um colaborador especialista, usando exactamente as informações que carregou.' },
        ].map(s => (
          <div key={s.step} className="text-center">
            <div className="w-16 h-16 bg-violet-100 text-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <s.icon className="w-7 h-7" />
            </div>
            <div className="text-xs font-bold text-violet-400 mb-2 tracking-wider">{s.step}</div>
            <h3 className="text-lg font-bold mb-2">{s.title}</h3>
            <p className="text-zinc-500 text-sm leading-relaxed">{s.desc}</p>
          </div>
        ))}
      </div>

      {/* Features */}
      <div className="bg-zinc-50 rounded-3xl p-10 mb-24">
        <h2 className="text-2xl font-bold mb-8 text-center">O que pode carregar</h2>
        <div className="grid md:grid-cols-2 gap-4 max-w-2xl mx-auto">
          {[
            'Listas de preços e catálogos de produtos',
            'Políticas de devolução, entrega e garantia',
            'FAQs e respostas a perguntas frequentes',
            'Contratos e termos de serviço',
            'Manuais e guias de utilização',
            'Apresentações institucionais (PDF/DOCX)',
          ].map(item => (
            <div key={item} className="flex items-center gap-3 bg-white rounded-xl p-4 border border-zinc-100">
              <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
              <span className="text-sm text-zinc-700">{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="text-center">
        <h2 className="text-3xl font-bold mb-4">Comece já</h2>
        <p className="text-zinc-500 mb-8">Configure a base de conhecimento no dashboard em menos de 5 minutos.</p>
        <div className="flex items-center justify-center gap-4">
          <Link to="/register">
            <Button className="bg-violet-600 hover:bg-violet-700 h-12 px-8 gap-2">
              Criar Conta Gratuita <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <Link to="/dashboard/knowledge">
            <Button variant="outline" className="h-12 px-8">Abrir Base de Conhecimento</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
