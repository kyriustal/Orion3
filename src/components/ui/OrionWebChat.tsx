import { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Send, Bot, Loader2 } from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";
import { toast } from "sonner";
import ReactMarkdown from 'react-markdown';

type ChatMessage = {
    id: number;
    sender: "user" | "bot";
    text: string;
    time: string;
};

export function OrionWebChat() {
    const [isOpen, setIsOpen] = useState(false);
    const [isVisible, setIsVisible] = useState(true);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Draggable Position State
    const [position, setPosition] = useState({ x: 24, y: 24 }); // pixels from bottom/right
    const [isDragging, setIsDragging] = useState(false);
    const dragStartPos = useRef({ x: 0, y: 0 });
    const initialPos = useRef({ x: 24, y: 24 });

    useEffect(() => {
        if (isOpen && messages.length === 0) {
            setMessages([
                {
                    id: Date.now(),
                    sender: "bot",
                    text: "Olá! Sou o Assistente Orion. A Orion é uma plataforma criada para automatizar o atendimento de empresas e vendedores no WhatsApp através de assistentes virtuais 24h. Como posso te ajudar a configurar sua conta ou tirar dúvidas hoje?",
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                }
            ]);
        }
    }, [isOpen]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isTyping]);

    const handleTouchStart = (e: React.TouchEvent) => {
        setIsDragging(true);
        dragStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        initialPos.current = { ...position };
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isDragging) return;
        const deltaX = dragStartPos.current.x - e.touches[0].clientX;
        const deltaY = dragStartPos.current.y - e.touches[0].clientY;
        
        setPosition({
            x: Math.max(10, Math.min(window.innerWidth - 60, initialPos.current.x + deltaX)),
            y: Math.max(10, Math.min(window.innerHeight - 60, initialPos.current.y + deltaY))
        });
    };

    const handleTouchEnd = () => {
        setIsDragging(false);
    };

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMessage = input;
        setInput("");

        const newMsg: ChatMessage = {
            id: Date.now(),
            sender: "user",
            text: userMessage,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        setMessages(prev => [...prev, newMsg]);
        setIsTyping(true);

        try {
            const response = await fetch("/api/orion-web/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: userMessage, history: messages })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Falha ao conectar à Orion IA.");
            }

            setMessages(prev => [...prev, {
                id: Date.now(),
                sender: "bot",
                text: data.reply,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }]);

        } catch (error: any) {
            toast.error(error.message);
            setMessages(prev => [...prev, {
                id: Date.now(),
                sender: "bot",
                text: `Desculpe, ocorreu um erro temporal na minha rede de inteligência. Tente novamente!`,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }]);
        } finally {
            setIsTyping(false);
        }
    };

    if (!isVisible) return null;

    return (
        <>
            {/* Botão Flutuante Draggable */}
            {!isOpen && (
                <div 
                    style={{ 
                        bottom: `${position.y}px`, 
                        right: `${position.x}px`,
                        touchAction: 'none'
                    }}
                    className="fixed z-[100] group flex flex-col items-center gap-2"
                >
                    <button
                        onClick={() => setIsVisible(false)}
                        className="opacity-0 group-hover:opacity-100 bg-zinc-800 text-white p-1 rounded-full shadow-lg transition-opacity absolute -top-4 -right-2 z-10 scale-75"
                        title="Ocultar Chat"
                    >
                        <X className="w-3 h-3" />
                    </button>
                    
                    <button
                        onClick={() => setIsOpen(true)}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        className="w-14 h-14 bg-emerald-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:bg-emerald-700 transition-transform transform hover:scale-105 active:scale-95"
                    >
                        <MessageSquare className="w-6 h-6" />
                    </button>
                    
                    <span className="hidden md:block text-[10px] text-zinc-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        Arraste para mover
                    </span>
                </div>
            )}

            {/* Janela de Chat */}
            {isOpen && (
                <div className="fixed inset-0 sm:inset-auto sm:bottom-6 sm:right-6 w-full h-full sm:w-[380px] sm:h-[600px] bg-white sm:rounded-2xl shadow-2xl flex flex-col z-[110] sm:border border-zinc-200 overflow-hidden animate-in slide-in-from-bottom-5">
                    {/* Header */}
                    <div className="bg-emerald-600 p-4 text-white flex items-center justify-between shrink-0 shadow-sm pt-safe sm:pt-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                                <Bot className="w-6 h-6 text-white" />
                            </div>
                            <div className="min-w-0">
                                <h3 className="font-bold leading-tight truncate">Orion Assistant</h3>
                                <div className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
                                    <span className="text-[11px] text-emerald-100 italic">Disponível agora</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-1">
                            <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white p-2 hover:bg-white/10 rounded-xl transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50/50 scrollbar-hide">
                        {messages.map(msg => (
                            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
                                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[14px] shadow-sm relative ${msg.sender === 'user'
                                    ? 'bg-emerald-600 text-white rounded-tr-sm'
                                    : 'bg-white text-zinc-800 border border-zinc-100 rounded-tl-sm'
                                    }`}>
                                    <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-a:text-emerald-600 break-words">
                                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                                    </div>
                                    <div className={`text-[10px] mt-1 text-right ${msg.sender === 'user' ? 'text-emerald-200' : 'text-zinc-400'}`}>
                                        {msg.time}
                                    </div>
                                </div>
                            </div>
                        ))}

                        {isTyping && (
                            <div className="flex justify-start animate-in fade-in">
                                <div className="bg-white border border-zinc-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex gap-1.5 items-center">
                                    <div className="w-1.5 h-1.5 bg-emerald-500/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                                    <div className="w-1.5 h-1.5 bg-emerald-500/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                                    <div className="w-1.5 h-1.5 bg-emerald-500/80 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Footer Input */}
                    <div className="p-4 bg-white border-t border-zinc-100 shrink-0 pb-safe sm:pb-4">
                        <div className="flex gap-2">
                            <Input
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                placeholder="Fale com a nossa IA..."
                                className="bg-zinc-50 border-zinc-200 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500 rounded-xl h-11"
                                disabled={isTyping}
                            />
                            <Button
                                onClick={handleSend}
                                size="icon"
                                disabled={!input.trim() || isTyping}
                                className="rounded-xl w-11 h-11 bg-emerald-600 hover:bg-emerald-700 shrink-0 text-white shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
                            >
                                {isTyping ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                            </Button>
                        </div>
                        <p className="text-[10px] text-zinc-400 text-center mt-3">
                            Potencializado por <span className="font-semibold text-emerald-600">Orion AI</span>
                        </p>
                    </div>
                </div>
            )}
        </>
    );
}
