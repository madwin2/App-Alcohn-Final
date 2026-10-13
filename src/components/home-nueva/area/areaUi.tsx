import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/**
 * Piezas visuales de los paneles de área de la Home nueva: bloques internos sin borde, etiquetas
 * grises en minúscula, números grandes y filas de lista. Mismo lenguaje que la tarjeta de perfil.
 */

export const GRADIENTE =
  'bg-gradient-to-r from-[#94300a] via-[#e06b17] to-[#f6a33d]'

/** Bloque interno del panel (superficie apenas más clara que la tarjeta). */
export function Bloque({
  titulo,
  ir,
  derecha,
  children,
  className,
}: {
  titulo: ReactNode
  /** Ruta de la pantalla con el detalle. */
  ir?: string
  derecha?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'flex min-h-0 flex-col rounded-[22px] bg-white/[0.03] p-4',
        className
      )}
    >
      <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
        <p className="truncate text-[13px] text-white/55">{titulo}</p>
        <span className="flex shrink-0 items-center gap-2">
          {derecha}
          {ir ? (
            <Link
              to={ir}
              className="rounded-full p-1 text-white/30 transition-colors hover:text-white/85"
              aria-label="Ver el detalle"
            >
              <ArrowUpRight className="size-3.5" />
            </Link>
          ) : null}
        </span>
      </div>
      {children}
    </section>
  )
}

/** Número grande con su etiqueta. */
export function Numero({
  valor,
  etiqueta,
  sub,
  resaltado,
  chico,
}: {
  valor: ReactNode
  etiqueta?: ReactNode
  sub?: ReactNode
  resaltado?: boolean
  chico?: boolean
}) {
  return (
    <div className="min-w-0">
      <p
        className={cn(
          'font-semibold leading-none tabular-nums',
          chico ? 'text-[22px]' : 'text-[32px]',
          resaltado && 'text-[#f6a33d]'
        )}
      >
        {valor}
      </p>
      {etiqueta ? (
        <p className="mt-1.5 truncate text-[12px] text-white/50">{etiqueta}</p>
      ) : null}
      {sub ? (
        <p className="mt-0.5 truncate text-[11px] text-white/30">{sub}</p>
      ) : null}
    </div>
  )
}

/** Fila de lista: algo a la izquierda (opcional), título + detalle, y un valor a la derecha. */
export function Fila({
  izquierda,
  titulo,
  detalle,
  derecha,
  subDerecha,
  alerta,
}: {
  izquierda?: ReactNode
  titulo: ReactNode
  detalle?: ReactNode
  derecha?: ReactNode
  subDerecha?: ReactNode
  alerta?: boolean
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.04]">
      {izquierda}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px]">{titulo}</p>
        {detalle ? (
          <p className="truncate text-[11.5px] text-white/40">{detalle}</p>
        ) : null}
      </div>
      {derecha != null ? (
        <div className="shrink-0 text-right">
          <p
            className={cn(
              'text-[13px] tabular-nums',
              alerta ? 'font-semibold text-[#f6a33d]' : 'text-white/85'
            )}
          >
            {derecha}
          </p>
          {subDerecha ? (
            <p className="text-[11px] text-white/35">{subDerecha}</p>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

export function Vacio({ children }: { children: ReactNode }) {
  return (
    <p className="flex flex-1 items-center justify-center py-6 text-center text-[13px] text-white/35">
      {children}
    </p>
  )
}

export function Cargando() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map(k => (
        <div key={k} className="h-9 animate-pulse rounded-xl bg-white/[0.04]" />
      ))}
    </div>
  )
}

/** Lista con scroll interno (para bloques que pueden tener muchas filas). */
export function Lista({ children }: { children: ReactNode }) {
  return (
    <ul className="-mx-2 min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
      {children}
    </ul>
  )
}

export function pesos(n: number) {
  return `$ ${Math.round(n).toLocaleString('es-AR')}`
}

export function nombreCliente(
  c: { firstName?: string; lastName?: string } | null | undefined
) {
  return `${c?.firstName ?? ''} ${c?.lastName ?? ''}`.trim() || 'Sin cliente'
}

/** Clave YYYY-MM-DD local. */
export function claveDia(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "hace 3 días", "hoy", "ayer" a partir de una fecha ISO. */
export function hace(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const dias = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  return `hace ${dias} días`
}
