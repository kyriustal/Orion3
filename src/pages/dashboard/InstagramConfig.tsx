import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { 
  Instagram, Key, CheckCircle2, AlertCircle, Loader2, Trash2, 
  Copy, Webhook, Eye, EyeOff, Pencil, Lock, ShieldCheck 
} from 'lucide-react';
import { toast } from 'sonner';
import { PasswordConfirmationModal } from '@/src/components/auth/PasswordConfirmationModal';

type Config = { 
  id: string; 
  instagram_user_id: string; 
  username: string; 
  display_name: string; 
  access_token?: string; 
  is_active: boolean; 
  created_at: string; 
};

export default function InstagramConfig() {
  const [config, setConfig] = useState<Config | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showTokenPreview, setShowTokenPreview] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [pendingCredentialAction, setPendingCredentialAction] = useState<null | 'showToken' | 'copyToken'>(null);
  const [hasCredentialAccess, setHasCredentialAccess] = useState(false);

  const [token, setToken] = useState('');
  const [displayName, setDisplayName] = useState('');

  const [webhookUrl] = useState(`${window.location.origin}/api/instagram/webhook`);
  const [verifyToken] = useState('orion_secure_token_123');

  const authToken = () => localStorage.getItem('token') || '';

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/instagram/config', { 
        headers: { Authorization: `Bearer ${authToken()}` } 
      });
      const data = await res.json();
      if (data && data.is_active && data.instagram_user_id) {
        setConfig(data);
        setDisplayName(data.display_name || data.username || '');
        setToken(data.access_token || '');
        setIsEditing(false);
      } else {
        setConfig(null);
        setIsEditing(true);
      }
    } catch (err) {
      console.error('Erro ao carregar Instagram config:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleConnectClick = () => {
    if (!token.trim()) { 
      toast.error('Insira o Page Access Token.'); 
      return; 
    }

    executeSave();
  };

  const executeSave = async () => {
    setIsConnecting(true);
    try {
      const res = await fetch('/api/instagram/config', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${authToken()}` 
        },
        body: JSON.stringify({ 
          access_token: token.trim(), 
          display_name: displayName.trim()
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao guardar configuração.');
      }

      toast.success(data.message || 'Instagram conectado com sucesso!');
      setIsPasswordModalOpen(false);
      setIsEditing(false);
      await fetchConfig();
    } catch (err: any) {
      toast.error(err.message);
      throw err;
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Desconectar o Instagram? A IA deixará de responder nas DMs.')) return;
    try {
      await fetch('/api/instagram/config', { 
        method: 'DELETE', 
        headers: { Authorization: `Bearer ${authToken()}` } 
      });
      setConfig(null);
      setToken('');
      setDisplayName('');
      setIsEditing(true);
      toast.info('Instagram desconectado.');
    } catch {
      toast.error('Erro ao desconectar.');
    }
  };

  const copy = (text: string) => { 
    if (!text) return;
    navigator.clipboard.writeText(text); 
    toast.success('Copiado para a área de transferência!'); 
  };

  const requestCredentialAccess = (action: NonNullable<typeof pendingCredentialAction>) => {
    if (hasCredentialAccess) {
      runCredentialAction(action);
      return;
    }
    setPendingCredentialAction(action);
    setIsPasswordModalOpen(true);
  };

  const runCredentialAction = (action: NonNullable<typeof pendingCredentialAction>) => {
    if (action === 'showToken') setShowTokenPreview(true);
    if (action === 'copyToken') copy(config?.access_token || token);
  };

  const confirmCredentialAccess = async (password: string) => {
    const res = await fetch('/api/auth/verify-password', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        Authorization: `Bearer ${authToken()}` 
      },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Palavra-passe incorreta. Acesso negado.');
    }
    setHasCredentialAccess(true);
    if (pendingCredentialAction) runCredentialAction(pendingCredentialAction);
    setPendingCredentialAction(null);
    setIsPasswordModalOpen(false);
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-pink-600" />
      </div>
    );
  }

  const isConnected = !!config?.is_active;

  return (
    <div className="space-y-6 max-w-3xl pb-20">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Instagram Direct</h2>
        <p className="text-zinc-500 text-sm mt-1">
          Automatize respostas às mensagens directas do seu Instagram Business, pré-visualize IDs e tokens ou atualize credenciais.
        </p>
      </div>

      {/* ESTADO DA CONEXÃO & PRÉ-VISUALIZAÇÃO DE DADOS */}
      {isConnected && !isEditing ? (
        <Card className="border-zinc-200/90 shadow-sm overflow-hidden">
          <CardHeader className="bg-zinc-50/50 border-b border-zinc-100 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-yellow-500 via-pink-600 to-purple-600 flex items-center justify-center text-white shadow-xs">
                  <Instagram className="w-6 h-6" />
                </div>
                <div>
                  <CardTitle className="text-base text-zinc-900">
                    @{config.username || config.display_name}
                  </CardTitle>
                  <CardDescription className="text-xs flex items-center gap-1.5 text-emerald-600 font-medium mt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Conectado e Activo no Direct
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setIsEditing(true)} 
                  className="text-xs font-semibold text-pink-700 bg-pink-50 border-pink-200 hover:bg-pink-100"
                >
                  <Pencil className="w-3.5 h-3.5 mr-1.5" /> Editar Parâmetros
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleDisconnect} 
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Desconectar
                </Button>
              </div>
            </div>
          </CardHeader>

          {/* PAINEL DE PRÉ-VISUALIZAÇÃO (IDs e Tokens) */}
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-2">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-pink-600" />
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-700">
                  Pré-visualização de Credenciais Meta / Instagram
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Lock className="w-3.5 h-3.5" />
                <span>Visualização protegida por palavra-passe</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Instagram User ID */}
              <div className="bg-zinc-50/80 p-3.5 rounded-xl border border-zinc-200">
                <div className="flex items-center justify-between text-xs text-zinc-500 font-medium mb-1">
                  <span>Instagram Business Account ID</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copy(config.instagram_user_id)}
                    className="h-6 w-6 text-zinc-400 hover:text-zinc-700"
                    title="Copiar ID"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
                <p className="font-mono text-xs font-bold text-zinc-800 break-all select-all">
                  {config.instagram_user_id}
                </p>
              </div>

              {/* Nome de Exibição */}
              <div className="bg-zinc-50/80 p-3.5 rounded-xl border border-zinc-200">
                <div className="flex items-center justify-between text-xs text-zinc-500 font-medium mb-1">
                  <span>Nome / Identificação</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copy(config.display_name || config.username)}
                    className="h-6 w-6 text-zinc-400 hover:text-zinc-700"
                    title="Copiar Nome"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
                <p className="font-mono text-xs font-bold text-zinc-800 break-all select-all">
                  {config.display_name || `@${config.username}`}
                </p>
              </div>

              {/* Page Access Token com Toggle Ver/Ocultar e Copiar */}
              <div className="bg-zinc-50/80 p-3.5 rounded-xl border border-zinc-200 sm:col-span-2">
                <div className="flex items-center justify-between text-xs text-zinc-500 font-medium mb-1">
                  <span>Page Access Token Instagram</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => showTokenPreview ? setShowTokenPreview(false) : requestCredentialAccess('showToken')}
                      className="p-1 text-zinc-400 hover:text-zinc-700 rounded-md hover:bg-zinc-200 transition-colors"
                      title={showTokenPreview ? "Ocultar Token" : "Mostrar Token"}
                    >
                      {showTokenPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => requestCredentialAccess('copyToken')}
                      className="h-6 w-6 text-zinc-400 hover:text-zinc-700"
                      title="Copiar Token"
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <p className="font-mono text-xs font-semibold text-zinc-800 truncate select-all">
                  {showTokenPreview
                    ? (config.access_token || token || "Disponível internamente")
                    : ((config.access_token || token) 
                        ? `${(config.access_token || token).substring(0, 10)}••••••••••••••••${(config.access_token || token).substring((config.access_token || token).length - 6)}`
                        : "••••••••••••••••••••••••••••")}
                </p>
              </div>

              {/* Webhook & Callback URL */}
              <div className="bg-zinc-50/80 p-3 rounded-xl border border-zinc-200 sm:col-span-2">
                <div className="flex items-center justify-between text-xs text-zinc-500 font-medium mb-1">
                  <span>Webhook Callback URL (Meta)</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copy(webhookUrl)}
                    className="h-6 w-6 text-zinc-400 hover:text-zinc-700"
                    title="Copiar URL"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
                <p className="font-mono text-xs text-zinc-700 truncate select-all">{webhookUrl}</p>
              </div>
            </div>
          </CardContent>

          <CardFooter className="bg-zinc-50 border-t border-zinc-100 py-3 px-6 flex items-center justify-between">
            <span className="text-xs text-zinc-500 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Sincronizado diretamente com a API Meta Graph
            </span>
            <Button
              size="sm"
              onClick={() => setIsEditing(true)}
              className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-medium text-xs gap-1.5"
            >
              <Pencil className="w-3.5 h-3.5" /> Editar Credenciais
            </Button>
          </CardFooter>
        </Card>
      ) : (
        /* FORMULÁRIO DE EDIÇÃO OU CONEXÃO */
        <Card className="border-zinc-200/90 shadow-sm">
          <CardHeader className="border-b border-zinc-100 pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Instagram className="w-5 h-5 text-pink-600" />
                {isConnected ? "Editar Parâmetros do Instagram" : "Conectar Instagram Business"}
              </CardTitle>
              {isConnected && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setIsEditing(false)}
                  className="text-xs text-zinc-500"
                >
                  Cancelar Edição
                </Button>
              )}
            </div>
            <CardDescription className="text-xs">
              {isConnected 
                ? "Atualize o token ou o nome de exibição. A palavra-passe só será solicitada ao visualizar ou copiar credenciais sensíveis."
                : "Precisa de um Page Access Token permanente com permissões de mensagens."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            {!isConnected && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-800 space-y-1.5">
                <p className="font-semibold flex items-center gap-1.5 text-sm">
                  <AlertCircle className="w-4 h-4" /> Pré-requisitos:
                </p>
                <ul className="list-disc list-inside space-y-0.5 pl-1 text-[11px]">
                  <li>Conta Instagram no modo <strong>Business</strong> ou <strong>Creator</strong></li>
                  <li>Conta ligada a uma <strong>Facebook Page</strong></li>
                  <li>Token de Acesso com as permissões <code className="bg-white/80 px-1 rounded font-mono">instagram_manage_messages</code> e <code className="bg-white/80 px-1 rounded font-mono">pages_messaging</code></li>
                </ul>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-zinc-700">Nome de Exibição (opcional)</Label>
              <Input 
                value={displayName} 
                onChange={e => setDisplayName(e.target.value)} 
                placeholder="Ex: Suporte Instagram" 
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-zinc-700">Page Access Token <span className="text-red-500">*</span></Label>
              <Input 
                type="password" 
                value={token} 
                onChange={e => setToken(e.target.value)} 
                placeholder="EAA..." 
                className="text-sm font-mono"
              />
              <p className="text-[11px] text-zinc-400">
                O Instagram Business Account ID é detectado e verificado automaticamente na Meta a partir do token.
              </p>
            </div>
          </CardContent>

          <CardFooter className="bg-zinc-50 border-t border-zinc-100 py-4 flex justify-between">
            {isConnected ? (
              <Button 
                variant="outline" 
                onClick={() => setIsEditing(false)}
                className="text-zinc-600"
              >
                Cancelar
              </Button>
            ) : <div />}

            <Button 
              onClick={handleConnectClick} 
              disabled={isConnecting || !token.trim()} 
              className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-semibold gap-2 shadow-xs"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  A validar com a Meta...
                </>
              ) : (
                <>
                  <Instagram className="w-4 h-4" />
                  {isConnected ? "Salvar Alterações" : "Conectar Instagram"}
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Webhook Config */}
      <Card className="border-zinc-200/80 shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-bold text-zinc-800">
            <Webhook className="w-4 h-4 text-pink-600" /> Configuração do Webhook da Meta
          </CardTitle>
          <CardDescription className="text-xs">
            Configure estas credenciais no painel Meta for Developers → Webhooks → Instagram.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-[11px] font-bold text-zinc-500 uppercase">Callback URL</Label>
            <div className="flex gap-2 w-full">
              <Input value={webhookUrl} readOnly className="bg-zinc-50 font-mono text-xs truncate flex-1" />
              <Button variant="outline" size="sm" onClick={() => copy(webhookUrl)} className="shrink-0 text-xs">Copiar</Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] font-bold text-zinc-500 uppercase">Verify Token</Label>
            <div className="flex gap-2 w-full">
              <Input value={verifyToken} readOnly className="bg-zinc-50 font-mono text-xs truncate flex-1" />
              <Button variant="outline" size="sm" onClick={() => copy(verifyToken)} className="shrink-0 text-xs">Copiar</Button>
            </div>
          </div>
          <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-xs text-zinc-600">
            <p className="font-medium mb-1">Campos a subscrever no Webhook:</p>
            <code className="bg-white border border-zinc-200 rounded px-2 py-1 block font-mono text-[11px]">
              messages, messaging_postbacks, messaging_optins
            </code>
          </div>
        </CardContent>
      </Card>

      {/* Modal de confirmação com palavra-passe */}
      <PasswordConfirmationModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        onConfirm={confirmCredentialAccess}
        title="Desbloquear Credenciais Instagram"
        description="Por motivos de segurança, introduza a sua palavra-passe de acesso ao Orion para visualizar ou copiar credenciais da Meta."
        actionLabel="Desbloquear Credenciais"
      />
    </div>
  );
}
