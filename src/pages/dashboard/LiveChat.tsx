import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Send, User, Bot, AlertCircle, MessageCircle, Loader2, Pause, Play, Wifi, WifiOff, Smartphone } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";

type Message = { id: number; sender: "user" | "bot" | "human"; text: string; time: string; botName?: string; };
type Chat = { id: string; phone: string; name: string; lastMessage: string; time: string; timestamp: string; platform?: string; unread?: number; };

export default function LiveChat() {
  const [isLoading,   setIsLoading]   = useState(true);
  const [isAiActive,  setIsAiActive]  = useState(true);
  const [message,     setMessage]     = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chats,    setChats]    = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingChatIds, setTypingChatIds] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const token = () => localStorage.getItem("token") || "";

  // Socket.io — tempo real
  useEffect(() => {
    const sock = io(window.location.origin, { transports: ["websocket", "polling"] });

    sock.on("connect", () => {
      setIsConnected(true);
      try {
        const decoded = JSON.parse(atob(token().split(".")[1]));
        if (decoded?.id) sock.emit("join_org", decoded.id);
      } catch {}
    });

    sock.on("disconnect", () => setIsConnected(false));

    sock.on("new_message", (data: { phone: string; sender: string; text: string; time: string; timestamp: string; platform?: string; botName?: string; }) => {
      setChats(prev => {
        const exists = prev.find(c => c.id === data.phone);
        if (exists) return prev.map(c => c.id === data.phone ? { ...c, lastMessage: data.text, time: data.time, unread: (c.unread || 0) + 1 } : c);
        return [{ id: data.phone, phone: data.phone, name: `Cliente (${data.phone})`, lastMessage: data.text, time: data.time, timestamp: data.timestamp, platform: data.platform, unread: 1 }, ...prev];
      });

      setActiveChatId(activeId => {
        if (activeId === data.phone) {
          setMessages(prev => [...prev, { id: Date.now() + Math.random(), sender: data.sender as any, text: data.text, time: data.time, botName: data.botName }]);
        }
        return activeId;
      });
    });

    sock.on("bot_typing", (data: { phone: string; typing: boolean }) => {
      setTypingChatIds(prev => {
        const next = new Set(prev);
        if (data.typing) next.add(data.phone);
        else next.delete(data.phone);
        return next;
      });
    });

    return () => { sock.disconnect(); };
  }, []);

  const fetchChats = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/chats", { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      if (Array.isArray(data)) setChats(data);
    } catch {} finally { setIsLoading(false); }
  }, []);

  useEffect(() => { fetchChats(); }, [fetchChats]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const selectChat = async (chat: Chat) => {
    setActiveChatId(chat.phone);
    setChats(prev => prev.map(c => c.id === chat.id ? { ...c, unread: 0 } : c));
    setMessages([]);
    try {
      const res = await fetch(`/api/whatsapp/history/${chat.phone}`, { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      if (Array.isArray(data)) setMessages(data);
    } catch { toast.error("Erro ao carregar histórico."); }
  };

  const handleSend = async () => {
    if (!message.trim() || !activeChatId) return;
    const text = message.trim();
    setMessage("");
    setMessages(prev => [...prev, { id: Date.now(), sender: "human", text, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]);
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ phone: activeChatId, message: text }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Falha ao enviar");
    } catch (err: any) { toast.error(err.message); }
  };

  const toggleAi = async () => {
    const next = !isAiActive;
    setIsAiActive(next);
    await fetch("/api/whatsapp/ai-pause", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` }, body: JSON.stringify({ phone: activeChatId, pause: !next }) });
    toast.info(next ? "IA retomada." : "IA pausada — você está no controlo.");
  };

  const activeChat = chats.find(c => c.id === activeChatId) || chats[0];

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      <Card className="w-80 flex flex-col">
        <CardHeader className="p-4 border-b border-zinc-100">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Conversas</CardTitle>
            <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${isConnected ? "bg-emerald-50 text-emerald-600" : "bg-zinc-100 text-zinc-400"}`}>
              {isConnected ? <><Wifi className="w-3 h-3" />Tempo real</> : <><WifiOff className="w-3 h-3" />Offline</>}
            </span>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-emerald-600" /></div>
          ) : chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <MessageCircle className="w-12 h-12 mb-3 opacity-10" />
              <p className="text-sm text-zinc-400">Aguardando mensagens...</p>
            </div>
          ) : chats.map(chat => (
            <div key={chat.id} onClick={() => selectChat(chat)} className={`p-4 border-b border-zinc-50 cursor-pointer transition-colors relative ${activeChatId === chat.phone ? "bg-emerald-50 border-l-2 border-l-emerald-500" : "hover:bg-zinc-50"}`}>
              <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-1.5">
                  <Smartphone className="w-3 h-3 text-emerald-500" />
                  <h3 className="font-medium text-sm text-zinc-900 truncate max-w-[130px]">{chat.name}</h3>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-zinc-400">{chat.time}</span>
                  {(chat.unread || 0) > 0 && <span className="w-5 h-5 bg-emerald-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">{chat.unread}</span>}
                </div>
              </div>
              <p className="text-xs text-zinc-400 truncate">{chat.lastMessage}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {activeChat ? (
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardHeader className="p-4 border-b border-zinc-100 flex flex-row items-center justify-between space-y-0 shrink-0">
            <div>
              <CardTitle className="text-base">{activeChat.name}</CardTitle>
              <p className="text-xs text-zinc-400 mt-0.5">{activeChat.phone}</p>
            </div>
            <button onClick={toggleAi} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${isAiActive ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
              {isAiActive ? <><Play className="w-3 h-3" />IA Activa</> : <><Pause className="w-3 h-3" />IA Pausada</>}
            </button>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50/30">
            {!isAiActive && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-xl border border-amber-200">
                <AlertCircle className="w-4 h-4" /> IA pausada — você está no controlo.
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={`${msg.id}-${i}`} className={`flex ${msg.sender === "user" ? "justify-start" : "justify-end"} animate-in fade-in`}>
                <div className={`max-w-[72%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${msg.sender === "user" ? "bg-white border border-zinc-100 text-zinc-900 rounded-tl-sm" : msg.sender === "bot" ? "bg-emerald-50 border border-emerald-100 text-emerald-900 rounded-tr-sm" : "bg-zinc-800 text-white rounded-tr-sm"}`}>
                  <div className="flex items-center gap-1.5 mb-1 opacity-60">
                    {msg.sender === "user" ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                    <span className="text-[10px] font-semibold uppercase tracking-wider">
                      {msg.sender === "user" ? "Cliente" : msg.sender === "bot" ? (msg.botName || "IA") : "Você"}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                  <p className="text-[10px] text-right mt-1 opacity-40">{msg.time}</p>
                </div>
              </div>
            ))}
            {activeChatId && typingChatIds.has(activeChatId) && (
              <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl rounded-tr-sm px-4 py-3 shadow-sm">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce"></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </CardContent>

          <div className="p-4 border-t border-zinc-100 bg-white shrink-0">
            <div className="flex gap-2">
              <Input value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSend()} placeholder="Escreva como agente humano..." className="flex-1" />
              <Button onClick={handleSend} disabled={!message.trim()} className="shrink-0 bg-emerald-600 hover:bg-emerald-700 gap-2"><Send className="w-4 h-4" />Enviar</Button>
            </div>
            <p className="text-[10px] text-zinc-400 mt-2 text-center">Enviar como humano pausa a IA por 5 min automaticamente.</p>
          </div>
        </Card>
      ) : (
        <Card className="flex-1 flex items-center justify-center">
          <div className="text-center text-zinc-400 p-8">
            <MessageCircle className="w-16 h-16 mx-auto mb-4 opacity-10" />
            <p className="text-lg font-medium text-zinc-500">Seleccione uma conversa</p>
            <p className="text-sm mt-1">{isConnected ? "✅ Ligado em tempo real" : "⏳ A conectar..."}</p>
          </div>
        </Card>
      )}
    </div>
  );
}
