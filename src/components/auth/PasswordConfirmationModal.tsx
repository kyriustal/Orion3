import React, { useState } from 'react';
import { ShieldCheck, Eye, EyeOff, Loader2, X, Lock } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';

interface PasswordConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (password: string) => Promise<void> | void;
  title?: string;
  description?: string;
  actionLabel?: string;
  isLoading?: boolean;
}

export function PasswordConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirmar Palavra-passe",
  description = "Por razões de segurança, insira a sua palavra-passe de acesso ao Orion para autorizar a edição destas credenciais de conexão.",
  actionLabel = "Confirmar e Guardar",
  isLoading = false,
}: PasswordConfirmationModalProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isSubmittingInternal, setIsSubmittingInternal] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setErrorMsg("A palavra-passe é obrigatória.");
      return;
    }

    setErrorMsg("");
    try {
      setIsSubmittingInternal(true);
      await onConfirm(password);
      setPassword("");
      setErrorMsg("");
    } catch (err: any) {
      setErrorMsg(err.message || "Erro ao autenticar palavra-passe.");
    } finally {
      setIsSubmittingInternal(false);
    }
  };

  const handleClose = () => {
    if (isLoading || isSubmittingInternal) return;
    setPassword("");
    setErrorMsg("");
    onClose();
  };

  const busy = isLoading || isSubmittingInternal;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden transform animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header com gradiente sutil */}
        <div className="px-6 pt-6 pb-4 border-b border-zinc-100 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-sm shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-zinc-900 leading-tight">{title}</h3>
              <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1 font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Autenticação de Segurança Requerida
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg hover:bg-zinc-100 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-sm text-zinc-600 leading-relaxed bg-zinc-50 p-3 rounded-xl border border-zinc-200/80">
            {description}
          </p>

          <div className="space-y-2">
            <Label htmlFor="auth-password" className="text-xs font-semibold text-zinc-700">
              Palavra-passe de Acesso ao Orion
            </Label>
            <div className="relative">
              <Input
                id="auth-password"
                type={showPassword ? "text" : "password"}
                autoFocus
                placeholder="Insira a sua palavra-passe atual"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMsg) setErrorMsg("");
                }}
                disabled={busy}
                className="pr-10 text-sm h-10 border-zinc-300 focus-visible:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errorMsg && (
              <p className="text-xs text-red-600 font-medium animate-in fade-in duration-150">
                {errorMsg}
              </p>
            )}
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={busy}
              className="text-zinc-600 border-zinc-200"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={busy || !password.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm gap-2"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  A validar...
                </>
              ) : (
                actionLabel
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
export default PasswordConfirmationModal;
