import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Send, User, Bot, RefreshCw, Zap } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";

type Message = {
  id: number;
  sender: "user" | "bot";
  text: string;
  time: string;
};

export default function Simulation() {
  const [message, setMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<Message[]>([]);

  const [botName, setBotName] = useState("Orion Bot");

  useEffect(() => {
    const fetchBotName = async () => {
      try {
        const token = localStorage.getItem("token");

        // 1. Buscamos primeiro as configurações gerais (AI Name)
        const response = await fetch("/api/settings/org", {
            headers: { "Authorization": `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            const name = data.chatbot_name || "Orion Bot";
            setBotName(name);
            setMessages([{ 
                id: 1, 
                sender: "bot", 
                text: `Olá! Sou o **${name}**, o assistente virtual inteligente da **${data.name || 'nossa empresa'}**. Como posso te ajudar hoje?`, 
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
            }]);
            return;
        }

        // 2. Fallback para WhatsApp Config
        const waResponse = await fetch("/api/whatsapp/config", {
          headers: { "Authorization": `Bearer ${token}` }
        });

        if (waResponse.ok) {
          const waData = await waResponse.json();
          if (waData && waData.display_name) {
            setBotName(waData.display_name);
            setMessages([{ id: 1, sender: "bot", text: `Olá! Sou o ${waData.display_name}. Como posso te ajudar hoje?`, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
            return;
          }
        }

        setMessages([{ id: 1, sender: "bot", text: `Olá! Sou o assistente virtual da Orion. Como posso te ajudar hoje?`, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
      } catch (err) {
        console.error("Erro ao carregar dados do bot:", err);
      }
    };

    fetchBotName();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!message.trim()) return;

    const userMsg = message;
    setMessage("");

    const newUserMessage: Message = {
      id: Date.now(),
      sender: "user",
      text: userMsg,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    setIsTyping(true);

    try {
      const response = await fetch("/api/agent/simulate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ message: userMsg, history: messages, botName: botName })
      });

      const data = await response.json();

      if (!response.ok) {
        // Build a detailed error message from all available fields
        const errorMsg = data.details
          ? `${data.error} \n\nDetalhes técnicos: ${data.details}${data.code ? ` [${data.code}]` : ''}`
          : (data.error || "Erro desconhecido ao comunicar com a IA");
        throw new Error(errorMsg);
      }

      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: "bot",
        text: data.reply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);

      if (data.automation_triggered) {
        toast.success(`Automação disparada: ${data.automation_triggered}`, {
            icon: <Zap className="w-4 h-4 text-amber-500" />
        });
      }

      if (data.transfer) {
        toast.info("A IA solicitou transferência para um atendente humano.");
      }
    } catch (error: any) {
      console.error("Simulation error:", error);
      toast.error(`Erro: ${error.message}`);
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: "bot",
        text: `Desculpe, ocorreu um erro: ${error.message}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleReset = () => {
    setMessages([
      { id: 1, sender: "bot", text: `Olá! Sou o ${botName}. Como posso te ajudar hoje?`, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
    ]);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Simulação do Agente</h2>
          <p className="text-zinc-500">Teste como o seu bot responderá aos clientes no WhatsApp.</p>
        </div>
        <Button variant="outline" onClick={handleReset} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Reiniciar Conversa
        </Button>
      </div>

      <Card className="flex flex-col h-[600px] border-zinc-200 shadow-sm">
        <CardHeader className="bg-emerald-600 text-white rounded-t-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg">{botName}</CardTitle>
              <CardDescription className="text-emerald-100">Online</CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#efeae2]">
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-lg px-3 py-2 shadow-sm relative ${msg.sender === 'user'
                ? 'bg-[#d9fdd3] text-zinc-900 rounded-tr-none'
                : 'bg-white text-zinc-900 rounded-tl-none'
                }`}>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                <div className="text-[10px] text-right mt-1 opacity-60 flex justify-end items-center gap-1">
                  {msg.time}
                </div>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-white rounded-lg rounded-tl-none px-4 py-3 shadow-sm flex gap-1 items-center">
                <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </CardContent>

        <div className="p-3 bg-[#f0f2f5] border-t border-zinc-200 rounded-b-xl">
          <div className="flex gap-2 items-center bg-white rounded-full px-4 py-2 shadow-sm">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Digite uma mensagem..."
              className="flex-1 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-0 shadow-none h-10"
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              disabled={isTyping}
            />
            <Button
              onClick={handleSend}
              size="icon"
              className="shrink-0 rounded-full w-10 h-10 bg-emerald-600 hover:bg-emerald-700"
              disabled={isTyping || !message.trim()}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
