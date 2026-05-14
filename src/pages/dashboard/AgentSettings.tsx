import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import {
  Bot, Save, Loader2, Sparkles, MessageSquare, Zap, Users,
  UploadCloud, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';

export default function AgentSettings() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving,  setIsSaving]  = useState(false);

  const [settings, setSettings] = useState({
    chatbot_name:        '',
    product_description: '',
    emoji_mode:          'moderate',
    handover_mode:       'hybrid',
    ai_tone:             'friendly',
    social_object:       '',
  });

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch('/api/settings/org', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        setSettings(prev => ({
          ...prev,
          chatbot_name:        d.chatbot_name        || '',
          product_description: d.product_description || '',
          emoji_mode:          d.emoji_mode          || 'moderate',
          handover_mode:       d.handover_mode       || 'hybrid',
          ai_tone:             d.ai_tone             || 'friendly',
          social_object:       d.social_object       || '',
        }));
      })
      .catch(() => toast.error('Erro ao carregar configurações.'))
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/settings/org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error('Erro ao guardar');
      toast.success('Configurações do agente guardadas com sucesso!');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const set = (key: string, val: string) => setSettings(prev => ({ ...prev, [key]: val }));

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const emojiOptions = [
    { id: 'none',     icon: '🚫', label: 'Sem emojis',         desc: 'Puramente textual. Ideal para contextos formais e corporativos.' },
    { id: 'moderate', icon: '😊', label: 'Uso moderado',        desc: 'Máximo 1 emoji por mensagem, só quando realmente natural.' },
    { id: 'adaptive', icon: '🎯', label: 'Adaptativo ao cliente', desc: 'Espelha o estilo do cliente. Só usa emojis se o cliente usar.' },
  ];

  const handoverOptions = [
    { id: 'auto',     icon: '🤖', label: '100% Automático',     desc: 'A IA responde sempre, mesmo quando um humano está a falar.' },
    { id: 'hybrid',   icon: '🤝', label: 'Modo Híbrido',        desc: 'IA pausa 5 min se você responder. Se cliente voltar a falar e você não responder, a IA retoma.' },
    { id: 'transfer', icon: '📞', label: 'Apenas até transferência', desc: 'A IA responde até o momento em que o cliente pede um humano.' },
  ];

  const toneOptions = [
    { id: 'friendly',      icon: '😄', label: 'Amigável',          desc: 'Tom descontraído, próximo e caloroso. Ótimo para retalho e e-commerce.' },
    { id: 'professional',  icon: '💼', label: 'Profissional',       desc: 'Tom formal mas acessível. Ideal para serviços e B2B.' },
    { id: 'ultra_formal',  icon: '🎩', label: 'Ultra-formal',       desc: 'Tom muito rigoroso e corporativo. Para banca, advocacia, finanças.' },
  ];

  const OptionGrid = ({ options, value, onChange }: { options: any[], value: string, onChange: (v: string) => void }) => (
    <div className="grid grid-cols-1 gap-2">
      {options.map(opt => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
            value === opt.id
              ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
              : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
          }`}
        >
          <div className={`w-4 h-4 mt-0.5 rounded-full border-2 flex-shrink-0 transition-all ${
            value === opt.id ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-300'
          }`} />
          <div>
            <p className={`text-sm font-medium ${value === opt.id ? 'text-emerald-800' : 'text-zinc-800'}`}>
              {opt.icon} {opt.label}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">{opt.desc}</p>
          </div>
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Configuração do Agente IA</h2>
          <p className="text-zinc-500 text-sm mt-1">
            Defina a personalidade, tom e comportamento do seu assistente virtual.
          </p>
        </div>
        <Button onClick={handleSave} disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-700 h-10 px-6 gap-2">
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar
        </Button>
      </div>

      {/* Modelo Badge */}
      <div className="flex items-center gap-2 bg-gradient-to-r from-violet-50 to-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
        <Sparkles className="w-4 h-4 text-violet-500" />
        <span className="text-sm font-medium text-zinc-700">Motor IA:</span>
        <span className="text-sm font-bold text-emerald-700">Gemini 2.5 Flash</span>
        <span className="text-xs text-zinc-400">com raciocínio activado</span>
        <span className="ml-auto text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Memória: 50 mensagens</span>
      </div>

      {/* Identidade do Bot */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Bot className="w-4 h-4" /> Identidade do Bot</CardTitle>
          <CardDescription>Como o seu assistente se apresenta aos clientes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome do Bot</Label>
              <Input
                value={settings.chatbot_name}
                onChange={e => set('chatbot_name', e.target.value)}
                placeholder="Ex: Sofia, Orion, Max..."
              />
              <p className="text-xs text-zinc-400">Este nome é usado pelo bot ao apresentar-se.</p>
            </div>
            <div className="space-y-2">
              <Label>Ramo de Actividade</Label>
              <Input
                value={settings.social_object}
                onChange={e => set('social_object', e.target.value)}
                placeholder="Ex: Tecnologia, Retalho, Saúde..."
              />
              <p className="text-xs text-zinc-400">Ajuda a IA a contextualizar respostas.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Base de Conhecimento Rápida */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="w-4 h-4" /> Base de Conhecimento</CardTitle>
          <CardDescription>Descreva os seus produtos, serviços, preços e políticas. A IA usa esta informação para responder.</CardDescription>
        </CardHeader>
        <CardContent>
          <textarea
            rows={8}
            className="flex w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 resize-y"
            value={settings.product_description}
            onChange={e => set('product_description', e.target.value)}
            placeholder={`Exemplos:
• Horário de funcionamento: Segunda a Sexta, 8h-18h
• Entrega disponível em Luanda e Benguela, prazo 2-3 dias úteis
• Produto principal: Smartphones novos e recondicionados
• Política de devolução: 7 dias após a compra com recibo
• Pagamento: Multicaixa, transferência bancária, dinheiro`}
          />
          <p className="text-xs text-zinc-400 mt-2">
            💡 Para documentos completos (PDF, DOCX), use a{' '}
            <a href="/dashboard/knowledge" className="text-emerald-600 underline">Base de Conhecimento</a>.
          </p>
        </CardContent>
      </Card>

      {/* Tom da IA */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Zap className="w-4 h-4" /> Tom de Comunicação</CardTitle>
          <CardDescription>Define o estilo geral das respostas do agente.</CardDescription>
        </CardHeader>
        <CardContent>
          <OptionGrid options={toneOptions} value={settings.ai_tone} onChange={v => set('ai_tone', v)} />
        </CardContent>
      </Card>

      {/* Modo de Emojis */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Uso de Emojis</CardTitle>
          <CardDescription>Como o agente usa emojis nas suas mensagens.</CardDescription>
        </CardHeader>
        <CardContent>
          <OptionGrid options={emojiOptions} value={settings.emoji_mode} onChange={v => set('emoji_mode', v)} />
        </CardContent>
      </Card>

      {/* Coexistência Humano/IA */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Users className="w-4 h-4" /> Coexistência Humano / IA</CardTitle>
          <CardDescription>Define o que acontece quando um atendente humano intervém na conversa.</CardDescription>
        </CardHeader>
        <CardContent>
          <OptionGrid options={handoverOptions} value={settings.handover_mode} onChange={v => set('handover_mode', v)} />
        </CardContent>
        <CardFooter className="bg-zinc-50 border-t border-zinc-100 py-3">
          <p className="text-xs text-zinc-500">
            💡 No <strong>Modo Híbrido</strong>, use o{' '}
            <a href="/dashboard/live-chat" className="text-emerald-600 underline">Live Chat</a>{' '}
            para pausar/retomar a IA manualmente por conversa.
          </p>
        </CardFooter>
      </Card>

      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-700 h-11 px-8 gap-2">
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar Configurações
        </Button>
      </div>
    </div>
  );
}
