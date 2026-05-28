import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Users, UserPlus, Shield, MoreVertical, Loader2, Mail, Lock } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export default function Team() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [team, setTeam] = useState<any[]>([]);
  const [newMember, setNewMember] = useState({ name: "", email: "", role: "AGENT", password: "" });

  useEffect(() => {
    fetchTeam();
  }, []);

  const fetchTeam = async () => {
    try {
      const response = await fetch("/api/team", {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      if (!response.ok) throw new Error("Erro ao carregar equipe");
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
      setTeam([...team, addedMember]);

      toast.success("Membro adicionado com sucesso!");
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
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Equipe e Permissões</h2>
          <p className="text-zinc-500">Adicione funcionários para ajudar no atendimento manual e gestão.</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <UserPlus className="w-4 h-4" /> Adicionar Membro
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Membros Ativos</CardTitle>
          <CardDescription>Gerencie quem tem acesso ao painel e ao Live Chat.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {team.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 border-2 border-dashed rounded-xl">
                Nenhum membro cadastrado.
              </div>
            ) : (
              team.map(member => (
                <div key={member.id} className="flex items-center justify-between p-4 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                      {member.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-zinc-900">{member.name}</p>
                      <p className="text-xs text-zinc-500">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-zinc-400" />
                      <span className="text-xs font-bold text-zinc-600 uppercase tracking-tighter">{member.role}</span>
                    </div>
                    <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-zinc-600">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))
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
                <CardDescription>Crie uma conta de acesso para sua equipe.</CardDescription>
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
                      placeholder="******"
                      value={newMember.password}
                      onChange={(e) => setNewMember({ ...newMember, password: e.target.value })}
                      className="pr-10"
                    />
                    <Lock className="w-4 h-4 absolute right-3 top-3 text-zinc-400" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="memberRole">Permissão (Cargo)</Label>
                  <select
                    id="memberRole"
                    title="Selecione a permissão do membro"
                    className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={newMember.role}
                    onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}
                  >
                    <option value="ADMIN">Admin (Acesso Total)</option>
                    <option value="AGENT">Agente (Apenas Live Chat)</option>
                    <option value="VIEWER">Visualizador (Apenas Relatórios)</option>
                  </select>
                </div>
              </CardContent>
              <CardFooter className="bg-zinc-50 border-t border-zinc-100 py-4 flex justify-end gap-2 rounded-b-xl">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting} className="min-w-[120px] bg-emerald-600">
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
