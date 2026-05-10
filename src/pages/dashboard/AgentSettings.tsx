import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Bot, Upload, Loader2, MessageSquare } from "lucide-react";

const agentSchema = z.object({
  name: z.string().min(2, "O nome do agente deve ter pelo menos 2 caracteres."),
  prompt: z.string().min(10, "O prompt deve ter pelo menos 10 caracteres."),
  model: z.string(),
  temperature: z.number().min(0).max(1),
  tone: z.enum(['friendly', 'professional', 'extremely_professional']),
});

type AgentFormValues = z.infer<typeof agentSchema>;

export default function AgentSettings() {
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<AgentFormValues>({
    resolver: zodResolver(agentSchema),
    defaultValues: {
      name: "Assistente Virtual",
      prompt: "Você é um assistente corporativo de inteligência artificial. Seja educado, humano e ajude os clientes respondendo dúvidas de forma prática e objetiva baseando-se no contexto da empresa.",
      model: "gemini-2.0-flash",
      temperature: 0.3,
      tone: "professional",
    },
  });

  const temperatureValue = watch("temperature");

  useEffect(() => {
    const saved = localStorage.getItem('agent_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.name) setValue("name", parsed.name);
      if (parsed.prompt) setValue("prompt", parsed.prompt);
      if (parsed.model) setValue("model", parsed.model);
      if (parsed.temperature !== undefined) setValue("temperature", parsed.temperature);
    }
  }, [setValue]);

  const onSubmit = async (data: AgentFormValues) => {
    setIsSaving(true);
    try {
      // Simulating API call: PATCH /agents/{agent_id}
      await new Promise(resolve => setTimeout(resolve, 800));
      localStorage.setItem('agent_settings', JSON.stringify(data));
      toast.success("Configurações do agente salvas com sucesso!");
    } catch (error) {
      toast.error("Erro ao salvar configurações.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestChat = async () => {
    setIsTesting(true);
    try {
      // Simulating API call: POST /ai/test-chat
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.info("Modal de teste de chat aberto! (Simulação)");
    } catch (error) {
      toast.error("Erro ao iniciar teste de chat.");
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Configuração do Agente</h2>
        <p className="text-zinc-500">Ajuste o comportamento e a personalidade da sua Inteligência Artificial.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Bot className="w-5 h-5" /> Identificação e Personalidade</CardTitle>
            <CardDescription>Defina o nome e as instruções base que guiarão todas as respostas do bot.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Nome do Agente</label>
              <input
                {...register("name")}
                className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
                placeholder="Ex: Assistente de Suporte Avançado"
              />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">System Prompt</label>
              <textarea
                {...register("prompt")}
                className="w-full h-40 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 resize-none"
                placeholder="Descreva como o bot deve agir..."
              />
              {errors.prompt && <p className="text-xs text-red-500">{errors.prompt.message}</p>}
            </div>
            <div className="space-y-4">
              <label className="text-sm font-medium text-zinc-700">Tom de Voz da IA</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { id: 'friendly', name: 'Amigável', desc: 'Muita compreensão e empatia.' },
                  { id: 'professional', name: 'Profissional', desc: 'Direto, culto e objetivo.' },
                  { id: 'extremely_professional', name: 'Extremamente Profissional', desc: 'Foco total em eficiência, empatia reduzida.' }
                ].map((tone) => (
                  <label 
                    key={tone.id}
                    className={`cursor-pointer border rounded-xl p-4 transition-all ${
                      watch("tone") === tone.id 
                        ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500' 
                        : 'border-zinc-200 bg-white hover:border-zinc-300'
                    }`}
                  >
                    <input 
                      type="radio" 
                      value={tone.id} 
                      {...register("tone")} 
                      className="hidden" 
                    />
                    <p className={`font-bold text-sm ${watch("tone") === tone.id ? 'text-emerald-700' : 'text-zinc-900'}`}>
                      {tone.name}
                    </p>
                    <p className="text-[10px] text-zinc-500 mt-1 leading-tight">{tone.desc}</p>
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Modelo de IA</CardTitle>
              <CardDescription>Selecione o motor de processamento.</CardDescription>
            </CardHeader>
            <CardContent>
              <select
                {...register("model")}
                className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
              >
                <option value="gemini-2.0-flash">Gemini 2.0 Flash (Rápido e Eficiente)</option>
                <option value="gemini-1.5-pro">Gemini 1.5 Pro (Complexo e Preciso)</option>
              </select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Criatividade (Temperature): {temperatureValue}</CardTitle>
              <CardDescription>0 = Focado/Preciso, 1 = Criativo/Aleatório.</CardDescription>
            </CardHeader>
            <CardContent>
              <input
                type="range"
                min="0" max="1" step="0.1"
                {...register("temperature", { valueAsNumber: true })}
                className="w-full accent-zinc-900"
              />
              <div className="flex justify-between text-xs text-zinc-500 mt-2">
                <span>Preciso</span>
                <span>Criativo</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={handleTestChat} disabled={isTesting}>
            {isTesting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MessageSquare className="w-4 h-4 mr-2" />}
            Testar Chat
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Salvar Configurações
          </Button>
        </div>
      </form>
    </div>
  );
}
