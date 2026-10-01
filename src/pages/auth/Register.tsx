import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bot, Loader2, CheckCircle2, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/src/components/ui/card";
import { toast } from "sonner";

export default function Register() {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    whatsapp: "",
    address: "",
    contact: "",
    password: "",
    // Company data
    companyName: "",
    companyEmail: "",
    socialObject: "",
    employees: "",
    product: "",
    chatbotName: ""
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
  };

  const handleNext = () => {
    // Basic validation for step 1
    if (!formData.firstName || !formData.email || !formData.password) {
      toast.error("Preencha os campos obrigatórios (Nome, Email, Senha).");
      return;
    }
    setStep(2);
  };

  const handleBack = () => setStep(1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const error = await response.json();
        const fullMessage = error.details ? `${error.error} Detalhes: ${error.details} [${error.code || 'sem-codigo'}]` : (error.error || "Erro ao fazer login");
        throw new Error(fullMessage);
      }

      const data = await response.json();
      toast.success(data.message);
      setStep(3); // Show success/email verification message
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center">
        <div className="flex items-center justify-center mb-6">
          <img src="/Orion.png" alt="Orion Logo" className="h-12 w-auto" />
        </div>
        <h2 className="text-center text-2xl font-bold tracking-tight text-zinc-900">
          Crie a sua conta
        </h2>
        {step < 3 && (
          <p className="mt-2 text-center text-sm text-zinc-600">
            Já tem uma conta?{" "}
            <Link to="/login" className="font-medium text-emerald-600 hover:text-emerald-500">
              Faça login
            </Link>
          </p>
        )}
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-2xl">
        <Card className="shadow-xl border-zinc-200">
          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <CardHeader>
                <CardTitle>Dados Pessoais</CardTitle>
                <CardDescription>Passo 1 de 2: Informações de contato.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">Nome *</Label>
                    <Input id="firstName" required value={formData.firstName} onChange={handleChange} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Sobrenome</Label>
                    <Input id="lastName" value={formData.lastName} onChange={handleChange} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input id="email" type="email" required value={formData.email} onChange={handleChange} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input id="phone" value={formData.phone} onChange={handleChange} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="whatsapp">WhatsApp</Label>
                    <Input id="whatsapp" value={formData.whatsapp} onChange={handleChange} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Endereço</Label>
                  <Input id="address" value={formData.address} onChange={handleChange} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contact">Pessoa de Contato</Label>
                  <Input id="contact" value={formData.contact} onChange={handleChange} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Senha *</Label>
                  <Input id="password" type="password" required value={formData.password} onChange={handleChange} />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button onClick={handleNext} className="bg-emerald-600 hover:bg-emerald-700">
                  Próximo Passo <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </CardFooter>
            </div>
          )}

          {step === 2 && (
            <form onSubmit={handleSubmit} className="animate-in fade-in slide-in-from-right-4 duration-300">
              <CardHeader>
                <CardTitle>Dados da Empresa</CardTitle>
                <CardDescription>Passo 2 de 2: Configure o seu negócio e o chatbot.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Nome da Empresa *</Label>
                  <Input id="companyName" required value={formData.companyName} onChange={handleChange} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="companyEmail">E-mail Comercial da Empresa (Opcional)</Label>
                  <Input
                    id="companyEmail"
                    type="email"
                    value={formData.companyEmail}
                    onChange={handleChange}
                    placeholder={formData.email ? `Padrão: ${formData.email}` : "ex: contacto@empresa.com"}
                  />
                  <p className="text-xs text-zinc-400">
                    Caso não preencha, será utilizado o e-mail de registo ({formData.email || 'do passo 1'}) para receber notificações e agendamentos.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="socialObject">Objeto Social (Ramo de Atividade)</Label>
                  <Input id="socialObject" value={formData.socialObject} onChange={handleChange} placeholder="Ex: Venda de eletrônicos" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="employees">Número de Funcionários</Label>
                    <select
                      id="employees"
                      value={formData.employees}
                      onChange={handleChange}
                      className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
                    >
                      <option value="">Selecione...</option>
                      <option value="1-10">1 a 10</option>
                      <option value="11-50">11 a 50</option>
                      <option value="51-200">51 a 200</option>
                      <option value="201+">Mais de 200</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="chatbotName">Nome do Chatbot</Label>
                    <Input id="chatbotName" value={formData.chatbotName} onChange={handleChange} placeholder="Ex: Orion Bot" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="product">Produto/Serviço Principal</Label>
                  <textarea
                    id="product"
                    value={formData.product}
                    onChange={handleChange}
                    className="flex min-h-[80px] w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
                    placeholder="Descreva brevemente o que a sua empresa oferece..."
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button type="button" variant="outline" onClick={handleBack}>
                  <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
                </Button>
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={isLoading}>
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {isLoading ? "Concluindo..." : "Concluir Cadastro"}
                </Button>
              </CardFooter>
            </form>
          )}

          {step === 3 && (
            <div className="animate-in fade-in zoom-in-95 duration-500 text-center py-12">
              <CardContent className="flex flex-col items-center space-y-4">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                </div>
                <CardTitle className="text-2xl">Cadastro Concluído!</CardTitle>
                <CardDescription className="text-base max-w-md mx-auto">
                  Enviamos um email de verificação para <strong className="text-zinc-900">{formData.email}</strong>.
                  Por favor, verifique a sua caixa de entrada para ativar a sua conta.
                </CardDescription>
              </CardContent>
              <CardFooter className="flex justify-center mt-6">
                <Button onClick={() => navigate("/login")} variant="outline" className="w-full max-w-xs">
                  Ir para o Login
                </Button>
              </CardFooter>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
