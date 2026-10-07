import { Zap } from "lucide-react";

export type ButtonType = "QUICK_REPLY" | "URL" | "PHONE_NUMBER";

export interface PresetButton {
  id: string;
  type: ButtonType;
  text: string;
  url?: string;
  phone_number?: string;
}

export interface ButtonPreset {
  label: string;
  emoji: string;
  description: string;
  buttons: Omit<PresetButton, "id">[];
}

export const BUTTON_PRESETS: ButtonPreset[] = [
  {
    label: "Sim / Não",
    emoji: "✅",
    description: "Confirmação binária simples",
    buttons: [
      { type: "QUICK_REPLY", text: "Sim" },
      { type: "QUICK_REPLY", text: "Não" },
    ],
  },
  {
    label: "Interesse",
    emoji: "🎯",
    description: "Qualificação de lead",
    buttons: [
      { type: "QUICK_REPLY", text: "Estou Interessado" },
      { type: "QUICK_REPLY", text: "Não Estou Interessado" },
    ],
  },
  {
    label: "Confirmar / Cancelar",
    emoji: "📋",
    description: "Confirmação de agendamento ou ação",
    buttons: [
      { type: "QUICK_REPLY", text: "Confirmar" },
      { type: "QUICK_REPLY", text: "Cancelar" },
    ],
  },
  {
    label: "Falar com Atendente",
    emoji: "🧑‍💼",
    description: "Direciona para atendimento humano",
    buttons: [
      { type: "QUICK_REPLY", text: "Falar com Atendente" },
      { type: "QUICK_REPLY", text: "Continuar no Chat" },
    ],
  },
  {
    label: "Agendar / Saber Mais",
    emoji: "📅",
    description: "Captação de agendamento",
    buttons: [
      { type: "QUICK_REPLY", text: "Quero Agendar" },
      { type: "QUICK_REPLY", text: "Saber Mais" },
      { type: "QUICK_REPLY", text: "Agora Não" },
    ],
  },
  {
    label: "Aceitar / Recusar Proposta",
    emoji: "📄",
    description: "Resposta a uma oferta ou proposta",
    buttons: [
      { type: "QUICK_REPLY", text: "Aceitar Proposta" },
      { type: "QUICK_REPLY", text: "Recusar" },
    ],
  },
  {
    label: "Ver Site + Contato",
    emoji: "🔗",
    description: "Link para site e resposta rápida",
    buttons: [
      { type: "URL", text: "Visitar Site", url: "https://" },
      { type: "QUICK_REPLY", text: "Falar com Consultor" },
    ],
  },
  {
    label: "Ligar / Mensagem",
    emoji: "📞",
    description: "Opções de contato direto",
    buttons: [
      { type: "PHONE_NUMBER", text: "Ligar Agora", phone_number: "" },
      { type: "QUICK_REPLY", text: "Prefiro Mensagem" },
    ],
  },
  {
    label: "Avaliação Rápida",
    emoji: "⭐",
    description: "Pesquisa de satisfação curta",
    buttons: [
      { type: "QUICK_REPLY", text: "👍 Gostei" },
      { type: "QUICK_REPLY", text: "😐 Regular" },
      { type: "QUICK_REPLY", text: "👎 Não Gostei" },
    ],
  },
  {
    label: "Reconectar Lead",
    emoji: "🔄",
    description: "Reengajamento de leads frios",
    buttons: [
      { type: "QUICK_REPLY", text: "Ainda Tenho Interesse" },
      { type: "QUICK_REPLY", text: "Não Preciso Mais" },
    ],
  },
];

interface ButtonPresetsPickerProps {
  currentCount: number;
  onSelect: (buttons: Omit<PresetButton, "id">[]) => void;
}

export function ButtonPresetsPicker({ currentCount, onSelect }: ButtonPresetsPickerProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-widest">
        <Zap className="w-3.5 h-3.5 text-amber-500" />
        Modelos Rápidos
      </div>
      <div className="grid grid-cols-2 gap-2">
        {BUTTON_PRESETS.map((preset) => {
          const willExceed = preset.buttons.length > 3;
          return (
            <button
              key={preset.label}
              type="button"
              disabled={willExceed}
              onClick={() => onSelect(preset.buttons)}
              title={preset.description}
              className={`
                flex items-start gap-2 p-2.5 rounded-lg border text-left transition-all
                ${willExceed
                  ? "opacity-40 cursor-not-allowed border-zinc-100 bg-zinc-50"
                  : "border-zinc-200 bg-white hover:border-emerald-400 hover:bg-emerald-50/60 hover:shadow-sm cursor-pointer group"
                }
              `}
            >
              <span className="text-base leading-none mt-0.5">{preset.emoji}</span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-zinc-800 group-hover:text-emerald-700 truncate">
                  {preset.label}
                </p>
                <p className="text-[10px] text-zinc-400 truncate">{preset.description}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {preset.buttons.map((b, i) => (
                    <span
                      key={i}
                      className="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500 font-medium"
                    >
                      {b.text}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
