import type { LucideIcon } from 'lucide-react';
import { HelpCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils/cn';
import { innovacionMutedLabel } from '@/components/innovacion/innovacion-ui';

type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

interface InnovacionIconHintProps {
  hint: string;
  side?: TooltipSide;
  className?: string;
  label?: string;
}

/** Botón ícono accesible (Radix Tooltip) para ayuda contextual. */
export function InnovacionIconHint({
  hint,
  side = 'top',
  className,
  label = 'Más información',
}: InnovacionIconHintProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-zinc-500 transition',
            'hover:border-white/20 hover:bg-white/[0.08] hover:text-zinc-300',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40',
            className,
          )}
          aria-label={label}
        >
          <HelpCircle className="h-3.5 w-3.5" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-[280px] text-left leading-snug">
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}

interface InnovacionFieldLabelProps {
  htmlFor?: string;
  label: string;
  hint?: string;
  hintSide?: TooltipSide;
  className?: string;
}

export function InnovacionFieldLabel({
  htmlFor,
  label,
  hint,
  hintSide = 'right',
  className,
}: InnovacionFieldLabelProps) {
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor} className={cn(innovacionMutedLabel, className)}>
        {label}
      </Label>
      {hint ? <InnovacionIconHint hint={hint} side={hintSide} label={`Ayuda: ${label}`} /> : null}
    </div>
  );
}

interface InnovacionFilterLabelProps {
  label: string;
  hint: string;
}

/** Etiqueta compacta sobre filtros del tablero. */
export function InnovacionFilterLabel({ label, hint }: InnovacionFilterLabelProps) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">{label}</span>
      <InnovacionIconHint hint={hint} side="bottom" className="h-5 w-5" />
    </div>
  );
}

interface InnovacionModalHeaderProps {
  icon: LucideIcon;
  title: string;
  description?: string;
}

/** Cabecera de modal con ícono, título y descripción (Radix DialogTitle + DialogDescription). */
export function InnovacionModalHeader({ icon: Icon, title, description }: InnovacionModalHeaderProps) {
  return (
    <DialogHeader className="space-y-0 sm:text-left">
      <div className="flex gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-amber-500/20 via-amber-500/5 to-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <Icon className="h-5 w-5 text-amber-400/95" aria-hidden />
        </span>
        <div className="min-w-0 space-y-1.5 pt-0.5">
          <DialogTitle className="text-lg font-semibold tracking-tight text-white">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-sm leading-relaxed text-zinc-500">{description}</DialogDescription>
          ) : null}
        </div>
      </div>
    </DialogHeader>
  );
}

interface InnovacionSectionHeadingProps {
  icon?: LucideIcon;
  title: string;
  hint?: string;
}

export function InnovacionSectionHeading({ icon: Icon, title, hint }: InnovacionSectionHeadingProps) {
  return (
    <div className="flex items-center gap-2">
      {Icon ? (
        <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
          <Icon className="h-3.5 w-3.5 text-amber-400/90" aria-hidden />
        </span>
      ) : null}
      <h4 className="text-sm font-medium text-zinc-200">{title}</h4>
      {hint ? <InnovacionIconHint hint={hint} side="right" /> : null}
    </div>
  );
}
