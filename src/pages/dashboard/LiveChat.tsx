import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Send, User, Bot, AlertCircle, MessageCircle, Loader2, Pause, Play, Wifi, WifiOff, Smartphone, ArrowLeft, Paperclip, FileText, X } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
type Message = { id: number; sender: "user" | "bot" | "human"; text: string; time: string; timestamp?: string; botName?: string; agentName?: string; metadata?: any; };
type Chat = { id: string; phone: string; name: string; lastMessage: string; time: string; timestamp: string; platform?: string; unread?: number; };

const formatSeparatorDate = (timestampStr?: string) => {
  if (!timestampStr) return "Hoje";
  const date = new Date(timestampStr);
  if (isNaN(date.getTime())) return "Hoje";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return "Hoje";
  } else if (date.toDateString() === yesterday.toDateString()) {
    return "Ontem";
  } else {
    return date.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' });
  }
};

// Para a previsualização da lista de conversas: hora se hoje, "Ontem" se ontem, data curta se mais antigo
const formatChatPreviewDate = (timestampStr?: string, fallbackTime?: string) => {
  if (!timestampStr) return fallbackTime || "";
  const date = new Date(timestampStr);
  if (isNaN(date.getTime())) return fallbackTime || "";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    // Hoje: mostrar apenas a hora
    return date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  } else if (date.toDateString() === yesterday.toDateString()) {
    return "Ontem";
  } else {
    // Mais antigo: mostrar dia e mês abreviado (ex: "24 mai")
    return date.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' });
  }
};

