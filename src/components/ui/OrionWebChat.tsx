import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, Loader2, Sparkles } from 'lucide-react';
import { Button } from './button';
import { Input } from './input';
import ReactMarkdown from 'react-markdown';

type ChatMessage = {
  id: number;
  sender: 'user' | 'bot';
  text: string;
  time: string;
};

export function OrionWebChat() {
  const [isOpen,    setIsOpen]    = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [messages,  setMessages]  = useState<ChatMessage[]>([]);
  const [input,     setInput]     = useState('');
  const [isTyping,  setIsTyping]  = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Posição draggable
  const [position,    setPosition]    = useState({ x: 24, y: 24 });
  const [isDragging,  setIsDragging]  = useState(false);
  const dragStartPos  = useRef({ x: 0, y: 0 });
  const initialPos    = useRef({ x: 24, y: 24 });

  const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        id: Date.now(),
        sender: 'bot',
        text: 'Olá! 👋 Sou o assistente da **Orion**. Estou aqui para responder as suas dúvidas sobre a plataforma. Em que posso ajudar?',
        time: now(),
      }]);
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Handlers de drag (touch)
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    dragStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    initialPos.current = { ...position };
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const dx = dragStartPos.current.x - e.touches[0].clientX;
    const dy = dragStartPos.current.y - e.touches[0].clientY;
    setPosition({
      x: Math.max(10, Math.min(window.innerWidth - 70, initialPos.current.x + dx)),
      y: Math.max(10, Math.min(window.innerHeight - 70, initialPos.current.y + dy)),
    });
  };
  const handleTouchEnd = () => setIsDragging(false);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userText = input.trim();
    setInput('');

    const userMsg: ChatMessage = { id: Date.now(), sender: 'user', text: userText, time: now() };
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    try {
      const history = messages.map(m => ({ sender: m.sender, text: m.text }));
      const res = await fetch('/api/orion-web/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText, history }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro no servidor');

      setMessages(prev => [...prev, { id: Date.now(), sender: 'bot', text: data.reply, time: now() }]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'bot',
        text: 'Desculpe, tive um problema temporário. Por favor tente novamente! 🔄',
        time: now(),
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  if (!isVisible) return null;

  return (
    <>
      {/* Botão flutuante */}
      {!isOpen && (
        <div
          style={{ bottom: `${position.y}px`, right: `${position.x}px`, touchAction: 'none' }}
          className="fixed z-[100] group flex flex-col items-center gap-2"
        >
          <button
            onClick={() => setIsVisible(false)}
            className="opacity-0 group-hover:opacity-100 bg-zinc-800 text-white p-1 rounded-full shadow-lg transition-opacity absolute -top-3 -right-2 z-10 scale-75"
            title="Ocultar"
          >
            <X className="w-3 h-3" />
          </button>

          <button
            onClick={() => setIsOpen(true)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="relative w-14 h-14 bg-emerald-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:bg-emerald-700 transition-all transform hover:scale-105 active:scale-95"
          >
            <MessageSquare className="w-6 h-6" />
            {/* Pulse ring */}
            <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-20" />
          </button>
        </div>
      )}

      {/* Janela de Chat */}
      {isOpen && (
        <div className="fixed inset-0 sm:inset-auto sm:bottom-6 sm:right-6 w-full h-full sm:w-[380px] sm:h-[580px] bg-white sm:rounded-2xl shadow-2xl flex flex-col z-[110] sm:border border-zinc-200 overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 p-4 text-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold leading-tight">Orion Assistant</h3>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-emerald-300 rounded-full animate-pulse" />
                  <span className="text-[11px] text-emerald-100 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Gemini 2.5 Flash
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/80 hover:text-white p-2 hover:bg-white/10 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50/50">
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[14px] shadow-sm ${
                  msg.sender === 'user'
                    ? 'bg-emerald-600 text-white rounded-tr-sm'
                    : 'bg-white text-zinc-800 border border-zinc-100 rounded-tl-sm'
                }`}>
                  <div className="prose prose-sm max-w-none prose-p:my-0.5 break-words">
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                  </div>
                  <p className={`text-[10px] mt-1 text-right ${msg.sender === 'user' ? 'text-emerald-200' : 'text-zinc-400'}`}>
                    {msg.time}
                  </p>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start animate-in fade-in">
                <div className="bg-white border border-zinc-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex gap-1.5 items-center">
                  <Sparkles className="w-3 h-3 text-emerald-400 animate-pulse mr-0.5" />
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-emerald-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 bg-white border-t border-zinc-100 shrink-0">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="Escreva a sua mensagem..."
                className="bg-zinc-50 border-zinc-200 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500 rounded-xl h-11"
                disabled={isTyping}
              />
              <Button
                onClick={handleSend}
                size="icon"
                disabled={!input.trim() || isTyping}
                className="rounded-xl w-11 h-11 bg-emerald-600 hover:bg-emerald-700 shrink-0 text-white shadow-lg shadow-emerald-600/20 active:scale-95 transition-all"
              >
                {isTyping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-zinc-400 text-center mt-2.5">
              Powered by <span className="font-semibold text-emerald-600">Orion AI</span>
            </p>
          </div>
        </div>
      )}
    </>
  );
}
