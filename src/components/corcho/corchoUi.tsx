import type { CSSProperties, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils/cn';
import type { EstadoIdeaCorcho } from '@/lib/equipo/corcho';
import { getUserProfileImage } from '@/lib/utils/userImages';

/**
 * Piezas visuales del corcho: todo es papel claro sobre corcho (también las
 * ventanas), con chinche de bronce y sello de goma para el estado.
 */

/** Papel con un toque del color de la persona. */
export function colorPapel(color: string, intensidad = 18): string {
  return `color-mix(in srgb, ${color} ${intensidad}%, #fffdf6)`;
}

/** Ventana de papel (reemplaza el oscuro del resto de la app dentro del corcho). */
export const DIALOGO_PAPEL = cn(
  'max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl border-0 text-zinc-900',
  'shadow-[0_2px_4px_rgba(40,20,5,0.15),0_30px_70px_-20px_rgba(40,20,5,0.6)]',
  // Botón de cerrar (X) de DialogContent: oscuro sobre papel.
  '[&>button:last-child]:text-zinc-600 [&>button:last-child]:hover:text-zinc-950',
);

/** Inputs y textareas sobre papel. */
export const CAMPO_PAPEL =
  'border-zinc-900/15 bg-white/75 text-zinc-900 shadow-none placeholder:text-zinc-400 focus-visible:border-zinc-900/35 focus-visible:ring-2 focus-visible:ring-zinc-900/10 focus-visible:ring-offset-0';

export const BOTON_TINTA =
  'rounded-full bg-zinc-950 text-white shadow-sm hover:bg-zinc-800 disabled:bg-zinc-950 disabled:opacity-35';

export const BOTON_PAPEL =
  'rounded-full border-zinc-900/15 bg-transparent text-zinc-800 shadow-none hover:bg-zinc-900/[0.06] hover:text-zinc-950';

/** Chinche de bronce que sostiene la nota. */
export function Chinche({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <span aria-hidden className={cn('corcho-chinche', className)} style={style} />
  );
}

/** Sello de goma: "Aprobada" en tinta verde, "Descartada" en gris. */
export function SelloEstado({
  estado,
  grande,
  className,
}: {
  estado: EstadoIdeaCorcho;
  grande?: boolean;
  className?: string;
}) {
  if (estado === 'propuesta') return null;
  const aprobada = estado === 'aprobada';
  return (
    <span
      className={cn(
        'corcho-sello',
        aprobada ? 'text-emerald-800' : 'text-zinc-600',
        grande && 'corcho-sello-grande',
        className,
      )}
      title={aprobada ? 'La vamos a hacer' : 'Descartada'}
    >
      {aprobada ? 'Aprobada' : 'Descartada'}
    </span>
  );
}

export function iniciales(nombre: string): string {
  const partes = nombre.replace(/\(.*\)/, '').trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || '?';
}

/**
 * Foto de la persona (la misma del Inicio y Mi perfil) sobre un fondo de su color.
 * Si no tiene foto asignada, sus iniciales.
 */
export function AvatarPersona({
  nombre,
  color,
  size = 'md',
  className,
}: {
  nombre: string;
  color: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const foto = getUserProfileImage(nombre.replace(/\s*\(.*\)\s*$/, ''));
  return (
    <span
      aria-hidden
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white',
        foto
          ? 'shadow-[0_0_0_1.5px_rgba(255,255,255,0.9),0_1px_3px_rgba(40,20,5,0.25)]'
          : 'shadow-[inset_0_-1px_0_rgba(0,0,0,0.15)]',
        size === 'sm' && 'size-6 text-[10px]',
        size === 'md' && 'size-7 text-[11px]',
        size === 'lg' && 'size-9 text-xs',
        className,
      )}
      style={{ backgroundColor: foto ? `color-mix(in srgb, ${color} 45%, #fff)` : color }}
    >
      {foto ? (
        <img
          src={foto}
          alt=""
          draggable={false}
          loading="lazy"
          // El PNG tiene aire alrededor: se agranda un poco para que la cara llene el círculo.
          className="size-full origin-[50%_30%] scale-[1.3] object-cover"
        />
      ) : (
        iniciales(nombre)
      )}
    </span>
  );
}

/** Confirmación en papel (borrar idea o comentario). */
export function ConfirmPapel({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(DIALOGO_PAPEL, 'gap-5 p-6 sm:max-w-sm')}
        style={{ background: '#fffaf0' }}
      >
        <div className="space-y-1.5 pr-6">
          <DialogTitle className="text-lg font-semibold tracking-tight text-zinc-950">
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-zinc-600">
            {description}
          </DialogDescription>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className={BOTON_PAPEL}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="rounded-full bg-rose-700 text-white hover:bg-rose-800"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