export default function LiveChat() {
  const [isLoading,   setIsLoading]   = useState(true);
  const [isAiActive,  setIsAiActive]  = useState(true);
  const [message,     setMessage]     = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chats,    setChats]    = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingChatIds, setTypingChatIds] = useState<Set<string>>(new Set());
  const [showMobileList, setShowMobileList] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const token = () => localStorage.getItem("token") || "";

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [isSendingFile, setIsSendingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Limpar pré-visualizações para evitar memory leaks
  useEffect(() => {
    return () => {
      if (filePreviewUrl) {
        URL.revokeObjectURL(filePreviewUrl);
      }
    };
  }, [filePreviewUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("O ficheiro excede o limite de 10 MB.");
      return;
    }

    setSelectedFile(file);

    if (file.type.startsWith("image/")) {
      const previewUrl = URL.createObjectURL(file);
      setFilePreviewUrl(previewUrl);
    } else {
      setFilePreviewUrl(null);
    }
  };

  const removeSelectedFile = () => {
    setSelectedFile(null);
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
      setFilePreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Socket.io — tempo real
  useEffect(() => {
    const sock = io(window.location.origin, { transports: ["websocket", "polling"] });

    sock.on("connect", () => {
      setIsConnected(true);
      try {
        const decoded = JSON.parse(atob(token().split(".")[1]));
        const orgId = decoded?.orgId || decoded?.id;
        if (orgId) sock.emit("join_org", orgId);
      } catch {}
    });

    sock.on("disconnect", () => setIsConnected(false));

    sock.on("new_message", (data: { phone: string; sender: string; text: string; time: string; timestamp: string; platform?: string; botName?: string; agentName?: string; metadata?: any; }) => {
      setChats(prev => {
        const exists = prev.find(c => c.id === data.phone);
        if (exists) return prev.map(c => c.id === data.phone ? { ...c, lastMessage: data.text, time: data.time, unread: (c.unread || 0) + 1 } : c);
        const nameDisplay = data.platform === 'instagram' ? `Instagram (@${data.phone})` : data.platform === 'facebook' ? `Messenger (${data.phone.slice(-6)})` : `WhatsApp (${data.phone})`;
        return [{ id: data.phone, phone: data.phone, name: nameDisplay, lastMessage: data.text, time: data.time, timestamp: data.timestamp, platform: data.platform, unread: 1 }, ...prev];
      });

      setActiveChatId(activeId => {
        if (activeId === data.phone) {
          setMessages(prev => {
            // Evitar duplicações detetando se a mensagem humana já existe na lista
            if (data.sender === "human") {
              const isDuplicate = prev.some(msg => 
                msg.sender === "human" && 
                msg.text === data.text && 
                Math.abs(new Date(msg.timestamp || '').getTime() - new Date(data.timestamp).getTime()) < 10000
              );
              if (isDuplicate) {
                // Atualiza o nome do agente se ainda não estiver definido
                return prev.map(msg => 
                  (msg.sender === "human" && msg.text === data.text && !msg.agentName) 
                  ? { ...msg, agentName: data.agentName } 
                  : msg
                );
              }
            }
            return [...prev, { 
              id: Date.now() + Math.random(), 
              sender: data.sender as any, 
              text: data.text, 
              time: data.time, 
              timestamp: data.timestamp || new Date().toISOString(),
              botName: data.botName,
              agentName: data.agentName,
              metadata: data.metadata
            }];
          });
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
    setShowMobileList(false);
    setChats(prev => prev.map(c => c.id === chat.id ? { ...c, unread: 0 } : c));
    setMessages([]);
    try {
      const res = await fetch(`/api/whatsapp/history/${chat.phone}`, { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      if (Array.isArray(data)) setMessages(data);
    } catch { toast.error("Erro ao carregar histórico."); }
  };

  const handleSend = async () => {
    if (!activeChatId) return;
    if (!message.trim() && !selectedFile) return;

    let agentName = "Você";
    try {
      const decoded = JSON.parse(atob(token().split(".")[1]));
      agentName = decoded?.name || decoded?.email?.split('@')[0] || "Você";
    } catch {}

    const text = message.trim();
    setMessage("");

    if (selectedFile) {
      setIsSendingFile(true);
      const fileToSend = selectedFile;
      const fileType = fileToSend.type;
      const fileName = fileToSend.name;
      const localPreviewUrl = filePreviewUrl;
      removeSelectedFile();

      const tempId = Date.now();
      setMessages(prev => [...prev, {
        id: tempId,
        sender: "human",
        text: text ? `[Ficheiro: ${fileName}](${localPreviewUrl || ""})\n\n${text}` : `[Ficheiro: ${fileName}](${localPreviewUrl || ""})`,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        timestamp: new Date().toISOString(),
        agentName,
        metadata: {
          agentName,
          mediaUrl: localPreviewUrl || "",
          fileName,
          mimeType: fileType,
          isUploading: true
        }
      }]);

      try {
        const formData = new FormData();
        formData.append("phone", activeChatId);
        formData.append("file", fileToSend);
        if (text) {
          formData.append("message", text);
        }

        const res = await fetch("/api/whatsapp/send-file", {
          method: "POST",
          headers: { Authorization: `Bearer ${token()}` },
          body: formData,
        });

        const resData = await res.json();
        if (!res.ok) throw new Error(resData.error || "Falha ao enviar ficheiro");

        setMessages(prev => prev.map(m => m.id === tempId ? {
          ...m,
          text: text ? `[Ficheiro: ${fileName}](${resData.fileUrl})\n\n${text}` : `[Ficheiro: ${fileName}](${resData.fileUrl})`,
          metadata: {
            agentName,
            mediaUrl: resData.fileUrl,
            fileName: resData.fileName,
            mimeType: fileType
          }
        } : m));

      } catch (err: any) {
        toast.error(err.message);
        setMessages(prev => prev.filter(m => m.id !== tempId));
      } finally {
        setIsSendingFile(false);
      }
    } else {
      setMessages(prev => [...prev, { 
        id: Date.now(), 
        sender: "human", 
        text, 
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        timestamp: new Date().toISOString(),
        agentName
      }]);

      try {
        const res = await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
          body: JSON.stringify({ phone: activeChatId, message: text }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Falha ao enviar");
      } catch (err: any) { toast.error(err.message); }
    }
  };

  const toggleAi = async () => {
    const next = !isAiActive;
    setIsAiActive(next);
    await fetch("/api/whatsapp/ai-pause", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` }, body: JSON.stringify({ phone: activeChatId, pause: !next }) });
    toast.info(next ? "IA retomada." : "IA pausada — você está no controlo.");
  };

  const activeChat = chats.find(c => c.id === activeChatId) || chats[0];

  const renderMessageContent = (text: string, metadata?: any) => {
    const filePreview = metadata?.mediaUrl ? (
      <div className="mt-2 border border-zinc-200/60 dark:border-zinc-700/60 rounded-xl overflow-hidden bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm shadow-sm max-w-sm">
        {metadata.mimeType?.startsWith("image/") ? (
          <a href={metadata.mediaUrl} target="_blank" rel="noopener noreferrer" className="block relative group overflow-hidden aspect-video bg-zinc-100 dark:bg-zinc-800">
            <img src={metadata.mediaUrl} alt={metadata.fileName || "Imagem"} className="object-cover w-full h-full transition-transform duration-300 group-hover:scale-105" />
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="text-white text-xs font-medium bg-black/60 px-2.5 py-1 rounded-full backdrop-blur-sm">Visualizar imagem</span>
            </div>
            {metadata.isUploading && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-white" />
              </div>
            )}
          </a>
        ) : metadata.mimeType?.startsWith("video/") ? (
          <div className="space-y-0">
            <video controls src={metadata.mediaUrl} className="w-full bg-black" style={{ maxHeight: 220 }} />
            <div className="p-2.5 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">{metadata.fileName || "Vídeo"}</p>
              <a href={metadata.mediaUrl} download={metadata.fileName || "video"} className="shrink-0 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline px-2 py-1 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors">
                Baixar
              </a>
            </div>
          </div>
        ) : metadata.mimeType?.startsWith("audio/") ? (
          <div className="p-3 space-y-2.5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-lg shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">{metadata.fileName || "Áudio"}</p>
                <p className="text-[10px] text-zinc-400 uppercase mt-0.5">Áudio</p>
              </div>
              <a href={metadata.mediaUrl} download={metadata.fileName || "audio"} className="shrink-0 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline px-2 py-1 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors">
                Baixar
              </a>
            </div>
            <audio controls src={metadata.mediaUrl} className="w-full" style={{ height: 32 }} />
          </div>
        ) : (
          <div className="p-3 flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-lg">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">{metadata.fileName || "Documento"}</p>
              <p className="text-[10px] text-zinc-400 uppercase mt-0.5">{metadata.mimeType?.split("/")[1] || "ficheiro"}</p>
            </div>
            {metadata.isUploading ? (
              <Loader2 className="w-4 h-4 animate-spin text-emerald-600 shrink-0" />
            ) : (
              <a href={metadata.mediaUrl} download target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors">
                Baixar
              </a>
            )}
          </div>
        )}
      </div>
    ) : null;

    const parseLinks = (rawText: string) => {
      if (!rawText) return "";
      
      const tokens: { start: number; end: number; type: 'markdown' | 'url'; text: string; url: string; }[] = [];
      
      const mdMatches = [...rawText.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g)];
      for (const m of mdMatches) {
        if (m.index !== undefined) {
          tokens.push({
            start: m.index,
            end: m.index + m[0].length,
            type: 'markdown',
            text: m[1],
            url: m[2]
          });
        }
      }
      
      const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;
      const urlMatches = [...rawText.matchAll(urlRegex)];
      for (const m of urlMatches) {
        if (m.index !== undefined) {
          const isInsideMd = tokens.some(t => m.index! >= t.start && m.index! < t.end);
          if (!isInsideMd) {
            tokens.push({
              start: m.index,
              end: m.index + m[0].length,
              type: 'url',
              text: m[1],
              url: m[1]
            });
          }
        }
      }
      
      tokens.sort((a, b) => a.start - b.start);
      
      const parts: React.ReactNode[] = [];
      let currentIndex = 0;
      tokens.forEach((token, idx) => {
        if (token.start > currentIndex) {
          parts.push(rawText.substring(currentIndex, token.start));
        }
        parts.push(
          <a key={idx} href={token.url} target="_blank" rel="noopener noreferrer" className="underline text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-semibold break-all inline-flex items-center gap-0.5">
            {token.text}
          </a>
        );
        currentIndex = token.end;
      });
      
      if (currentIndex < rawText.length) {
        parts.push(rawText.substring(currentIndex));
      }
      
      return parts.length > 0 ? parts : rawText;
    };

    // Suprimir texto placeholder quando há previsualização de ficheiro (evitar duplicação)
    const isMediaPlaceholder = filePreview && /^\((Imagem|V[íi]deo|[\u00c1A]udio|Documento|Conte[úu]do|Ficheiro|Anexo|Mensagem de [\u00c1A]udio)[^)]*\)$/.test(text?.trim() || "");

    return (
      <div className="space-y-1.5">
        {!isMediaPlaceholder && <p className="whitespace-pre-wrap leading-relaxed break-words">{parseLinks(text)}</p>}
        {filePreview}
      </div>
    );
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      <Card className={`w-full lg:w-80 flex flex-col shrink-0 ${!showMobileList ? "hidden lg:flex" : "flex"}`}>
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
          ) : chats.map(chat => {
            const previewDate = formatChatPreviewDate(chat.timestamp, chat.time);
            const isToday = chat.timestamp && new Date(chat.timestamp).toDateString() === new Date().toDateString();
            return (
              <div key={chat.id} onClick={() => selectChat(chat)} className={`p-4 border-b border-zinc-50 cursor-pointer transition-colors relative ${activeChatId === chat.phone ? "bg-emerald-50 border-l-2 border-l-emerald-500" : "hover:bg-zinc-50"}`}>
                <div className="flex justify-between items-start mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Smartphone className="w-3 h-3 text-emerald-500 shrink-0" />
                    <h3 className="font-medium text-sm text-zinc-900 truncate max-w-[120px]">{chat.name}</h3>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-1">
                    <span className={`text-[10px] font-medium ${isToday ? 'text-zinc-400' : 'text-emerald-600'}`}>{previewDate}</span>
                    {(chat.unread || 0) > 0 && <span className="w-5 h-5 bg-emerald-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">{chat.unread}</span>}
                  </div>
                </div>
                <p className="text-xs text-zinc-400 truncate">{chat.lastMessage}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {activeChat ? (
        <Card className={`flex-1 flex flex-col overflow-hidden w-full ${showMobileList ? "hidden lg:flex" : "flex"}`}>
          <CardHeader className="p-4 border-b border-zinc-100 flex flex-row items-center justify-between space-y-0 shrink-0 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button onClick={() => setShowMobileList(true)} className="lg:hidden p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-600 shrink-0">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <CardTitle className="text-base truncate">{activeChat.name}</CardTitle>
                <p className="text-xs text-zinc-400 mt-0.5 truncate">{activeChat.phone}</p>
              </div>
            </div>
            <button onClick={toggleAi} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium shrink-0 transition-all ${isAiActive ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
              {isAiActive ? <><Play className="w-3 h-3" />IA Activa</> : <><Pause className="w-3 h-3" />IA Pausada</>}
            </button>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50/30">
            {!isAiActive && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-xl border border-amber-200">
                <AlertCircle className="w-4 h-4" /> IA pausada — você está no controlo.
              </div>
            )}
            {messages.map((msg, i) => {
              const showSeparator = i === 0 || (
                msg.timestamp && messages[i - 1]?.timestamp && 
                new Date(msg.timestamp).toDateString() !== new Date(messages[i - 1].timestamp!).toDateString()
              );

              return (
                <div key={`${msg.id}-${i}`} className="space-y-4">
                  {showSeparator && (
                    <div className="relative flex items-center justify-center my-6">
                      <div className="absolute inset-0 flex items-center" aria-hidden="true">
                        <div className="w-full border-t border-zinc-200/60"></div>
                      </div>
                      <div className="relative flex justify-center">
                        <span className="bg-zinc-200/70 dark:bg-zinc-800 backdrop-blur-sm px-3 py-1 text-[11px] font-bold text-zinc-600 dark:text-zinc-300 rounded-full border border-zinc-300/50 shadow-sm uppercase tracking-wider">
                          {formatSeparatorDate(msg.timestamp)}
                        </span>
                      </div>
                    </div>
                  )}
                  <div className={`flex ${msg.sender === "user" ? "justify-start" : "justify-end"} animate-in fade-in`}>
                    <div className={`max-w-[72%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${msg.sender === "user" ? "bg-white border border-zinc-100 text-zinc-900 rounded-tl-sm" : msg.sender === "bot" ? "bg-emerald-50 border border-emerald-100 text-emerald-900 rounded-tr-sm" : "bg-zinc-800 text-white rounded-tr-sm"}`}>
                      <div className="flex items-center gap-1.5 mb-1 opacity-60">
                        {msg.sender === "user" ? <User className="w-3 h-3" /> : (msg.sender === "bot" ? <Bot className="w-3 h-3" /> : <User className="w-3 h-3" />)}
                        <span className="text-[10px] font-semibold uppercase tracking-wider">
                          {msg.sender === "user" ? "Cliente" : msg.sender === "bot" ? (msg.botName || "IA") : (msg.agentName || "Você")}
                        </span>
                      </div>
                      {renderMessageContent(msg.text, msg.metadata)}
                      <p className="text-[10px] text-right mt-1 opacity-40">{msg.time}</p>
                    </div>
                  </div>
                </div>
              );
            })}
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
            {selectedFile && (
              <div className="mb-3 p-2 bg-zinc-50 border border-zinc-200 rounded-xl flex items-center justify-between gap-3 animate-in slide-in-from-bottom-2 duration-200">
                <div className="flex items-center gap-2.5 min-w-0">
                  {filePreviewUrl ? (
                    <div className="w-10 h-10 rounded-lg overflow-hidden border border-zinc-200 bg-white shrink-0">
                      <img src={filePreviewUrl} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-zinc-200 shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-zinc-800 truncate">{selectedFile.name}</p>
                    <p className="text-[10px] text-zinc-400">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
                <button onClick={removeSelectedFile} className="p-1 hover:bg-zinc-200 rounded-full text-zinc-500 shrink-0 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="flex gap-2 items-center">
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="*" />
              <Button type="button" onClick={() => fileInputRef.current?.click()} variant="outline" className="shrink-0 p-2.5 h-10 w-10 border border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950 transition-colors rounded-lg">
                <Paperclip className="w-5 h-5" />
              </Button>
              <Input value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSend()} placeholder={selectedFile ? "Adicione uma legenda ao ficheiro..." : "Escreva como agente humano..."} className="flex-1" />
              <Button onClick={handleSend} disabled={!message.trim() && !selectedFile} className="shrink-0 bg-emerald-600 hover:bg-emerald-700 gap-2">
                {isSendingFile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Enviar
              </Button>
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
