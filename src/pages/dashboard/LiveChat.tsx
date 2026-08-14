import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { 
  Send, User, Bot, AlertCircle, MessageCircle, Loader2, Pause, Play, 
  Wifi, WifiOff, Smartphone, ArrowLeft, Paperclip, FileText, X, 
  Mic, Camera, Video, Square, Check, CheckCheck, RefreshCw, 
  Volume2, Search, ChevronUp, ChevronDown, Plus, Phone
} from "lucide-react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";

type Message = { id: number; sender: "user" | "bot" | "human"; text: string; time: string; timestamp?: string; botName?: string; agentName?: string; metadata?: any; };
type Chat = { id: string; phone: string; name: string; lastMessage: string; time: string; timestamp: string; platform?: string; unread?: number; needs_confirm?: boolean; };

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

const formatChatPreviewDate = (timestampStr?: string, fallbackTime?: string) => {
  if (!timestampStr) return fallbackTime || "";
  const date = new Date(timestampStr);
  if (isNaN(date.getTime())) return fallbackTime || "";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  } else if (date.toDateString() === yesterday.toDateString()) {
    return "Ontem";
  } else {
    return date.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' });
  }
};

const formatTimer = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

function ExpandableDescription({ text, maxLength = 110 }: { text: string; maxLength?: number }) {
  const [isExpanded, setIsExpanded] = useState(false);
  if (!text) return null;

  const cleanText = text.replace(/^\[(Mensagem de Áudio|Documento "[^"]+")\]:\s*/i, '').trim();
  if (!cleanText) return null;

  const needsTruncate = cleanText.length > maxLength;
  const displayText = (!isExpanded && needsTruncate) ? `${cleanText.slice(0, maxLength)}...` : cleanText;

  return (
    <div className="mt-1.5 pt-1.5 border-t border-black/10 dark:border-white/10 text-[12px] opacity-90">
      <p className="whitespace-pre-wrap leading-relaxed break-words">{displayText}</p>
      {needsTruncate && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
          className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline mt-1 inline-block focus:outline-none"
        >
          {isExpanded ? "Ver menos" : "Ver mais"}
        </button>
      )}
    </div>
  );
}

export default function LiveChat() {
  const [isLoading,   setIsLoading]   = useState(true);
  const [isAiActive,  setIsAiActive]  = useState(true);
  const [message,     setMessage]     = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chats,    setChats]    = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingChatIds, setTypingChatIds] = useState<Set<string>>(new Set());
  const [errorChatIds,  setErrorChatIds]  = useState<Set<string>>(new Set());
  const [showMobileList, setShowMobileList] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const token = () => localStorage.getItem("token") || "";

  // Seleção e pré-visualização de ficheiros
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [isSendingFile, setIsSendingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados de Gravação de Áudio (Microfone)
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioTimerRef = useRef<any>(null);

  // Estados de Gravação de Vídeo (Webcam Modal)
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoPreviewBlob, setVideoPreviewBlob] = useState<Blob | null>(null);
  const [videoPreviewLocalUrl, setVideoPreviewLocalUrl] = useState<string | null>(null);

  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const videoTimerRef = useRef<any>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);

  // Estados para Pesquisa de Conversas e Mensagens
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [isMessageSearchOpen, setIsMessageSearchOpen] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [searchResultIndex, setSearchResultIndex] = useState(0);
  const messageRefs = useRef<{ [key: string | number]: HTMLDivElement | null }>({});
  const pendingClientIds = useRef<Set<string>>(new Set());

  // ─── Nova Conversa (modal) ────────────────────────────────────────────────────
  const [isNewChatOpen,    setIsNewChatOpen]    = useState(false);
  const [newChatDialCode,  setNewChatDialCode]  = useState("+244");
  const [newChatNumber,    setNewChatNumber]    = useState("");
  const [newChatError,     setNewChatError]     = useState("");
  const [isStartingChat,   setIsStartingChat]   = useState(false);

  const DIAL_CODES = [
    { flag: "🇦🇴", name: "Angola",       code: "+244" },
    { flag: "🇵🇹", name: "Portugal",     code: "+351" },
    { flag: "🇧🇷", name: "Brasil",       code: "+55"  },
    { flag: "🇿🇦", name: "África do Sul",code: "+27"  },
    { flag: "🇳🇬", name: "Nigéria",      code: "+234" },
    { flag: "🇨🇩", name: "R.D. Congo",   code: "+243" },
    { flag: "🇨🇬", name: "Congo",        code: "+242" },
    { flag: "🇬🇧", name: "Reino Unido",  code: "+44"  },
    { flag: "🇺🇸", name: "EUA",          code: "+1"   },
    { flag: "🇫🇷", name: "França",       code: "+33"  },
    { flag: "🇪🇸", name: "Espanha",      code: "+34"  },
    { flag: "🇩🇪", name: "Alemanha",     code: "+49"  },
    { flag: "🇮🇹", name: "Itália",       code: "+39"  },
    { flag: "🇲🇿", name: "Moçambique",   code: "+258" },
    { flag: "🇨🇻", name: "Cabo Verde",   code: "+238" },
    { flag: "🇸🇹", name: "S. Tomé",      code: "+239" },
    { flag: "🇬🇶", name: "G. Equatorial",code: "+240" },
    { flag: "🇳🇦", name: "Namíbia",      code: "+264" },
    { flag: "🇿🇲", name: "Zâmbia",       code: "+260" },
    { flag: "🇹🇿", name: "Tanzânia",     code: "+255" },
    { flag: "🇰🇪", name: "Quénia",       code: "+254" },
    { flag: "🇦🇪", name: "E.A.U.",       code: "+971" },
    { flag: "🇮🇳", name: "Índia",        code: "+91"  },
    { flag: "🇨🇳", name: "China",        code: "+86"  },
  ];

  const handleStartNewChat = async () => {
    const digits = newChatNumber.replace(/\D/g, "");
    if (!digits || digits.length < 6) {
      setNewChatError("Insira um número de telefone válido.");
      return;
    }
    setNewChatError("");
    setIsStartingChat(true);

    // Número completo no formato E.164 sem o +
    const fullPhone = `${newChatDialCode.replace("+", "")}${digits}`;

    // Se a conversa já existe na lista, abrir directamente
    const existing = chats.find(c => c.phone === fullPhone || c.phone === `+${fullPhone}`);
    if (existing) {
      setIsStartingChat(false);
      setIsNewChatOpen(false);
      setNewChatNumber("");
      selectChat(existing);
      return;
    }

    // Criar entrada temporária na lista e abrir o chat
    const displayPhone = `${newChatDialCode}${digits}`;
    const tempChat: Chat = {
      id: fullPhone,
      phone: fullPhone,
      name: `WhatsApp (${displayPhone})`,
      lastMessage: "",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      timestamp: new Date().toISOString(),
      platform: "whatsapp",
      unread: 0,
    };

    setChats(prev => [tempChat, ...prev.filter(c => c.phone !== fullPhone)]);
    setIsStartingChat(false);
    setIsNewChatOpen(false);
    setNewChatNumber("");
    setActiveChatId(fullPhone);
    setMessages([]);
    setShowMobileList(false);
    setIsAiActive(true);

    // Tentar carregar histórico existente (pode estar vazio)
    try {
      const res = await fetch(`/api/whatsapp/history/${fullPhone}`, { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) setMessages(data);
    } catch {}
  };

  const filteredChats = useMemo(() => {
    if (!chatSearchQuery.trim()) return chats;
    const q = chatSearchQuery.toLowerCase().trim();
    return chats.filter(chat =>
      chat.phone.toLowerCase().includes(q) ||
      chat.name.toLowerCase().includes(q) ||
      (chat.lastMessage && chat.lastMessage.toLowerCase().includes(q))
    );
  }, [chats, chatSearchQuery]);

  const matchingMessageIndices = useMemo(() => {
    if (!messageSearchQuery.trim()) return [];
    const q = messageSearchQuery.toLowerCase().trim();
    const result: number[] = [];
    messages.forEach((msg, idx) => {
      if (msg.text && msg.text.toLowerCase().includes(q)) {
        result.push(idx);
      } else if (msg.metadata?.fileName && msg.metadata.fileName.toLowerCase().includes(q)) {
        result.push(idx);
      }
    });
    return result;
  }, [messages, messageSearchQuery]);

  useEffect(() => {
    if (matchingMessageIndices.length > 0 && searchResultIndex < matchingMessageIndices.length) {
      const targetIdx = matchingMessageIndices[searchResultIndex];
      const targetMsg = messages[targetIdx];
      if (targetMsg && messageRefs.current[targetMsg.id]) {
        messageRefs.current[targetMsg.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [searchResultIndex, matchingMessageIndices, messages]);

  // Limpar URLs de pré-visualizações
  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
      if (videoPreviewLocalUrl) URL.revokeObjectURL(videoPreviewLocalUrl);
    };
  }, [filePreviewUrl, videoPreviewLocalUrl]);

  // Gestão de selecção de ficheiro
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      toast.error("O ficheiro excede o limite de 25 MB.");
      return;
    }

    setSelectedFile(file);

    if (file.type.startsWith("image/") || file.type.startsWith("video/") || file.type.startsWith("audio/")) {
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

  // ─── Gravação de Áudio ────────────────────────────────────────────────────────
  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      audioRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.start(200);
      setIsRecordingAudio(true);
      setAudioDuration(0);
      audioTimerRef.current = setInterval(() => setAudioDuration(d => d + 1), 1000);
    } catch (err: any) {
      toast.error("Não foi possível aceder ao microfone: " + (err.message || "Permissão negada"));
    }
  };

  const stopAudioRecording = (shouldSave: boolean = true) => {
    if (audioTimerRef.current) clearInterval(audioTimerRef.current);

    if (audioRecorderRef.current && isRecordingAudio) {
      audioRecorderRef.current.onstop = () => {
        audioStreamRef.current?.getTracks().forEach(t => t.stop());
        setIsRecordingAudio(false);

        if (shouldSave && audioChunksRef.current.length > 0) {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const file = new File([blob], `audio_gravacao_${Date.now()}.webm`, { type: 'audio/webm' });
          setSelectedFile(file);
          const previewUrl = URL.createObjectURL(blob);
          setFilePreviewUrl(previewUrl);
          toast.success("Áudio gravado! Clique em Enviar para disparar.");
        }
      };
      audioRecorderRef.current.stop();
    } else {
      audioStreamRef.current?.getTracks().forEach(t => t.stop());
      setIsRecordingAudio(false);
    }
  };

  // ─── Gravação de Vídeo (Modal) ────────────────────────────────────────────────
  const openVideoModal = async () => {
    setIsVideoModalOpen(true);
    setVideoPreviewBlob(null);
    setVideoPreviewLocalUrl(null);
    setIsRecordingVideo(false);
    setVideoDuration(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      });
      videoStreamRef.current = stream;
      setTimeout(() => {
        if (videoElementRef.current) {
          videoElementRef.current.srcObject = stream;
          videoElementRef.current.play().catch(() => {});
        }
      }, 100);
    } catch (err: any) {
      toast.error("Não foi possível aceder à câmara: " + (err.message || "Permissão negada"));
      setIsVideoModalOpen(false);
    }
  };

  const closeVideoModal = () => {
    if (videoTimerRef.current) clearInterval(videoTimerRef.current);
    if (videoRecorderRef.current && videoRecorderRef.current.state !== 'inactive') {
      videoRecorderRef.current.stop();
    }
    videoStreamRef.current?.getTracks().forEach(t => t.stop());
    setIsVideoModalOpen(false);
    setIsRecordingVideo(false);
    setVideoPreviewBlob(null);
    if (videoPreviewLocalUrl) {
      URL.revokeObjectURL(videoPreviewLocalUrl);
      setVideoPreviewLocalUrl(null);
    }
  };

  const startVideoRecording = () => {
    if (!videoStreamRef.current) return;
    try {
      const recorder = new MediaRecorder(videoStreamRef.current);
      videoRecorderRef.current = recorder;
      videoChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) videoChunksRef.current.push(e.data);
      };

      recorder.start(200);
      setIsRecordingVideo(true);
      setVideoDuration(0);
      videoTimerRef.current = setInterval(() => setVideoDuration(d => d + 1), 1000);
    } catch (err: any) {
      toast.error("Erro ao iniciar gravação de vídeo: " + err.message);
    }
  };

  const stopVideoRecording = () => {
    if (videoTimerRef.current) clearInterval(videoTimerRef.current);
    if (videoRecorderRef.current && isRecordingVideo) {
      videoRecorderRef.current.onstop = () => {
        setIsRecordingVideo(false);
        const blob = new Blob(videoChunksRef.current, { type: 'video/webm' });
        setVideoPreviewBlob(blob);
        const previewUrl = URL.createObjectURL(blob);
        setVideoPreviewLocalUrl(previewUrl);
      };
      videoRecorderRef.current.stop();
    }
  };

  const confirmVideoRecording = () => {
    if (!videoPreviewBlob) return;
    const file = new File([videoPreviewBlob], `video_gravacao_${Date.now()}.webm`, { type: 'video/webm' });
    setSelectedFile(file);
    if (videoPreviewLocalUrl) {
      setFilePreviewUrl(videoPreviewLocalUrl);
    }
    closeVideoModal();
    toast.success("Vídeo gravado com sucesso. Clique em Enviar para disparar.");
  };

  const retakeVideo = async () => {
    if (videoPreviewLocalUrl) {
      URL.revokeObjectURL(videoPreviewLocalUrl);
      setVideoPreviewLocalUrl(null);
    }
    setVideoPreviewBlob(null);
    setIsRecordingVideo(false);
    setVideoDuration(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      });
      videoStreamRef.current = stream;
      setTimeout(() => {
        if (videoElementRef.current) {
          videoElementRef.current.srcObject = stream;
          videoElementRef.current.play().catch(() => {});
        }
      }, 100);
    } catch (err: any) {
      toast.error("Erro ao reiniciar câmara: " + err.message);
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

    sock.on("booking_alert", (data: { phone: string }) => {
      setChats(prev => prev.map(c => c.id === data.phone ? { ...c, needs_confirm: true } : c));
    });

    sock.on("confirmation_alert", (data: { phone: string }) => {
      setChats(prev => prev.map(c => c.id === data.phone ? { ...c, needs_confirm: true } : c));
    });

    sock.on("message_status", (data: { phone: string; status: string }) => {
      setActiveChatId(activeId => {
        if (activeId === data.phone) {
          setMessages(prev => prev.map(msg => {
            if (msg.sender !== "user") {
              const currentStatus = msg.metadata?.status;
              if (data.status === "read") {
                return { ...msg, metadata: { ...msg.metadata, status: "read" } };
              } else if (data.status === "delivered" && currentStatus !== "read") {
                return { ...msg, metadata: { ...msg.metadata, status: "delivered" } };
              } else if (!currentStatus) {
                return { ...msg, metadata: { ...msg.metadata, status: data.status } };
              }
            }
            return msg;
          }));
        }
        return activeId;
      });
    });

    sock.on("new_message", (data: { phone: string; sender: string; text: string; time: string; timestamp: string; platform?: string; botName?: string; agentName?: string; metadata?: any; }) => {
      // Ignorar mensagens internas de erro — não são para mostrar ao operador nem ao cliente
      if (data.metadata?.internal_error) return;

      setChats(prev => {
        const exists = prev.find(c => c.id === data.phone);
        const hasConfirm = data.metadata?.confirm === true || data.metadata?.booking === true;
        const isHuman = data.sender === "human";


        // Previsualização no painel lateral: para ficheiros usa o fileName, caso contrário usa o texto
        const previewText = data.metadata?.fileName
          ? `📎 ${data.metadata.fileName}`
          : data.text;

        if (exists) {
          return prev.map(c => c.id === data.phone ? { 
            ...c, 
            lastMessage: previewText, 
            time: data.time, 
            unread: (c.unread || 0) + 1,
            needs_confirm: isHuman ? false : (hasConfirm || c.needs_confirm)
          } : c);
        }
        
        const nameDisplay = data.platform === 'instagram' ? `Instagram (@${data.phone})` : data.platform === 'facebook' ? `Messenger (${data.phone.slice(-6)})` : `WhatsApp (${data.phone})`;
        return [{ 
          id: data.phone, 
          phone: data.phone, 
          name: nameDisplay, 
          lastMessage: previewText, 
          time: data.time, 
          timestamp: data.timestamp, 
          platform: data.platform, 
          unread: 1,
          needs_confirm: isHuman ? false : hasConfirm
        }, ...prev];
      });

      setActiveChatId(activeId => {
        if (activeId === data.phone) {
          // Se este evento corresponde a uma mensagem que já adicionámos
          // optimisticamente (via clientMsgId), ignoramos para não duplicar.
          const incomingClientId: string | undefined = data.metadata?.clientMsgId;
          if (data.sender === "human" && incomingClientId && pendingClientIds.current.has(incomingClientId)) {
            pendingClientIds.current.delete(incomingClientId);
            // Atualizar a mensagem existente com a URL final do ficheiro (se vier em metadata)
            setMessages(prev => prev.map(msg =>
              msg.metadata?.clientMsgId === incomingClientId
                ? { ...msg, metadata: { ...msg.metadata, ...data.metadata, clientMsgId: undefined } }
                : msg
            ));
            return activeId;
          }

          // Suprimir também mensagens de legenda que não têm clientMsgId
          // mas são enviadas pelo próprio agente (para evitar duplicar quando há caption)
          if (data.sender === "human" && !incomingClientId) {
            // Legenda enviada separadamente pelo backend — verificar se já temos o ficheiro correspondente
            const captionKey = `${[...pendingClientIds.current].find(k => k.endsWith('_caption')) || ''}`.replace('_caption', '');
            if (captionKey) {
              pendingClientIds.current.delete(`${captionKey}_caption`);
              return activeId;
            }
          }

          setMessages(prev => {
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

    // Marcar chat a vermelho quando a IA falha (sem enviar mensagem ao cliente)
    sock.on("chat_error", (data: { phone: string; error?: string; platform?: string }) => {
      setErrorChatIds(prev => new Set(prev).add(data.phone));
      // Limpar o indicador de digitação se estava activo
      setTypingChatIds(prev => { const next = new Set(prev); next.delete(data.phone); return next; });
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
    setIsMessageSearchOpen(false);
    setMessageSearchQuery("");
    setSearchResultIndex(0);
    try {
      const res = await fetch(`/api/whatsapp/history/${chat.phone}`, { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      if (Array.isArray(data)) setMessages(data.filter((m: any) => !m.metadata?.internal_error));
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
    const clientMsgId = `cm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setMessage("");

    if (selectedFile) {
      setIsSendingFile(true);
      const fileToSend = selectedFile;
      const fileType = fileToSend.type;
      const fileName = fileToSend.name;
      const localPreviewUrl = filePreviewUrl;
      removeSelectedFile();

      const tempId = Date.now();
      // Registar o clientMsgId para o socket ignorar o eco deste envio (ficheiro + legenda)
      const captionClientId = text ? `${clientMsgId}_caption` : null;
      pendingClientIds.current.add(clientMsgId);
      if (captionClientId) pendingClientIds.current.add(captionClientId);

      setMessages(prev => [...prev, {
        id: tempId,
        sender: "human",
        text: "",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        timestamp: new Date().toISOString(),
        agentName,
        metadata: {
          agentName,
          mediaUrl: localPreviewUrl || "",
          fileName,
          mimeType: fileType,
          caption: text || undefined,
          isUploading: true,
          clientMsgId
        }
      }]);

      try {
        const formData = new FormData();
        formData.append("phone", activeChatId);
        formData.append("file", fileToSend);
        formData.append("clientMsgId", clientMsgId);
        if (text) formData.append("message", text);

        const res = await fetch("/api/whatsapp/send-file", {
          method: "POST",
          headers: { Authorization: `Bearer ${token()}` },
          body: formData,
        });

        const resData = await res.json();
        if (!res.ok) throw new Error(resData.error || "Falha ao enviar ficheiro");

        setMessages(prev => prev.map(m => m.id === tempId ? {
          ...m,
          metadata: {
            agentName,
            mediaUrl: resData.fileUrl,
            fileName: resData.fileName || fileName,
            mimeType: fileType,
            caption: text || undefined
          }
        } : m));

      } catch (err: any) {
        toast.error(err.message);
        pendingClientIds.current.delete(clientMsgId);
        if (captionClientId) pendingClientIds.current.delete(captionClientId);
        setMessages(prev => prev.filter(m => m.id !== tempId));
      } finally {
        setIsSendingFile(false);
      }
    } else {
      // Registar o clientMsgId para o socket ignorar o eco deste envio
      pendingClientIds.current.add(clientMsgId);

      const optimisticId = Date.now() + Math.random();
      setMessages(prev => [...prev, { 
        id: optimisticId, 
        sender: "human", 
        text, 
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        timestamp: new Date().toISOString(),
        agentName,
        metadata: { clientMsgId }
      }]);

      try {
        const res = await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
          body: JSON.stringify({ phone: activeChatId, message: text, clientMsgId }),
        });
        if (!res.ok) {
          pendingClientIds.current.delete(clientMsgId);
          throw new Error((await res.json()).error || "Falha ao enviar");
        }
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

  const parseLinks = (rawText: string) => {
    if (!rawText) return null;
    const tokens: { start: number; end: number; url: string; label: string }[] = [];
    const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;
    for (const m of [...rawText.matchAll(urlRegex)]) {
      if (m.index !== undefined) tokens.push({ start: m.index, end: m.index + m[0].length, url: m[0], label: m[0] });
    }
    if (tokens.length === 0) return <>{rawText}</>;
    const parts: React.ReactNode[] = [];
    let cur = 0;
    tokens.forEach((t, i) => {
      if (t.start > cur) parts.push(rawText.substring(cur, t.start));
      parts.push(<a key={i} href={t.url} target="_blank" rel="noopener noreferrer" className="underline text-emerald-600 dark:text-emerald-400 hover:opacity-80 break-all">{t.label}</a>);
      cur = t.end;
    });
    if (cur < rawText.length) parts.push(rawText.substring(cur));
    return <>{parts}</>;
  };

  const renderMessageContent = (text: string, metadata?: any) => {
    const hasMedia = !!metadata?.mediaUrl;
    const caption = metadata?.caption;
    const isUploading = metadata?.isUploading;

    // ── Imagem ──────────────────────────────────────────────────────────────────
    if (hasMedia && metadata.mimeType?.startsWith("image/")) {
      return (
        <div className="space-y-1">
          <a href={metadata.mediaUrl} target="_blank" rel="noopener noreferrer" className="block relative">
            <img
              src={metadata.mediaUrl}
              alt={metadata.fileName || "Imagem"}
              className="rounded-xl max-h-56 w-auto object-cover"
              style={{ maxWidth: 240 }}
            />
            {isUploading && (
              <div className="absolute inset-0 rounded-xl bg-black/40 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-white" />
              </div>
            )}
          </a>
          {caption && <p className="text-[13px] whitespace-pre-wrap break-words mt-0.5 leading-snug">{parseLinks(caption)}</p>}
        </div>
      );
    }

    // ── Vídeo ───────────────────────────────────────────────────────────────────
    if (hasMedia && metadata.mimeType?.startsWith("video/")) {
      return (
        <div className="space-y-1">
          <video controls src={metadata.mediaUrl} className="rounded-xl w-full" style={{ maxHeight: 220, maxWidth: 280 }} />
          {caption && <p className="text-[13px] whitespace-pre-wrap break-words mt-0.5 leading-snug">{parseLinks(caption)}</p>}
        </div>
      );
    }

    // ── Áudio ───────────────────────────────────────────────────────────────────
    if (hasMedia && metadata.mimeType?.startsWith("audio/")) {
      return (
        <div className="flex items-center gap-2 py-0.5">
          <Volume2 className="w-4 h-4 shrink-0 opacity-60" />
          <audio controls src={metadata.mediaUrl} className="h-8 flex-1" style={{ maxWidth: 220 }} />
          {isUploading && <Loader2 className="w-4 h-4 animate-spin shrink-0 opacity-60" />}
        </div>
      );
    }

    // ── Documento ────────────────────────────────────────────────────────────────
    if (hasMedia) {
      const ext = (metadata.fileName || "").split('.').pop()?.toUpperCase() || "DOC";
      const isPdf = metadata.fileName?.toLowerCase().endsWith(".pdf");
      const isXls = metadata.fileName?.toLowerCase().match(/\.(xls|xlsx)$/);
      const iconColor = isPdf ? "text-red-500" : isXls ? "text-emerald-600" : "text-blue-500";
      return (
        <div className="space-y-1">
          <a
            href={isUploading ? undefined : metadata.mediaUrl}
            download={!isUploading}
            target={isUploading ? undefined : "_blank"}
            rel="noopener noreferrer"
            className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-opacity ${isUploading ? "pointer-events-none opacity-70" : "hover:opacity-80"}`}
            style={{ background: "rgba(0,0,0,0.06)", maxWidth: 260 }}
          >
            <div className={`shrink-0 ${iconColor}`}>
              {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold truncate leading-tight">{metadata.fileName || "Documento"}</p>
              <p className="text-[10px] opacity-50 font-mono mt-0.5">{ext}</p>
            </div>
          </a>
          {caption && <p className="text-[13px] whitespace-pre-wrap break-words mt-0.5 leading-snug">{parseLinks(caption)}</p>}
        </div>
      );
    }

    // ── Texto puro (sem media) ─────────────────────────────────────────────────
    // Ocultar texto que é apenas markdown de ficheiro legado: [Ficheiro: ...](url)
    const isLegacyFilePlaceholder = /^\[Ficheiro:[^\]]+\]\(https?:\/\/[^)]+\)(\n\n[\s\S]*)?$/.test(text?.trim() || "");
    if (isLegacyFilePlaceholder) return null;

    if (!text) return null;
    return <p className="text-[13px] whitespace-pre-wrap leading-relaxed break-words">{parseLinks(text)}</p>;
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Lista de Conversas */}
      <Card className={`w-full lg:w-80 flex flex-col shrink-0 ${!showMobileList ? "hidden lg:flex" : "flex"}`}>
        <CardHeader className="p-4 border-b border-zinc-100 space-y-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Conversas</CardTitle>
            <div className="flex items-center gap-2">
              {/* Botão Nova Conversa */}
              <button
                onClick={() => { setIsNewChatOpen(true); setNewChatError(""); setNewChatNumber(""); }}
                title="Iniciar nova conversa"
                className="w-7 h-7 flex items-center justify-center rounded-full bg-emerald-500 hover:bg-emerald-600 text-white transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
              </button>
              <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${
                isConnected ? "bg-emerald-50 text-emerald-600" : "bg-zinc-100 text-zinc-400"
              }`}>
                {isConnected ? <><Wifi className="w-3 h-3" />Tempo real</> : <><WifiOff className="w-3 h-3" />Offline</>}
              </span>
            </div>
          </div>
          {/* Caixa de Pesquisa de Conversas / Números */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-400" />
            <Input 
              value={chatSearchQuery} 
              onChange={e => setChatSearchQuery(e.target.value)} 
              placeholder="Pesquisar por número ou nome..." 
              className="pl-9 pr-8 h-9 text-xs bg-zinc-50 border-zinc-200" 
            />
            {chatSearchQuery && (
              <button onClick={() => setChatSearchQuery("")} className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-emerald-600" /></div>
          ) : filteredChats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <MessageCircle className="w-12 h-12 mb-3 opacity-10" />
              <p className="text-sm text-zinc-400">
                {chatSearchQuery ? `Nenhuma conversa encontrada para "${chatSearchQuery}"` : "Aguardando mensagens..."}
              </p>
            </div>
          ) : filteredChats.map(chat => {
            const previewDate = formatChatPreviewDate(chat.timestamp, chat.time);
            const isToday = chat.timestamp && new Date(chat.timestamp).toDateString() === new Date().toDateString();
            return (
              <div
                key={chat.id}
                onClick={() => { selectChat(chat); setErrorChatIds(prev => { const next = new Set(prev); next.delete(chat.phone); return next; }); }}
                className={`p-4 border-b border-zinc-50 cursor-pointer transition-colors relative ${
                  errorChatIds.has(chat.phone)
                    ? (activeChatId === chat.phone ? "bg-red-50 border-l-2 border-l-red-500" : "bg-red-50/70 hover:bg-red-50 border-l-2 border-l-red-400")
                    : activeChatId === chat.phone
                      ? (chat.needs_confirm ? "bg-orange-50 border-l-2 border-l-orange-500" : "bg-emerald-50 border-l-2 border-l-emerald-500")
                      : (chat.needs_confirm ? "bg-orange-50/70 hover:bg-orange-50 border-l-2 border-l-orange-400" : "hover:bg-zinc-50")
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Smartphone className={`w-3 h-3 shrink-0 ${
                      errorChatIds.has(chat.phone) ? "text-red-500" : chat.needs_confirm ? "text-orange-500" : "text-emerald-500"
                    }`} />
                    <h3 className="font-medium text-sm text-zinc-900 truncate max-w-[120px]">{chat.name}</h3>
                    {errorChatIds.has(chat.phone) && (
                      <span title="Erro ao processar — intervenção humana necessária" className="ml-0.5 text-red-500">
                        <AlertCircle className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-1">
                    <span className={`text-[10px] font-medium ${
                      errorChatIds.has(chat.phone) ? 'text-red-600' : isToday ? (chat.needs_confirm ? 'text-orange-600' : 'text-zinc-400') : (chat.needs_confirm ? 'text-orange-700' : 'text-emerald-600')
                    }`}>{previewDate}</span>
                    {(chat.unread || 0) > 0 && <span className={`w-5 h-5 text-white text-[10px] rounded-full flex items-center justify-center font-bold ${
                      errorChatIds.has(chat.phone) ? "bg-red-500" : chat.needs_confirm ? "bg-orange-500" : "bg-emerald-500"
                    }`}>{chat.unread}</span>}
                  </div>
                </div>
                <p className={`text-xs truncate ${
                  errorChatIds.has(chat.phone) ? "text-red-600/80 font-medium" : chat.needs_confirm ? "text-orange-700/80 font-medium" : "text-zinc-400"
                }`}>
                  {errorChatIds.has(chat.phone) ? "⚠️ Erro ao processar — intervenção necessária" : chat.lastMessage}
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Janela Ativa do Chat */}
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
            <div className="flex items-center gap-2">
              {/* Botão para ativar pesquisa na conversa */}
              <button 
                onClick={() => {
                  setIsMessageSearchOpen(!isMessageSearchOpen);
                  if (isMessageSearchOpen) setMessageSearchQuery("");
                }} 
                className={`p-2 rounded-full border text-xs font-medium shrink-0 transition-all ${isMessageSearchOpen ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "hover:bg-zinc-100 border-zinc-200 text-zinc-600"}`}
                title="Pesquisar mensagens nesta conversa"
              >
                <Search className="w-4 h-4" />
              </button>

              <button onClick={toggleAi} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium shrink-0 transition-all ${isAiActive ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                {isAiActive ? <><Play className="w-3 h-3" />IA Activa</> : <><Pause className="w-3 h-3" />IA Pausada</>}
              </button>
            </div>
          </CardHeader>

          {/* Barra de Pesquisa de Mensagens na Conversa */}
          {isMessageSearchOpen && (
            <div className="px-4 py-2 bg-emerald-50/60 border-b border-emerald-100 flex items-center gap-2 animate-in slide-in-from-top-2 duration-200 shrink-0">
              <Search className="w-4 h-4 text-emerald-600 shrink-0" />
              <Input 
                value={messageSearchQuery} 
                onChange={e => { setMessageSearchQuery(e.target.value); setSearchResultIndex(0); }} 
                placeholder="Pesquisar mensagens nesta conversa..." 
                className="h-8 text-xs bg-white border-emerald-200 focus-visible:ring-emerald-500 flex-1" 
                autoFocus
              />
              {messageSearchQuery && (
                <span className="text-xs font-semibold text-emerald-800 shrink-0 min-w-[70px] text-center">
                  {matchingMessageIndices.length > 0 ? `${searchResultIndex + 1} de ${matchingMessageIndices.length}` : "0 resultados"}
                </span>
              )}
              <button 
                disabled={matchingMessageIndices.length === 0} 
                onClick={() => setSearchResultIndex(prev => (prev > 0 ? prev - 1 : matchingMessageIndices.length - 1))} 
                className="p-1.5 rounded hover:bg-emerald-100 text-emerald-700 disabled:opacity-30 transition-colors"
                title="Mensagem anterior"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button 
                disabled={matchingMessageIndices.length === 0} 
                onClick={() => setSearchResultIndex(prev => (prev < matchingMessageIndices.length - 1 ? prev + 1 : 0))} 
                className="p-1.5 rounded hover:bg-emerald-100 text-emerald-700 disabled:opacity-30 transition-colors"
                title="Próxima mensagem"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              <button 
                onClick={() => { setIsMessageSearchOpen(false); setMessageSearchQuery(""); }} 
                className="p-1.5 hover:bg-emerald-100 rounded text-emerald-700 transition-colors"
                title="Fechar pesquisa"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

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

              const isSearchTarget = matchingMessageIndices.length > 0 && matchingMessageIndices[searchResultIndex] === i;

              return (
                <div key={`${msg.id}-${i}`} ref={el => { messageRefs.current[msg.id] = el; }} className="space-y-4">
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
                    <div className={`max-w-[72%] rounded-2xl px-4 py-2.5 text-sm shadow-sm transition-all ${isSearchTarget ? "ring-2 ring-amber-400 ring-offset-2 scale-[1.01]" : ""} ${msg.sender === "user" ? "bg-white border border-zinc-100 text-zinc-900 rounded-tl-sm" : msg.sender === "bot" ? "bg-emerald-50 border border-emerald-100 text-emerald-900 rounded-tr-sm" : "bg-zinc-800 text-white rounded-tr-sm"}`}>
                      <div className="flex items-center gap-1.5 mb-1 opacity-60">
                        {msg.sender === "user" ? <User className="w-3 h-3" /> : (msg.sender === "bot" ? <Bot className="w-3 h-3" /> : <User className="w-3 h-3" />)}
                        <span className="text-[10px] font-semibold uppercase tracking-wider">
                          {msg.sender === "user" ? "Cliente" : msg.sender === "bot" ? (msg.botName || "IA") : (msg.agentName || "Você")}
                        </span>
                      </div>
                      {renderMessageContent(msg.text, msg.metadata)}
                      <div className="flex items-center justify-end gap-1 mt-1 opacity-70">
                        <span className="text-[10px]">{msg.time}</span>
                        {msg.sender !== "user" && (
                          <span title={msg.metadata?.status === "read" ? "Lida / Visualizada" : msg.metadata?.status === "delivered" ? "Entregue" : "Enviada"}>
                            {msg.metadata?.status === "read" ? (
                              <CheckCheck className="w-3.5 h-3.5 text-sky-400 font-bold" />
                            ) : msg.metadata?.status === "delivered" ? (
                              <CheckCheck className="w-3.5 h-3.5 opacity-80" />
                            ) : (
                              <Check className="w-3.5 h-3.5 opacity-80" />
                            )}
                          </span>
                        )}
                      </div>
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

          {/* Barra de Envio e Anexos */}
          <div className="p-4 border-t border-zinc-100 bg-white shrink-0">
            {/* Pré-visualização do Ficheiro Selecionado / Gravado */}
            {selectedFile && (
              <div className="mb-3 p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl flex items-center justify-between gap-3 animate-in slide-in-from-bottom-2 duration-200">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {selectedFile.type.startsWith("image/") && filePreviewUrl ? (
                    <div className="w-12 h-12 rounded-lg overflow-hidden border border-zinc-200 bg-white shrink-0">
                      <img src={filePreviewUrl} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                  ) : selectedFile.type.startsWith("video/") && filePreviewUrl ? (
                    <div className="w-16 h-12 rounded-lg overflow-hidden border border-zinc-200 bg-black shrink-0 relative">
                      <video src={filePreviewUrl} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Video className="w-4 h-4 text-white" />
                      </div>
                    </div>
                  ) : selectedFile.type.startsWith("audio/") ? (
                    <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg shrink-0 border border-emerald-100">
                      <Volume2 className="w-5 h-5" />
                    </div>
                  ) : (
                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg shrink-0 border border-blue-100">
                      <FileText className="w-5 h-5" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-zinc-800 truncate">{selectedFile.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-zinc-400 font-mono">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</span>
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-zinc-200/70 text-zinc-600 font-bold">
                        {selectedFile.name.split('.').pop() || "FICHEIRO"}
                      </span>
                    </div>
                  </div>
                </div>

                {selectedFile.type.startsWith("audio/") && filePreviewUrl && (
                  <audio controls src={filePreviewUrl} className="h-8 max-w-[180px] hidden sm:block" />
                )}

                <button onClick={removeSelectedFile} title="Remover anexo" className="p-1.5 hover:bg-zinc-200 rounded-full text-zinc-500 shrink-0 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Interface Ativa de Gravação de Áudio */}
            {isRecordingAudio ? (
              <div className="flex items-center gap-3 p-2 bg-red-50 border border-red-200 rounded-xl animate-in fade-in duration-200">
                <div className="flex items-center gap-2 flex-1 px-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                  </span>
                  <span className="text-xs font-bold text-red-700">Gravação de Áudio:</span>
                  <span className="text-xs font-mono font-semibold text-red-600">{formatTimer(audioDuration)}</span>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => stopAudioRecording(false)} className="text-zinc-600 border-zinc-200 hover:bg-zinc-100 gap-1 text-xs">
                  <X className="w-3.5 h-3.5" /> Cancelar
                </Button>
                <Button type="button" size="sm" onClick={() => stopAudioRecording(true)} className="bg-red-600 hover:bg-red-700 text-white gap-1 text-xs font-bold">
                  <Check className="w-3.5 h-3.5" /> Concluir Áudio
                </Button>
              </div>
            ) : (
              /* Interface Normal de Entrada de Texto e Ações */
              <div className="flex gap-2 items-center">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  className="hidden" 
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" 
                />
                
                {/* Botão Anexo */}
                <Button 
                  type="button" 
                  onClick={() => fileInputRef.current?.click()} 
                  variant="outline" 
                  title="Anexar documento, imagem ou vídeo"
                  className="shrink-0 p-2.5 h-10 w-10 border border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950 transition-colors rounded-lg"
                >
                  <Paperclip className="w-5 h-5" />
                </Button>

                {/* Botão Gravador de Voz (Microfone) */}
                <Button 
                  type="button" 
                  onClick={startAudioRecording} 
                  variant="outline" 
                  title="Gravar áudio com o microfone"
                  className="shrink-0 p-2.5 h-10 w-10 border border-zinc-200 text-zinc-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors rounded-lg"
                >
                  <Mic className="w-5 h-5" />
                </Button>

                {/* Botão Gravador de Vídeo (Webcam) */}
                <Button 
                  type="button" 
                  onClick={openVideoModal} 
                  variant="outline" 
                  title="Gravar vídeo com a câmara"
                  className="shrink-0 p-2.5 h-10 w-10 border border-zinc-200 text-zinc-600 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition-colors rounded-lg"
                >
                  <Camera className="w-5 h-5" />
                </Button>

                <Input 
                  value={message} 
                  onChange={e => setMessage(e.target.value)} 
                  onKeyDown={e => e.key === "Enter" && handleSend()} 
                  placeholder={selectedFile ? "Adicione uma legenda ao ficheiro..." : "Escreva como agente humano..."} 
                  className="flex-1" 
                />

                <Button onClick={handleSend} disabled={!message.trim() && !selectedFile} className="shrink-0 bg-emerald-600 hover:bg-emerald-700 gap-2">
                  {isSendingFile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Enviar
                </Button>
              </div>
            )}

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

      {/* Modal de Gravação de Vídeo (Webcam) */}
      {isVideoModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-lg bg-zinc-900 border-zinc-800 text-white overflow-hidden shadow-2xl">
            <CardHeader className="p-4 border-b border-zinc-800 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2 text-white">
                <Video className="w-5 h-5 text-emerald-400" />
                Gravar Vídeo com a Câmara
              </CardTitle>
              <button onClick={closeVideoModal} className="p-1 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </CardHeader>

            <CardContent className="p-4 space-y-4">
              <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-zinc-800 flex items-center justify-center">
                {videoPreviewLocalUrl ? (
                  <video src={videoPreviewLocalUrl} controls autoPlay className="w-full h-full object-cover" />
                ) : (
                  <video ref={videoElementRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                )}

                {isRecordingVideo && (
                  <div className="absolute top-3 left-3 bg-red-600/90 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-mono font-bold flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-white animate-ping"></span>
                    {formatTimer(videoDuration)}
                  </div>
                )}
              </div>

              {/* Controlos do Modal de Vídeo */}
              <div className="flex items-center justify-center gap-3 pt-2">
                {videoPreviewLocalUrl ? (
                  <>
                    <Button type="button" variant="outline" onClick={retakeVideo} className="border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 gap-2">
                      <RefreshCw className="w-4 h-4" /> Refazer Vídeo
                    </Button>
                    <Button type="button" onClick={confirmVideoRecording} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-bold">
                      <Check className="w-4 h-4" /> Usar Este Vídeo
                    </Button>
                  </>
                ) : isRecordingVideo ? (
                  <Button type="button" onClick={stopVideoRecording} className="bg-red-600 hover:bg-red-700 text-white gap-2 px-6 font-bold">
                    <Square className="w-4 h-4 fill-white" /> Parar Gravação
                  </Button>
                ) : (
                  <Button type="button" onClick={startVideoRecording} className="bg-red-600 hover:bg-red-700 text-white gap-2 px-6 font-bold">
                    <Camera className="w-4 h-4" /> Iniciar Gravação
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Modal: Nova Conversa ──────────────────────────────────────────────── */}
      {isNewChatOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setIsNewChatOpen(false); }}
        >
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center">
                  <Phone className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Nova Conversa</h2>
                  <p className="text-[11px] text-zinc-400">Insira o número com indicativo</p>
                </div>
              </div>
              <button
                onClick={() => setIsNewChatOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Seletor de indicativo + número */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">País / Indicativo</label>
              <select
                value={newChatDialCode}
                onChange={e => setNewChatDialCode(e.target.value)}
                className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm px-3 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {DIAL_CODES.map(c => (
                  <option key={c.code + c.name} value={c.code}>
                    {c.flag} {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Número de Telefone</label>
              <div className="flex items-center gap-2">
                <span className="shrink-0 h-10 px-3 flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-sm font-mono font-semibold select-none">
                  {newChatDialCode}
                </span>
                <Input
                  type="tel"
                  placeholder="912 345 678"
                  value={newChatNumber}
                  onChange={e => { setNewChatNumber(e.target.value); setNewChatError(""); }}
                  onKeyDown={e => { if (e.key === "Enter") handleStartNewChat(); }}
                  className="flex-1 h-10 text-sm font-mono"
                  autoFocus
                />
              </div>
              {newChatError && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />{newChatError}
                </p>
              )}
            </div>

            {/* Preview do número completo */}
            {newChatNumber.replace(/\D/g, "").length >= 6 && (
              <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 px-3 py-2 flex items-center gap-2">
                <Smartphone className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="text-xs text-zinc-500">Número completo:</span>
                <span className="text-xs font-mono font-semibold text-zinc-800 dark:text-zinc-100">
                  {newChatDialCode}{newChatNumber.replace(/\D/g, "")}
                </span>
              </div>
            )}

            {/* Acções */}
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-10"
                onClick={() => setIsNewChatOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="flex-1 h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-2"
                onClick={handleStartNewChat}
                disabled={isStartingChat}
              >
                {isStartingChat ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <MessageCircle className="w-4 h-4" />
                )}
                Iniciar Chat
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

