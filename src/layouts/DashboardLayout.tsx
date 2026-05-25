import { Outlet, Link, useLocation } from 'react-router-dom';
import { Bot, Smartphone, LayoutDashboard, BookOpen, MessageSquare, CreditCard, Settings, Megaphone, Users, BarChart, LogOut, UserCircle, PlayCircle, Menu, X, Zap, Instagram } from 'lucide-react';
import { PageTransition } from '@/src/components/ui/PageTransition';
import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { toast } from 'sonner';
import TrialExpiredGate from '@/src/components/TrialExpiredGate';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
const navItems = [
  { name: 'Dashboard',            path: '/dashboard',             icon: LayoutDashboard },
  { name: 'Live Chat',            path: '/dashboard/live-chat',   icon: MessageSquare, isNew: true },
  { name: 'Simulação',            path: '/dashboard/simulation',  icon: PlayCircle },
  { name: 'Agentes (Bots)',       path: '/dashboard/agent',       icon: Bot },
  { name: 'WhatsApp',             path: '/dashboard/whatsapp',    icon: Smartphone },
  { name: 'Facebook Messenger',   path: '/dashboard/facebook',    icon: Smartphone },
  { name: 'Instagram Direct',     path: '/dashboard/instagram',   icon: Instagram },
  { name: 'Base de Conhecimento', path: '/dashboard/knowledge',   icon: BookOpen },
  { name: 'Campanhas',            path: '/dashboard/campaigns',   icon: Megaphone },
  { name: 'Automações',           path: '/dashboard/automations', icon: Zap },
  { name: 'Templates (HSM)', path: '/dashboard/templates', icon: MessageSquare },
  { name: 'Insights & Sentimento', path: '/dashboard/insights', icon: BarChart },
  { name: 'Equipe', path: '/dashboard/team', icon: Users },
  { name: 'Assinatura', path: '/dashboard/billing', icon: CreditCard },
  { name: 'Configurações', path: '/dashboard/settings', icon: Settings },
];

