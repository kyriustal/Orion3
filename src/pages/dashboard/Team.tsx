import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { UserPlus, Shield, ShieldCheck, ShieldAlert, Eye, MessageCircle, Settings, BarChart2, Loader2, Lock, CheckCircle2, XCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

// ─── Definição dos cargos e suas permissões ──────────────────────────────────

type RoleKey = "OWNER" | "ADMIN" | "AGENT" | "VIEWER";

const ROLES: Record<RoleKey, {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ElementType;
  description: string;
  permissions: { label: string; allowed: boolean }[];
}> = {
  OWNER: {
    label: "Proprietário",
    color: "text-violet-700",
    bgColor: "bg-violet-50",
    borderColor: "border-violet-200",
    icon: ShieldAlert,
    description: "Controlo total da plataforma",
    permissions: [
      { label: "Live Chat e atendimento", allowed: true },
      { label: "Configurações da conta", allowed: true },
      { label: "Gerir equipa e membros", allowed: true },
      { label: "Relatórios e análises", allowed: true },
      { label: "Faturação e subscrição", allowed: true },
    ],
  },
  ADMIN: {
    label: "Administrador",
    color: "text-blue-700",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    icon: ShieldCheck,
    description: "Acesso total exceto faturação",
    permissions: [
      { label: "Live Chat e atendimento", allowed: true },
      { label: "Configurações da conta", allowed: true },
      { label: "Gerir equipa e membros", allowed: true },
      { label: "Relatórios e análises", allowed: true },
      { label: "Faturação e subscrição", allowed: false },
    ],
  },
  AGENT: {
    label: "Agente",
    color: "text-emerald-700",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
    icon: MessageCircle,
    description: "Apenas atendimento ao cliente",
    permissions: [
      { label: "Live Chat e atendimento", allowed: true },
      { label: "Configurações da conta", allowed: false },
      { label: "Gerir equipa e membros", allowed: false },
      { label: "Relatórios e análises", allowed: false },
      { label: "Faturação e subscrição", allowed: false },
    ],
  },
  VIEWER: {
    label: "Visualizador",
    color: "text-amber-700",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    icon: Eye,
    description: "Apenas leitura de relatórios",
    permissions: [
      { label: "Live Chat e atendimento", allowed: false },
      { label: "Configurações da conta", allowed: false },
      { label: "Gerir equipa e membros", allowed: false },
      { label: "Relatórios e análises", allowed: true },
      { label: "Faturação e subscrição", allowed: false },
    ],
  },
};

function RoleBadge({ role }: { role: string }) {
  const r = ROLES[role as RoleKey] || ROLES.AGENT;
  const Icon = r.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${r.bgColor} ${r.color} ${r.borderColor}`}>
      <Icon className="w-3 h-3" />
      {r.label}
    </span>
  );
}

export default function Team() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [team, setTeam] = useState<any[]>([]);
  const [newMember, setNewMember] = useState({ name: "", email: "", role: "AGENT", password: "" });

  useEffect(() => { fetchTeam(); }, []);

  const fetchTeam = async () => {
    try {
      const response = await fetch("/api/team", {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      if (!response.ok) throw new Error("Erro ao carregar equipa");
      const data = await response.json();
      setTeam(data);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMember.name || !newMember.email || !newMember.password) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }
    if (newMember.password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/team", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify(newMember)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Erro ao adicionar membro");
      }

      const addedMember = await response.json();
      setTeam(prev => [...prev, addedMember]);

      toast.success(`Conta criada para ${newMember.name}!`);
      setIsModalOpen(false);
      setNewMember({ name: "", email: "", role: "AGENT", password: "" });
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Equipa e Permissões</h2>
          <p className="text-zinc-500 mt-1">Adicione funcionários e defina os seus níveis de acesso.</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <UserPlus className="w-4 h-4" /> Adicionar Membro
        </Button>
      </div>

      {/* Tabela de Permissões por Cargo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5 text-zinc-400" /> Cargos e Permissões</CardTitle>
          <CardDescription>Cada cargo tem acesso a funcionalidades específicas da plataforma.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="text-left py-3 px-4 text-zinc-500 font-medium">Permissão</th>
                  {(["OWNER", "ADMIN", "AGENT", "VIEWER"] as RoleKey[]).map(role => {
                    const r = ROLES[role];
                    const Icon = r.icon;
                    return (
                      <th key={role} className="py-3 px-4 text-center">
                        <div className={`inline-flex flex-col items-center gap-1 px-3 py-2 rounded-xl ${r.bgColor} border ${r.borderColor}`}>
                          <Icon className={`w-4 h-4 ${r.color}`} />
                          <span className={`text-xs font-bold ${r.color}`}>{r.label}</span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {ROLES.ADMIN.permissions.map((perm, idx) => (
                  <tr key={idx} className="border-b border-zinc-50 hover:bg-zinc-50/50 transition-colors">
                    <td className="py-3 px-4 text-zinc-700 font-medium">{perm.label}</td>
                    {(["OWNER", "ADMIN", "AGENT", "VIEWER"] as RoleKey[]).map(role => (
                      <td key={role} className="py-3 px-4 text-center">
                        {ROLES[role].permissions[idx].allowed
                          ? <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto" />
                          : <XCircle className="w-5 h-5 text-zinc-200 mx-auto" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Membros */}
      <Card>
        <CardHeader>
          <CardTitle>Membros Ativos</CardTitle>
          <CardDescription>Gerencie quem tem acesso ao painel e ao Live Chat.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {team.length === 0 ? (
              <div className="text-center py-12 text-zinc-400 border-2 border-dashed border-zinc-100 rounded-2xl">
                <UserPlus className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="font-medium text-zinc-500">Nenhum membro adicionado ainda.</p>
                <p className="text-xs mt-1">Clique em "Adicionar Membro" para começar.</p>
              </div>
            ) : (
              team.map(member => {
                const r = ROLES[member.role as RoleKey] || ROLES.AGENT;
                const Icon = r.icon;
                return (
                  <div key={member.id} className={`flex items-center justify-between p-4 rounded-xl border bg-white hover:bg-zinc-50 transition-colors ${r.borderColor}`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-11 h-11 rounded-full ${r.bgColor} ${r.color} flex items-center justify-center font-bold text-lg`}>
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-zinc-900">{member.name}</p>
                        <p className="text-xs text-zinc-500">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="hidden sm:flex flex-col items-end gap-1">
                        <RoleBadge role={member.role} />
                        <p className="text-[10px] text-zinc-400">{r.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Modal de Adicionar Membro */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <form onSubmit={handleInvite}>
              <CardHeader>
                <CardTitle>Adicionar Novo Membro</CardTitle>
                <CardDescription>Crie uma conta de acesso para a sua equipa.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="memberName">Nome Completo</Label>
                  <Input
                    id="memberName"
                    placeholder="Ex: João Silva"
                    value={newMember.name}
                    onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="memberEmail">E-mail de Acesso</Label>
                  <Input
                    id="memberEmail"
                    type="email"
                    placeholder="joao@empresa.com"
                    value={newMember.email}
                    onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="memberPwd">Senha Inicial</Label>
                  <div className="relative">
                    <Input
                      id="memberPwd"
                      type="password"
                      placeholder="Mínimo 6 caracteres"
                      value={newMember.password}
                      onChange={(e) => setNewMember({ ...newMember, password: e.target.value })}
                      className="pr-10"
                    />
                    <Lock className="w-4 h-4 absolute right-3 top-3 text-zinc-400" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="memberRole">Cargo / Nível de Acesso</Label>
                  <select
                    id="memberRole"
                    title="Selecione o cargo do membro"
                    className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={newMember.role}
                    onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}
                  >
                    <option value="ADMIN">Administrador — Acesso total exceto faturação</option>
                    <option value="AGENT">Agente — Apenas Live Chat e atendimento</option>
                    <option value="VIEWER">Visualizador — Apenas leitura de relatórios</option>
                  </select>
                  {/* Preview do cargo selecionado */}
                  {newMember.role && ROLES[newMember.role as RoleKey] && (() => {
                    const r = ROLES[newMember.role as RoleKey];
                    return (
                      <div className={`rounded-xl border p-3 mt-1 ${r.bgColor} ${r.borderColor}`}>
                        <div className="flex flex-wrap gap-2">
                          {r.permissions.map((p, i) => (
                            <span key={i} className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${p.allowed ? 'bg-white text-emerald-700 border border-emerald-200' : 'bg-white/50 text-zinc-400 border border-zinc-200'}`}>
                              {p.allowed ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                              {p.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </CardContent>
              <CardFooter className="bg-zinc-50 border-t border-zinc-100 py-4 flex justify-end gap-2 rounded-b-xl">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting} className="min-w-[130px] bg-emerald-600 hover:bg-emerald-700">
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Criar Conta'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
