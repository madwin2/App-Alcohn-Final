import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface EnviosCollapsibleSectionProps {
  title: string;
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  empty?: ReactNode;
  className?: string;
  /**
   * section: header suelto + card (Correo / Via Cargo solos).
   * panel: una card que agrupa hijas (como Envíos Andreani).
   * plain: fila interna, sin card extra.
   */
  variant?: 'section' | 'panel' | 'plain';
}

export function EnviosCollapsibleSection({
  title,
  count,
  open,
  onOpenChange,
  actions,
  description,
  children,
  empty,
  className,
  variant = 'section',
}: EnviosCollapsibleSectionProps) {
  const isPlain = variant === 'plain';
  const titleClass = isPlain
    ? 'inline-flex min-w-0 items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground'
    : 'inline-flex min-w-0 items-center gap-1.5 rounded-md py-1 text-sm font-semibold text-foreground';

  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => onOpenChange(!open)} className={titleClass}>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{title}</span>
        <span className="tabular-nums text-muted-foreground">({count})</span>
      </button>
      {open && actions ? <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );

  if (variant === 'panel') {
    return (
      <section className={cn('space-y-3 rounded-2xl border border-white/10 bg-card/50 p-3', className)}>
        {header}
        {open ? <div className="space-y-3">{children}</div> : null}
      </section>
    );
  }

  return (
    <section className={cn('min-w-0', className)}>
      {header}
      {open ? (
        count > 0 ? (
          <>
            {description ? (
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{description}</p>
            ) : null}
            {isPlain ? (
              <div className="mt-2 overflow-hidden rounded-lg border border-white/10">{children}</div>
            ) : (
              <div className="mt-2 overflow-hidden rounded-2xl border border-white/10 bg-card/50">{children}</div>
            )}
          </>
        ) : (
          <p className="mt-1 pl-5 text-xs text-muted-foreground">{empty ?? 'No hay nada en esta sección.'}</p>
        )
      ) : null}
    </section>
  );
}
