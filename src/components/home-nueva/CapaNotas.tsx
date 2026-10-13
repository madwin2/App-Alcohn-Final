import { useCallback, useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { DashboardTask } from '@/lib/supabase/services/dashboard-tasks.service'
import type { NotaPropia } from './useNotas'

/**
 * Post-its de la Home nueva (traídos de la rama local): tarjetas de papel claras, apenas
 * inclinadas, que se arrastran y se marcan "Hecho". Notas propias y notas de compañeros.
 * La nota nueva se escribe en una tarjeta igual, arriba a la derecha (al lado de los botones).
 */

export const TAM_NOTA = 120
const MARGEN = 8

export function CapaNotas({
  propias,
  deCompaneros,
  agregando,
  onCerrarAgregar,
  onAgregar,
  onPropiaHecha,
  onMoverPropia,
  onCompaneroHecha,
  onMoverCompaneroLocal,
  onMoverCompaneroGuardar,
  className,
}: {
  propias: NotaPropia[]
  deCompaneros: DashboardTask[]
  agregando: boolean
  onCerrarAgregar: () => void
  onAgregar: (texto: string, x: number, y: number) => void
  onPropiaHecha: (id: string) => void
  onMoverPropia: (id: string, x: number, y: number) => void
  onCompaneroHecha: (id: string) => void | Promise<void>
  onMoverCompaneroLocal: (id: string, x: number, y: number) => void
  onMoverCompaneroGuardar: (id: string, x: number, y: number) => void
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const ultima = useRef({ x: 0, y: 0 })
  const [arrastre, setArrastre] = useState<{
    id: string
    propia: boolean
    dx: number
    dy: number
  } | null>(null)
  const [saliendo, setSaliendo] = useState<string | null>(null)
  const [borrador, setBorrador] = useState('')
  const [ancho, setAncho] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setAncho(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const empezar = useCallback(
    (
      e: React.PointerEvent,
      id: string,
      x: number,
      y: number,
      propia: boolean
    ) => {
      if ((e.target as HTMLElement).closest('button')) return
      e.preventDefault()
      const rect = ref.current!.getBoundingClientRect()
      setArrastre({
        id,
        propia,
        dx: e.clientX - rect.left - x,
        dy: e.clientY - rect.top - y,
      })
      ultima.current = { x, y }
    },
    []
  )

  useEffect(() => {
    if (!arrastre || !ref.current) return
    const mover = (e: PointerEvent) => {
      const rect = ref.current!.getBoundingClientRect()
      const x = Math.round(
        Math.max(
          0,
          Math.min(rect.width - TAM_NOTA, e.clientX - rect.left - arrastre.dx)
        )
      )
      const y = Math.round(
        Math.max(
          0,
          Math.min(rect.height - TAM_NOTA, e.clientY - rect.top - arrastre.dy)
        )
      )
      ultima.current = { x, y }
      if (arrastre.propia) onMoverPropia(arrastre.id, x, y)
      else onMoverCompaneroLocal(arrastre.id, x, y)
    }
    const soltar = () => {
      if (!arrastre.propia)
        onMoverCompaneroGuardar(arrastre.id, ultima.current.x, ultima.current.y)
      setArrastre(null)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
    return () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
    }
  }, [arrastre, onMoverPropia, onMoverCompaneroLocal, onMoverCompaneroGuardar])

  const hecha = (id: string, fn: () => void | Promise<void>) => {
    setSaliendo(id)
    window.setTimeout(async () => {
      try {
        await fn()
      } finally {
        setSaliendo(null)
      }
    }, 300)
  }

  const cerrar = () => {
    setBorrador('')
    onCerrarAgregar()
  }
  const listo = () => {
    const t = borrador.trim()
    if (!t) return
    // Primer lugar libre de la grilla de arriba a la derecha (al lado de los botones).
    const p = lugarLibre()
    onAgregar(t, p.x, p.y)
    cerrar()
  }

  // Grilla de lugares desde arriba a la derecha, de a dos columnas.
  const lugar = (i: number) => ({
    x: Math.max(0, ancho - TAM_NOTA - MARGEN - (i % 2) * (TAM_NOTA + 16)),
    y: MARGEN + Math.floor(i / 2) * (TAM_NOTA + 16),
  })
  const pisa = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.abs(a.x - b.x) < TAM_NOTA * 0.7 && Math.abs(a.y - b.y) < TAM_NOTA * 0.7

  // Las notas con lugar guardado quedan donde están; las que no tienen lugar (viejas o recién
  // llegadas) van a lugares libres de la grilla, sin taparse entre sí.
  const items = [
    ...propias.map(n => ({
      id: n.id,
      x: n.x,
      y: n.y,
      sin: n.x === 0 && n.y === 0,
    })),
    ...deCompaneros.map(t => ({
      id: t.id,
      x: t.posX ?? 0,
      y: t.posY ?? 0,
      sin: !t.posX && !t.posY,
    })),
  ]
  const usadas = items.filter(i => !i.sin).map(i => ({ x: i.x, y: i.y }))
  const posiciones = new Map<string, { x: number; y: number }>()
  let slot = 0
  const siguienteLibre = () => {
    let p = lugar(slot++)
    while (usadas.some(u => pisa(u, p)) && slot < 80) p = lugar(slot++)
    usadas.push(p)
    return p
  }
  for (const i of items) {
    posiciones.set(i.id, i.sin && ancho ? siguienteLibre() : { x: i.x, y: i.y })
  }
  function lugarLibre() {
    let i = 0
    let p = lugar(i++)
    while (usadas.some(u => pisa(u, p)) && i < 80) p = lugar(i++)
    return p
  }

  return (
    <div ref={ref} className={cn('pointer-events-none relative', className)}>
      {propias.map(n => {
        const pos = posiciones.get(n.id)!
        return (
          <Nota
            key={n.id}
            id={n.id}
            texto={n.text}
            x={pos.x}
            y={pos.y}
            arrastrando={arrastre?.id === n.id}
            saliendo={saliendo === n.id}
            onPointerDown={e => empezar(e, n.id, pos.x, pos.y, true)}
            onHecha={() => hecha(n.id, () => onPropiaHecha(n.id))}
          />
        )
      })}

      {deCompaneros.map(t => {
        const pos = posiciones.get(t.id)!
        return (
          <Nota
            key={t.id}
            id={t.id}
            texto={t.texto}
            de={t.creadoPorNombre}
            x={pos.x}
            y={pos.y}
            arrastrando={arrastre?.id === t.id}
            saliendo={saliendo === t.id}
            className="z-20"
            onPointerDown={e => empezar(e, t.id, pos.x, pos.y, false)}
            onHecha={() => hecha(t.id, () => onCompaneroHecha(t.id))}
          />
        )
      })}

      {agregando ? (
        <div className="pointer-events-auto absolute right-2 top-2 z-40 flex h-[180px] w-[210px] origin-top-right animate-in fade-in-0 zoom-in-95 flex-col rounded-[18px] bg-[#F5F5F3] p-3.5 text-[#0A0A0A] shadow-[0_24px_48px_-16px_rgba(0,0,0,0.8)] duration-200">
          <textarea
            autoFocus
            value={borrador}
            onChange={e => setBorrador(e.target.value)}
            placeholder="Escribí una nota…"
            aria-label="Texto de la nota"
            rows={4}
            className="min-h-0 w-full flex-1 resize-none border-0 bg-transparent text-[13.5px] leading-snug text-[#0A0A0A] outline-none placeholder:text-black/35 focus:ring-0"
            onKeyDown={e => {
              if (e.key === 'Escape') cerrar()
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) listo()
            }}
          />
          <div className="flex shrink-0 items-center justify-end gap-1 pt-2">
            <button
              type="button"
              onClick={cerrar}
              className="rounded-full px-2.5 py-1 text-[12px] font-medium text-black/50 transition-colors hover:text-black"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={listo}
              disabled={!borrador.trim()}
              className="rounded-full bg-black px-3 py-1 text-[12px] font-semibold text-white transition-transform active:scale-95 disabled:opacity-30"
            >
              Listo
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** Inclinación estable por id (entre -2.5° y 2.5°) para que no parezcan alineadas a máquina. */
function inclinacion(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return ((Math.abs(h) % 50) - 25) / 10
}

function Nota({
  id,
  texto,
  de,
  x,
  y,
  arrastrando,
  saliendo,
  className,
  onPointerDown,
  onHecha,
}: {
  id: string
  texto: string
  de?: string
  x: number
  y: number
  arrastrando: boolean
  saliendo: boolean
  className?: string
  onPointerDown: (e: React.PointerEvent) => void
  onHecha: () => void
}) {
  return (
    <div
      className={cn(
        'group pointer-events-auto absolute cursor-grab touch-none select-none transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] active:cursor-grabbing',
        saliendo && 'pointer-events-none scale-0 opacity-0',
        arrastrando && 'z-50 cursor-grabbing transition-none',
        className
      )}
      style={{
        left: x,
        top: y,
        width: TAM_NOTA,
        height: TAM_NOTA,
        transform: arrastrando
          ? 'rotate(0deg) scale(1.05)'
          : `rotate(${inclinacion(id)}deg)`,
      }}
      onPointerDown={onPointerDown}
    >
      <div
        className={cn(
          'flex h-full w-full flex-col rounded-[14px] bg-[#F5F5F3] p-3 text-[#0A0A0A]',
          arrastrando
            ? 'shadow-[0_28px_48px_-12px_rgba(0,0,0,0.85)]'
            : 'shadow-[0_12px_28px_-10px_rgba(0,0,0,0.75)]'
        )}
      >
        {de ? (
          <p className="mb-1 flex items-center gap-1.5 text-[10.5px] font-medium text-black/45">
            <span className="flex size-4 items-center justify-center rounded-full bg-black text-[8px] font-semibold text-white">
              {de.trim().charAt(0).toUpperCase()}
            </span>
            {de.split(' ')[0]}
          </p>
        ) : null}
        <p className="line-clamp-5 whitespace-pre-wrap text-[12.5px] font-medium leading-snug">
          {texto}
        </p>
      </div>
      <button
        type="button"
        onClick={e => {
          e.stopPropagation()
          onHecha()
        }}
        aria-label="Marcar como hecha"
        className="absolute -right-2 -top-2 flex h-7 items-center gap-1 rounded-full bg-black px-2.5 text-[11px] font-semibold text-white opacity-0 shadow-[0_6px_16px_-4px_rgba(0,0,0,0.6)] ring-1 ring-white/15 transition-opacity duration-200 focus-visible:opacity-100 active:scale-95 group-hover:opacity-100"
      >
        <Check className="size-3" strokeWidth={2.5} aria-hidden />
        Hecho
      </button>
    </div>
  )
}
