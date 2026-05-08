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
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

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

    return (
        <>
            {/* Botão Flutuante */}
            <button
                onClick={() => setIsOpen(true)}
                className={`fixed bottom-6 right-6 w-14 h-14 bg-emerald-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:bg-emerald-700 transition-transform transform hover:scale-105 z-[100] ${isOpen ? 'hidden' : 'flex'}`}
            >
                <MessageSquare className="w-6 h-6" />
            </button>

            {/* Janela de Chat */}
            {isOpen && (
                <div className="fixed bottom-6 right-6 w-[360px] max-w-[calc(100vw-48px)] h-[550px] max-h-[calc(100vh-48px)] bg-white rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.3)] flex flex-col z-[100] border border-zinc-200 overflow-hidden animate-in slide-in-from-bottom-5">
                    {/* Header */}
                    <div className="bg-emerald-600 p-4 text-white flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                                <Bot className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h3 className="font-semibold leading-tight">Orion Assistant</h3>
                                <span className="text-[11px] text-emerald-100 italic">Online agora</span>
                            </div>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white p-1 hover:bg-white/10 rounded-full transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50/50">
                        {messages.map(msg => (
                            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-[14px] shadow-sm relative ${msg.sender === 'user'
                                    ? 'bg-emerald-600 text-white rounded-tr-sm'
                                    : 'bg-white text-zinc-800 border border-zinc-100 rounded-tl-sm prose prose-sm prose-p:leading-relaxed prose-a:text-emerald-600'
                                    }`}>
                                    {msg.sender === 'user' ? (
                                        msg.text
                                    ) : (
                                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                                    )}
                                    <div className={`text-[10px] mt-1 text-right ${msg.sender === 'user' ? 'text-emerald-200' : 'text-zinc-400'}`}>
                                        {msg.time}
                                    </div>
                                </div>
                            </div>
                        ))}

                        {isTyping && (
                            <div className="flex justify-start">
                                <div className="bg-white border border-zinc-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex gap-1 items-center max-w-[85%]">
                                    <div className="w-2 h-2 bg-zinc-300 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                                    <div className="w-2 h-2 bg-zinc-300 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                                    <div className="w-2 h-2 bg-zinc-300 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Footer Input */}
                    <div className="p-3 bg-white border-t border-zinc-100 shrink-0">
                        <div className="flex gap-2">
                            <Input
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                placeholder="Escreva sua mensagem..."
                                className="bg-zinc-50 border-transparent focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500 rounded-xl"
                                disabled={isTyping}
                            />
                            <Button
                                onClick={handleSend}
                                size="icon"
                                disabled={!input.trim() || isTyping}
                                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 shrink-0 text-white"
                            >
                                {isTyping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
