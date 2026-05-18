import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Bot, Send, RefreshCw, Loader2, User, Sparkles, RotateCcw, Info } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

type Message = {
  id: number;
  sender: 'user' | 'bot';
  text: string;
  time: string;
  isThinking?: boolean;
};

export default function Simulation() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [orgName, setOrgName]   = useState('');
  const [botName, setBotName]   = useState('Assistente');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Carregar nome da organização e bot
    const token = localStorage.getItem('token');
    fetch('/api/settings/org', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (d.name)         setOrgName(d.name);
        if (d.chatbot_name) setBotName(d.chatbot_name);
      })
      .catch(() => {});

    // Mensagem de boas-vindas
    setMessages([{
      id: Date.now(),
      sender: 'bot',
      text: '👋 Olá! Sou o seu agente de IA. Faça-me uma pergunta como se fosse um cliente seu.',
      time: now(),
    }]);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMsg: Message = {
      id: Date.now(),
      sender: 'user',
      text: input.trim(),
      time: now(),
    };

    const currentInput = input.trim();
    setInput('');
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    try {
      const token = localStorage.getItem('token');
      const history = messages
        .filter(m => !m.isThinking)
        .map(m => ({ sender: m.sender === 'user' ? 'user' : 'bot', text: m.text }));

      const res = await fetch('/api/agent/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: currentInput, history }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || 'Erro na simulação');

      const botMsg: Message = {
        id: Date.now() + 1,
        sender: 'bot',
        text: data.reply,
        time: now(),
      };

      setMessages(prev => [...prev, botMsg]);
    } catch (err: any) {
      const errorDetail = err.message || 'Erro desconhecido';
      toast.error(errorDetail);
      
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        sender: 'bot',
        text: `❌ **Falha na Simulação**\n\n**Erro:** ${errorDetail}\n\n*Verifique os logs do servidor para mais detalhes.*`,
        time: now(),
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleReset = () => {
    setMessages([{
      id: Date.now(),
      sender: 'bot',
      text: '🔄 Conversa reiniciada. Faça-me uma nova pergunta!',
      time: now(),
    }]);
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Simulação do Agente</h2>
          <p className="text-zinc-500 text-sm mt-1">
            Teste o seu agente IA exatamente como os seus clientes vão interagir via WhatsApp.
          </p>
        </div>
        <Button variant="outline" onClick={handleReset} className="gap-2 self-start sm:self-auto">
          <RotateCcw className="w-4 h-4" />
          Reiniciar
        </Button>
      </div>

      {/* Info banner */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-4 text-sm text-left">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0 text-emerald-600" />
          <span className="font-semibold">Powered by Gemini 2.5 Flash</span>
        </div>
        <div>
          <span>com raciocínio activado. A IA usa a personalidade e base de conhecimento definidas nas <a href="/dashboard/settings" className="underline font-medium">Configurações → Chatbot (IA)</a>.</span>
        </div>
      </div>

      {/* Chat Interface */}
      <Card className="flex flex-col min-h-[450px]" style={{ height: 'calc(100vh - 18rem)' }}>
        <CardHeader className="p-4 border-b border-zinc-100 flex flex-row items-center gap-3 space-y-0">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
            <Bot className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <CardTitle className="text-base">{botName}</CardTitle>
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Sparkles className="w-3 h-3 text-emerald-500" />
              <span className="text-emerald-600 font-medium">Gemini 2.5 Flash</span>
              <span>·</span>
              <span>{orgName || 'A sua empresa'}</span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50/30">
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
              {msg.sender === 'bot' && (
                <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center mr-2 mt-1 shrink-0">
                  <Bot className="w-4 h-4 text-emerald-600" />
                </div>
              )}
              <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                msg.sender === 'user'
                  ? 'bg-emerald-600 text-white rounded-tr-sm'
                  : 'bg-white border border-zinc-100 text-zinc-800 rounded-tl-sm'
              }`}>
                {msg.sender === 'bot' ? (
                  <div className="prose prose-sm max-w-none prose-p:my-1 prose-p:leading-relaxed">
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                  </div>
                ) : (
                  <p>{msg.text}</p>
                )}
                <p className={`text-[10px] mt-1.5 text-right ${msg.sender === 'user' ? 'text-emerald-200' : 'text-zinc-400'}`}>
                  {msg.time}
                </p>
              </div>
              {msg.sender === 'user' && (
                <div className="w-7 h-7 rounded-full bg-zinc-200 flex items-center justify-center ml-2 mt-1 shrink-0">
                  <User className="w-4 h-4 text-zinc-500" />
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start animate-in fade-in">
              <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center mr-2 mt-1 shrink-0">
                <Bot className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="bg-white border border-zinc-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                <div className="flex gap-1.5 items-center">
                  <Sparkles className="w-3 h-3 text-emerald-400 animate-pulse mr-1" />
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-emerald-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </CardContent>

        <div className="p-4 border-t border-zinc-100 bg-white">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Simule uma mensagem de cliente..."
              disabled={isTyping}
              className="flex-1"
            />
            <Button onClick={handleSend} disabled={!input.trim() || isTyping} className="shrink-0 bg-emerald-600 hover:bg-emerald-700">
              {isTyping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
