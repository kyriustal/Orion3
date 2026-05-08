import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Calendar, Clock, User, Mail, Phone, Briefcase, CheckCircle2 } from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import { toast } from "sonner";

const bookingSchema = z.object({
  firstName: z.string().min(2, "Nome é obrigatório"),
  lastName: z.string().min(2, "Sobrenome é obrigatório"),
  email: z.string().email("Email inválido"),
  phone: z.string().min(8, "Telefone inválido"),
  service: z.string().min(3, "Selecione um serviço"),
  date: z.string().min(1, "Data é obrigatória"),
  time: z.string().min(1, "Hora é obrigatória"),
});

type BookingValues = z.infer<typeof bookingSchema>;

export function BookingForm({ onSuccess }: { onSuccess?: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const form = useForm<BookingValues>({
    resolver: zodResolver(bookingSchema),
  });

  async function onSubmit(data: BookingValues) {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error("Erro ao salvar agendamento");

      setIsDone(true);
      toast.success("Agendamento realizado com sucesso!");
      onSuccess?.();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isDone) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center animate-in zoom-in-95">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle2 className="w-10 h-10 text-emerald-600" />
        </div>
        <h3 className="text-xl font-bold text-zinc-900">Agendamento Confirmado!</h3>
        <p className="text-zinc-500 mt-2">Em breve entraremos em contato para confirmar os detalhes.</p>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 p-1">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Primeiro Nome</Label>
          <div className="relative">
            <User className="absolute left-3 top-3 w-4 h-4 text-zinc-400" />
            <Input {...form.register("firstName")} className="pl-10" placeholder="João" />
          </div>
          {form.formState.errors.firstName && <p className="text-xs text-red-500">{form.formState.errors.firstName.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>Último Nome</Label>
          <Input {...form.register("lastName")} placeholder="Silva" />
          {form.formState.errors.lastName && <p className="text-xs text-red-500">{form.formState.errors.lastName.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>E-mail</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-3 w-4 h-4 text-zinc-400" />
            <Input {...form.register("email")} className="pl-10" placeholder="joao@exemplo.com" />
          </div>
          {form.formState.errors.email && <p className="text-xs text-red-500">{form.formState.errors.email.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>WhatsApp/Contato</Label>
          <div className="relative">
            <Phone className="absolute left-3 top-3 w-4 h-4 text-zinc-400" />
            <Input {...form.register("phone")} className="pl-10" placeholder="(11) 99999-9999" />
          </div>
          {form.formState.errors.phone && <p className="text-xs text-red-500">{form.formState.errors.phone.message}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Serviço / Assunto</Label>
        <div className="relative">
          <Briefcase className="absolute left-3 top-3 w-4 h-4 text-zinc-400" />
          <Input {...form.register("service")} className="pl-10" placeholder="Ex: Consultoria, Suporte, Compra..." />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Data</Label>
          <div className="relative">
            <Calendar className="absolute left-3 top-3 w-4 h-4 text-zinc-400" />
            <Input type="date" {...form.register("date")} className="pl-10" />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Hora</Label>
          <div className="relative">
            <Clock className="absolute left-3 top-3 w-4 h-4 text-zinc-400" />
            <Input type="time" {...form.register("time")} className="pl-10" />
          </div>
        </div>
      </div>

      <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 h-11" disabled={isSubmitting}>
        {isSubmitting ? "Processando..." : "Confirmar Agendamento"}
      </Button>
    </form>
  );
}
