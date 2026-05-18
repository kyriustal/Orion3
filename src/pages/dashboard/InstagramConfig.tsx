import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Instagram, Key, CheckCircle2, AlertCircle, Loader2, Trash2, RefreshCw, Copy, Webhook } from 'lucide-react';
import { toast } from 'sonner';

type Config = { id: string; instagram_user_id: string; username: string; display_name: string; is_active: boolean; created_at: string; };

export default function InstagramConfig() {
  const [config,       setConfig]       = useState<Config | null>(null);
  const [isLoading,    setIsLoading]    = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [token,        setToken]        = useState('');
  const [displayName,  setDisplayName]  = useState('');

  const [webhookUrl]   = useState(`${window.location.origin}/api/instagram/webhook`);
  const [verifyToken]  = useState('orion_secure_token_123');

  const authToken = () => localStorage.getItem('token') || '';

  useEffect(() => {
    fetch('/api/instagram/config', { headers: { Authorization: `Bearer ${authToken()}` } })
      .then(r => r.json())
      .then(d => { if (d?.id) setConfig(d); })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const handleConnect = async () => {
    if (!token.trim()) { toast.error('Insira o Page Access Token.'); return; }
    setIsConnecting(true);
    try {
      const res = await fetch('/api/instagram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
        body: JSON.stringify({ access_token: token.trim(), display_name: displayName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao conectar.');
      toast.success(data.message);
      setConfig(data.data);
      setToken('');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Desconectar o Instagram? A IA deixará de responder nas DMs.')) return;
    await fetch('/api/instagram/config', { method: 'DELETE', headers: { Authorization: `Bearer ${authToken()}` } });
    setConfig(null);
    toast.info('Instagram desconectado.');
  };

  const copy = (text: string) => { navigator.clipboard.writeText(text); toast.success('Copiado!'); };

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Instagram Direct</h2>
        <p className="text-zinc-500 text-sm mt-1">Automatize respostas às mensagens directas do seu Instagram Business.</p>
      </div>

      {/* Estado da Conexão */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Instagram className="w-5 h-5 text-pink-500" /> Conta Conectada</CardTitle>
          <CardDescription>Conta Instagram Business ligada ao Orion IA.</CardDescription>
        </CardHeader>
        <CardContent>
          {config ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-zinc-50 rounded-xl border border-zinc-200">
              <div className="flex items-center gap-4 w-full sm:w-auto">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center shrink-0">
                  <Instagram className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-zinc-900 truncate">@{config.username || config.display_name}</p>
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium mt-0.5">
                    <CheckCircle2 className="w-3 h-3 shrink-0" /> Conectado e Activo
                  </div>
                  <p className="text-xs text-zinc-400 font-mono mt-1 truncate">ID: {config.instagram_user_id}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleDisconnect} className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 self-end sm:self-auto shrink-0">
                <Trash2 className="w-4 h-4 mr-2" /> Desconectar
              </Button>
            </div>
          ) : (
            <div className="text-center py-8 border-2 border-dashed border-zinc-200 rounded-xl text-zinc-400">
              <Instagram className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma conta Instagram conectada.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Formulário de Conexão */}
      {!config && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Key className="w-4 h-4" /> Conectar Instagram Business</CardTitle>
            <CardDescription>
              Precisa de um <strong>Page Access Token</strong> com permissões: <code className="text-xs bg-zinc-100 px-1 rounded">instagram_manage_messages</code>, <code className="text-xs bg-zinc-100 px-1 rounded">pages_messaging</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-2">
              <p className="font-semibold flex items-center gap-2"><AlertCircle className="w-4 h-4" /> Pré-requisitos:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Conta Instagram no modo <strong>Business</strong> ou <strong>Creator</strong></li>
                <li>Conta Instagram <strong>ligada a uma Facebook Page</strong></li>
                <li>Aplicação Meta com permissão <strong>Instagram Messaging</strong></li>
                <li>Token de Acesso da Página (Page Access Token permanente)</li>
              </ul>
            </div>
            <div className="space-y-2">
              <Label>Nome de Exibição (opcional)</Label>
              <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Ex: Loja XYZ — Suporte" />
            </div>
            <div className="space-y-2">
              <Label>Page Access Token <span className="text-red-500">*</span></Label>
              <Input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="EAA..." />
              <p className="text-xs text-zinc-400">O Instagram Business Account ID é detectado automaticamente a partir do token.</p>
            </div>
          </CardContent>
          <CardFooter className="bg-zinc-50 border-t border-zinc-100 py-4 flex justify-end">
            <Button onClick={handleConnect} disabled={isConnecting || !token.trim()} className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white gap-2">
              {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Instagram className="w-4 h-4" />}
              Conectar Instagram
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Webhook */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Webhook className="w-4 h-4" /> Configuração do Webhook</CardTitle>
          <CardDescription>Configure estas credenciais no painel Meta for Developers → Webhooks → Instagram.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Callback URL</Label>
            <div className="flex flex-col sm:flex-row gap-2 w-full">
              <Input value={webhookUrl} readOnly className="bg-zinc-50 font-mono text-xs sm:text-sm text-zinc-600 truncate flex-1" />
              <Button variant="outline" size="icon" onClick={() => copy(webhookUrl)} className="shrink-0 self-end sm:self-auto"><Copy className="w-4 h-4" /></Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Verify Token</Label>
            <div className="flex flex-col sm:flex-row gap-2 w-full">
              <Input value={verifyToken} readOnly className="bg-zinc-50 font-mono text-xs sm:text-sm text-zinc-600 truncate flex-1" />
              <Button variant="outline" size="icon" onClick={() => copy(verifyToken)} className="shrink-0 self-end sm:self-auto"><Copy className="w-4 h-4" /></Button>
            </div>
          </div>
          <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-xs text-zinc-600">
            <p className="font-medium mb-1">Campos a subscrever no Webhook:</p>
            <code className="bg-white border border-zinc-200 rounded px-2 py-1 block">messages, messaging_postbacks, messaging_optins</code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
