import React, { useState } from 'react';
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { ShieldCheck, Lock, Eye, EyeOff, Loader2, X } from "lucide-react";
import { toast } from 'sonner';

interface MetaSecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  actionTitle?: string;
  actionDescription?: string;
}

export const MetaSecurityModal: React.FC<MetaSecurityModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  actionTitle = "Acesso Seguro a Credenciais",
  actionDescription = "Para visualizar dados sensíveis (tokens) ou editar a conexão da Meta, confirme a sua palavra-passe de acesso."
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setErrorMsg('Por favor, insira a sua palavra-passe.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/auth/verify-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.error || 'Palavra-passe incorreta. Acesso negado.');
        return;
      }

      toast.success('Autenticação confirmada! Edição desbloqueada.');
      setPassword('');
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao validar palavra-passe.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-zinc-200 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-zinc-100 flex items-start justify-between bg-zinc-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shadow-sm">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900 text-base">{actionTitle}</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Proteção de Credenciais Meta</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-zinc-400 hover:text-zinc-600 rounded-lg p-1 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleConfirm} className="p-6 space-y-4">
          <p className="text-xs text-zinc-600 leading-relaxed">
            {actionDescription}
          </p>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-700 uppercase tracking-wider">
              Palavra-passe da sua conta
            </label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Insira a sua palavra-passe..."
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrorMsg('');
                }}
                className="pr-10 bg-white"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 focus:outline-none"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errorMsg && (
              <p className="text-xs text-red-600 font-medium animate-in fade-in">
                {errorMsg}
              </p>
            )}
          </div>

          <div className="pt-2 flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !password}
              className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white font-medium"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> A verificar...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 mr-2 text-emerald-400" /> Desbloquear
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
export default MetaSecurityModal;