export default function DashboardLayout() {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [user, setUser] = useState({ name: 'Carregando...', email: '', role: 'OWNER' });
  const [subStatus, setSubStatus] = useState<{ status: string; plan: string; daysLeft: number } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    fetch("/api/auth/me", {
      headers: { "Authorization": `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          setUser({
            name: data.user.name || data.user.email?.split('@')[0] || "Usuário",
            email: data.user.email,
            role: data.user.role || 'OWNER'
          });
        }
      })
      .catch(err => console.error("Erro ao carregar usuário:", err));

    // Verificar subscrição
    fetch("/api/billing/status", {
      headers: { "Authorization": `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setSubStatus(data))
      .catch(() => {});

    // Configuração de WebSocket para Notificações Globais
    const sock = io(window.location.origin, { transports: ["websocket", "polling"] });
    sock.on("connect", () => {
      try {
        if (token) {
          const decoded = JSON.parse(atob(token.split(".")[1]));
          const orgId = decoded?.orgId || decoded?.id;
          if (orgId) sock.emit("join_org", orgId);
        }
      } catch {}
    });

    const playNotificationSound = () => {
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        osc.type = 'sine';
        // Frequência suave (ding)
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } catch (e) {
        console.warn('Audio play failed', e);
      }
    };

    sock.on("handover_alert", (data: any) => {
      playNotificationSound();
      toast.error(`🚨 Pedido de Atendimento Humano`, {
        description: `O cliente ${data.phone} pediu para falar com um assistente (${data.platform}).`,
        duration: 10000,
        action: { label: 'Abrir Chat', onClick: () => window.location.href = '/dashboard/live-chat' }
      });
    });

    sock.on("booking_alert", (data: any) => {
      playNotificationSound();
      toast.success(`📅 Novo Pedido de Agendamento`, {
        description: `O cliente ${data.phone} solicitou um agendamento (${data.platform}).`,
        duration: 10000,
        action: { label: 'Abrir Chat', onClick: () => window.location.href = '/dashboard/live-chat' }
      });
    });

    return () => {
      sock.disconnect();
    };
  }, []);

  // ── Registar Service Worker e subscrever Web Push (segundo plano) ────────────
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('[PUSH] Web Push não suportado neste browser.');
      return;
    }

    const setupPush = async () => {
      try {
        // 1. Registar o Service Worker
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        console.log('[PUSH] Service Worker registado:', registration.scope);

        // 2. Verificar permissão atual
        let permission = Notification.permission;

        if (permission === 'default') {
          // Pedir permissão ao utilizador (aparece a popup do browser)
          permission = await Notification.requestPermission();
        }

        if (permission !== 'granted') {
          console.log('[PUSH] Permissão de notificações negada pelo utilizador.');
          return;
        }

        // 3. Obter chave pública VAPID do servidor
        const keyRes = await fetch('/api/push/public-key');
        if (!keyRes.ok) {
          console.warn('[PUSH] Servidor não devolveu chave VAPID — web-push não configurado.');
          return;
        }
        const { publicKey } = await keyRes.json();
        if (!publicKey) return;

        // 4. Converter chave VAPID Base64 para Uint8Array
        const urlBase64ToUint8Array = (base64String: string) => {
          const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
          const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
          const rawData = atob(base64);
          return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
        };

        // 5. Subscrever ao PushManager
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly:      true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });

        // 6. Enviar a assinatura para o backend guardar
        const token = localStorage.getItem('token');
        await fetch('/api/push/subscribe', {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ subscription }),
        });

        console.log('[PUSH] ✅ Assinatura de Web Push registada com sucesso!');
      } catch (err) {
        console.error('[PUSH] Erro ao configurar Web Push:', err);
      }
    };

    setupPush();
  }, []);

  useEffect(() => {
    if (user.role === 'AGENT' && (location.pathname === '/dashboard' || location.pathname === '/dashboard/')) {
      window.location.href = '/dashboard/live-chat';
    }
  }, [user.role, location.pathname]);

  const filteredNavItems = navItems.filter(item => {
    if (user.role === 'AGENT') {
      return ['Live Chat', 'Configurações'].includes(item.name);
    }
    if (user.role === 'VIEWER') {
      return ['Dashboard', 'Insights & Sentimento'].includes(item.name);
    }
    return true;
  });

  return (
    <div className="flex h-screen bg-zinc-50 flex-col md:flex-row w-full max-w-full overflow-x-hidden">

      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-white border-b border-zinc-200 z-40 relative">
        <Link to="/dashboard" className="flex items-center w-1/2">
          <img src="/Orion.png" alt="Orion Logo" className="w-full h-auto max-h-12 object-contain" />
        </Link>
        <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 -mr-2">
          <Menu className="w-6 h-6 text-zinc-900" />
        </button>
      </div>

      {/* Fullscreen Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-white text-zinc-900 flex flex-col animate-in fade-in duration-200">
          <div className="flex items-center justify-between p-4 border-b border-zinc-100">
            <div className="flex items-center w-1/2">
              <img src="/Orion.png" alt="Orion Logo" className="w-full h-auto max-h-12 object-contain" />
            </div>
            <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 -mr-2 text-zinc-500 hover:text-zinc-900">
              <X className="w-6 h-6" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto p-4 space-y-2">
            {filteredNavItems.map((item) => {
              const isActive = location.pathname === item.path || (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-4 px-4 py-3 rounded-lg text-base font-medium transition-colors ${isActive
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                    }`}
                >
                  <item.icon className={`w-6 h-6 ${isActive ? 'text-emerald-600' : 'text-zinc-400'}`} />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-zinc-100">
            <div className="flex items-center gap-3 mb-4 px-2">
              <UserCircle className="w-10 h-10 text-zinc-400" />
              <div className="flex-1 min-w-0">
                <p className="text-base font-medium text-zinc-900 truncate">{user.name}</p>
                <p className="text-sm text-zinc-500 truncate">{user.email}</p>
              </div>
            </div>
            <button
              onClick={() => { localStorage.removeItem('token'); window.location.href = '/login'; }}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-base font-medium text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="w-6 h-6" />
              Sair da Conta
            </button>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-white border-r border-zinc-200 flex-col">
        <div className="p-6 border-b border-zinc-200">
          <Link to="/dashboard" className="block w-full">
            <img src="/Orion.png" alt="Orion Logo" className="w-1/2 h-auto object-contain" />
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {filteredNavItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                  }`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? 'text-emerald-600' : 'text-zinc-400'}`} />
                {item.name}
                {item.isNew && (
                  <span className="ml-auto bg-emerald-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                    Novo
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Profile & Logout */}
        <div className="p-4 border-t border-zinc-200">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 w-full px-2 py-2 rounded-md hover:bg-zinc-100 transition-colors text-left">
                <UserCircle className="w-8 h-8 text-zinc-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 truncate">{user.name}</p>
                  <p className="text-xs text-zinc-500 truncate">{user.email}</p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user.name}</p>
                  <p className="text-xs leading-none text-zinc-500">{user.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/dashboard/settings" className="cursor-pointer">
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Configurações da Conta</span>
                </Link>
              </DropdownMenuItem>
              {user.role !== 'AGENT' && user.role !== 'VIEWER' && (
                <DropdownMenuItem asChild>
                  <Link to="/dashboard/billing" className="cursor-pointer">
                    <CreditCard className="mr-2 h-4 w-4" />
                    <span>Faturamento</span>
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600 focus:bg-red-50 focus:text-red-700 cursor-pointer"
                onClick={() => { localStorage.removeItem('token'); window.location.href = '/login'; }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sair da Conta</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8 w-full max-w-full">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>

      {/* Bloqueio de Trial/Dívida */}
      {subStatus && ['expired', 'debt'].includes(subStatus.status) && (
        <TrialExpiredGate status={subStatus.status as 'expired' | 'debt'} daysLeft={subStatus.daysLeft} />
      )}
    </div>
  );
}
