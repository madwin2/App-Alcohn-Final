/**
 * Piezas de la página Gastos: mismo lenguaje que «Mes en curso» (ver controlGastosUi).
 * Filas = etiqueta a la izquierda, monto a la derecha, ✓ de pagado al final.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const nf = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

/**
 * Lee montos como se escriben en Argentina: «1.500.000», «1.500,50», «1500,5» o «1500.5».
 * Un punto seguido de exactamente 3 dígitos (o varios puntos) se toma como separador de miles.
 */
export function parseMonto(texto: string): number {
  let t = texto.replace(/[^\d,.-]/g, '');
  if (t.includes(',')) {
    t = t.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, '');
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

/** Input de monto: muestra separador de miles; al enfocar se edita el número crudo. */
export function MontoInput({
  value,
  onChange,
  disabled,
  ariaLabel,
  className,
  prefijo = '$',
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
  prefijo?: string;
}) {
  const [foco, setFoco] = useState(false);
  const [texto, setTexto] = useState('');

  useEffect(() => {
    if (!foco) setTexto(value ? String(value) : '');
  }, [value, foco]);

  return (
    <div
      className={cn(
        'flex h-9 items-center gap-1 rounded-lg bg-white/[0.04] px-3 text-sm transition-colors focus-within:bg-white/[0.07] focus-within:ring-1 focus-within:ring-white/20',
        disabled && 'opacity-50',
        className,
      )}
    >
      <span className="text-muted-foreground">{prefijo}</span>
      <input
        aria-label={ariaLabel}
        inputMode="decimal"
        disabled={disabled}
        className="w-full min-w-0 bg-transparent text-right tabular-nums outline-none placeholder:text-muted-foreground/50"
        placeholder="0"
        value={foco ? texto : value ? nf.format(value) : ''}
        onFocus={() => {
          setFoco(true);
          setTexto(value ? String(value) : '');
        }}
        onBlur={() => setFoco(false)}
        onChange={(e) => {
          const limpio = e.target.value.replace(/[^\d,.-]/g, '');
          setTexto(limpio);
          onChange(parseMonto(limpio));
        }}
      />
    </div>
  );
}

/** Marca de pagado: círculo que se llena. */
export function PagadoToggle({
  pagado,
  onChange,
  disabled,
  label,
}: {
  pagado: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!pagado)}
      title={pagado ? 'Pagado · tocá para desmarcar' : 'Marcar como pagado'}
      aria-label={`${label}: ${pagado ? 'pagado' : 'sin pagar'}`}
      aria-pressed={pagado}
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors',
        pagado
          ? 'border-emerald-400/70 bg-emerald-400/15 text-emerald-300'
          : 'border-white/15 text-transparent hover:border-white/35 hover:text-white/40',
      )}
    >
      <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
    </button>
  );
}

/** Fila editable: etiqueta · monto · pagado. */
export function FilaMonto({
  label,
  sub,
  value,
  onChange,
  pagado,
  onPagadoChange,
  disabled,
  soloLectura,
  extra,
}: {
  label: ReactNode;
  sub?: ReactNode;
  value: number;
  onChange?: (n: number) => void;
  pagado?: boolean;
  onPagadoChange?: (v: boolean) => void;
  disabled?: boolean;
  /** Monto calculado (no editable). */
  soloLectura?: boolean;
  /** Acción al final (ej. quitar). */
  extra?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{label}</div>
        {sub ? <p className="truncate text-xs text-muted-foreground">{sub}</p> : null}
      </div>
      {soloLectura || !onChange ? (
        <span className="w-40 shrink-0 px-3 text-right text-sm tabular-nums text-muted-foreground">
          $ {nf.format(Math.round(value))}
        </span>
      ) : (
        <MontoInput
          className="w-40 shrink-0"
          ariaLabel={typeof label === 'string' ? label : 'Monto'}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      )}
      {onPagadoChange ? (
        <PagadoToggle
          pagado={!!pagado}
          onChange={onPagadoChange}
          disabled={disabled || !(value > 0)}
          label={typeof label === 'string' ? label : 'Gasto'}
        />
      ) : (
        <span className="size-6 shrink-0" aria-hidden />
      )}
      {extra !== undefined ? <div className="w-6 shrink-0">{extra}</div> : null}
    </div>
  );
}

/** Subtítulo de grupo dentro de un panel, con total a la derecha. */
export function Grupo({ titulo, total, children }: { titulo: string; total?: string; children: ReactNode }) {
  return (
    <div className="pt-4 first:pt-0">
      <div className="mb-1 flex items-baseline justify-between gap-3 border-b border-white/[0.06] pb-2">
        <h4 className="text-[13px] text-muted-foreground">{titulo}</h4>
        {total ? <span className="text-[13px] tabular-nums text-muted-foreground">{total}</span> : null}
      </div>
      <div className="divide-y divide-white/[0.04]">{children}</div>
    </div>
  );
}

export function BotonQuitar({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-6 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-white/[0.06] hover:text-foreground"
    >
      <X className="size-3.5" aria-hidden />
    </button>
  );
}

/** ‹ Octubre 2026 › con acceso al mes actual. */
export function MesSelector({
  mes,
  etiqueta,
  onChange,
  mesActual,
}: {
  mes: string;
  etiqueta: string;
  onChange: (mes: string) => void;
  mesActual: string;
}) {
  const mover = (delta: number) => {
    const [y, m] = mes.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const flecha = 'flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground';
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center rounded-full bg-white/[0.05] p-0.5">
        <button type="button" className={flecha} onClick={() => mover(-1)} aria-label="Mes anterior">
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <label className="relative cursor-pointer px-2 text-sm font-medium capitalize">
          {etiqueta}
          <input
            type="month"
            value={mes}
            onChange={(e) => e.target.value && onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Elegir mes"
          />
        </label>
        <button type="button" className={flecha} onClick={() => mover(1)} aria-label="Mes siguiente">
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
      {mes !== mesActual ? (
        <button
          type="button"
          onClick={() => onChange(mesActual)}
          className="rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
        >
          Ir al mes actual
        </button>
      ) : null}
    </div>
  );
}
