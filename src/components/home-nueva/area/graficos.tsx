import type { ReactNode } from 'react'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useAparecer } from '../movimiento'

/**
 * Gráficos chicos de los paneles de la Home nueva (SVG/HTML, sin librerías).
 * Criterio (skill de visualización): las magnitudes en UN tono (naranja, de apagado a intenso);
 * el naranja fuerte con ícono queda para alertas; los textos siempre en grises de la interfaz,
 * nunca del color de la serie; marcas finas con puntas redondeadas y 2px de separación entre
 * segmentos; cada marca tiene tooltip al pasar el mouse.
 *
 * Movimiento: al aparecer, barras, columnas y anillos crecen desde cero (700 ms, la curva de la
 * Home) y en cascada; los cambios de valor después se animan igual.
 */

/** Tooltip liviano (aparece arriba de la marca al pasar el mouse). */
export function Tip({
  children,
  texto,
  className,
}: {
  children: ReactNode
  texto: ReactNode
  className?: string
}) {
  return (
    <span className={cn('group/tip relative', className)}>
      {children}
      <span className="tema-fijo pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-max max-w-[220px] rounded-lg bg-black/90 px-2.5 py-1.5 text-[11.5px] leading-snug text-white/90 opacity-0 shadow-xl transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] [transform:translate(-50%,4px)_scale(0.96)] group-hover/tip:opacity-100 group-hover/tip:delay-75 group-hover/tip:[transform:translate(-50%,0)_scale(1)]">
        {texto}
      </span>
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Flujo de etapas: nodos conectados, el tamaño del número dice cuánto  */
/* ------------------------------------------------------------------ */

export type EtapaFlujo = {
  texto: string
  n: number
  alerta?: boolean
  detalle?: ReactNode
  /** Color del estado (r,g,b), el mismo de los chips de la página: tiñe el nodo. */
  color?: string
}

export function Flujo({
  etapas,
  compacto,
}: {
  etapas: EtapaFlujo[]
  compacto?: boolean
}) {
  const max = Math.max(1, ...etapas.map(e => e.n))
  return (
    <div className="entrada-lista flex items-stretch">
      {etapas.map((e, i) => {
        const peso = e.n / max // 0..1: intensidad del nodo
        return (
          <div key={e.texto} className="flex min-w-0 flex-1 items-stretch">
            <Tip
              className="flex min-w-0 flex-1"
              texto={
                <>
                  <b className="font-semibold">{e.n}</b> {e.texto.toLowerCase()}
                  {e.detalle ? (
                    <span className="block text-white/60">{e.detalle}</span>
                  ) : null}
                </>
              }
            >
              <div
                className={cn(
                  'flex min-w-0 flex-1 flex-col justify-between rounded-2xl transition-[background-color,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
                  compacto ? 'px-2.5 py-2' : 'px-3.5 py-3',
                  e.alerta && e.n > 0 ? 'ring-1 ring-[#f6a33d]/60' : ''
                )}
                style={
                  e.color
                    ? {
                        // Color del estado, más intenso cuanto más hay.
                        backgroundColor: `rgba(${e.color},${e.n ? 0.07 + 0.15 * peso : 0.03})`,
                        boxShadow: `inset 0 0 0 1px rgba(${e.color},${e.n ? 0.3 + 0.35 * peso : 0.12})`,
                      }
                    : {
                        // Fondo según cuánto hay en la etapa (un solo tono, de apagado a intenso).
                        backgroundColor:
                          e.alerta && e.n > 0
                            ? 'rgba(246,163,61,0.16)'
                            : `rgba(224,107,23,${0.05 + 0.22 * peso})`,
                      }
                }
              >
                <p
                  className={cn(
                    'flex items-center gap-1 truncate text-white/60',
                    compacto ? 'text-[10.5px]' : 'text-[12px]'
                  )}
                >
                  {e.alerta && e.n > 0 ? (
                    <AlertTriangle className="size-3 shrink-0 text-[#f6a33d]" />
                  ) : e.color ? (
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: `rgb(${e.color})` }}
                    />
                  ) : null}
                  <span className="truncate">{e.texto}</span>
                </p>
                <p
                  className={cn(
                    'font-semibold leading-none tabular-nums',
                    compacto ? 'mt-1 text-[18px]' : 'mt-2 text-[30px]',
                    e.n === 0 && 'text-white/30'
                  )}
                >
                  {e.n}
                </p>
                {!compacto && e.detalle ? (
                  <div className="mt-2 text-[11px] text-white/45">
                    {e.detalle}
                  </div>
                ) : null}
              </div>
            </Tip>
            {i < etapas.length - 1 ? (
              <ChevronRight
                className={cn(
                  'shrink-0 self-center text-white/20',
                  compacto ? 'mx-0 size-3' : 'mx-0.5 size-4'
                )}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Barra apilada (antigüedad): segmentos con 2px de separación          */
/* ------------------------------------------------------------------ */

/** Tonos de urgencia: de neutro (nuevo) a naranja intenso (viejo). */
export const TONOS_URGENCIA = ['rgba(255,255,255,0.28)', '#c4621f', '#f6a33d']

export function BarraApilada({
  segmentos,
  alto = 10,
}: {
  segmentos: Array<{
    texto: string
    valor: number
    color: string
    detalle?: ReactNode
  }>
  alto?: number
}) {
  const listo = useAparecer()
  const visibles = segmentos.filter(s => s.valor > 0)
  if (visibles.length === 0)
    return (
      <div className="rounded-full bg-white/[0.06]" style={{ height: alto }} />
    )
  return (
    // Se descubre de izquierda a derecha al aparecer (recorte, sin deformar las puntas).
    <div
      className="flex gap-[2px] transition-[clip-path] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
      style={{
        height: alto,
        clipPath: listo
          ? 'inset(-12px -12px -12px -12px)'
          : 'inset(0 100% 0 0)',
      }}
    >
      {visibles.map(s => (
        <div
          key={s.texto}
          className="h-full min-w-[6px] transition-[flex-grow] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ flex: `${s.valor} 1 0px` }}
        >
          <Tip
            className="flex h-full w-full"
            texto={
              <>
                {s.texto}:{' '}
                <b className="font-semibold">{s.detalle ?? s.valor}</b>
              </>
            }
          >
            <span
              className="block h-full w-full rounded-[4px]"
              style={{ backgroundColor: s.color }}
            />
          </Tip>
        </div>
      ))}
    </div>
  )
}

/** Leyenda: punto de color + texto en gris + valor. */
export function Leyenda({
  items,
}: {
  items: Array<{ texto: string; color: string; valor?: ReactNode }>
}) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map(i => (
        <li
          key={i.texto}
          className="flex items-center gap-1.5 text-[11.5px] text-white/50"
        >
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: i.color }}
          />
          {i.texto}
          {i.valor != null ? (
            <span className="tabular-nums text-white/80">{i.valor}</span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/* ------------------------------------------------------------------ */
/* Barras horizontales (comparar magnitudes con etiqueta directa)       */
/* ------------------------------------------------------------------ */

export function BarrasH({
  items,
  formato = n => n.toLocaleString('es-AR'),
}: {
  items: Array<{ texto: string; valor: number; tip?: ReactNode }>
  formato?: (n: number) => string
}) {
  const listo = useAparecer()
  const max = Math.max(1, ...items.map(i => i.valor))
  return (
    <ul className="space-y-2.5">
      {items.map((i, n) => (
        <li key={i.texto}>
          <Tip
            className="block"
            texto={i.tip ?? `${i.texto}: ${formato(i.valor)}`}
          >
            <div className="mb-1 flex items-baseline justify-between gap-2 text-[12px]">
              <span className="truncate text-white/60">{i.texto}</span>
              <span className="shrink-0 tabular-nums text-white/85">
                {formato(i.valor)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#94300a] via-[#e06b17] to-[#f6a33d] transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{
                  width: listo ? `${(100 * i.valor) / max}%` : '0%',
                  transitionDelay: `${Math.min(n, 8) * 40}ms`,
                }}
              />
            </div>
          </Tip>
        </li>
      ))}
    </ul>
  )
}

/* ------------------------------------------------------------------ */
/* Columnas (cantidad por día)                                          */
/* ------------------------------------------------------------------ */

export function Columnas({
  datos,
}: {
  datos: Array<{
    clave: string
    etiqueta: string
    valor: number
    destacado?: boolean
    tenue?: boolean
    tip: ReactNode
  }>
}) {
  const listo = useAparecer()
  const max = Math.max(1, ...datos.map(d => d.valor))
  return (
    <div className="flex h-full min-h-[90px] items-stretch gap-1.5">
      {datos.map((d, n) => (
        <Tip key={d.clave} className="flex min-w-0 flex-1" texto={d.tip}>
          <div className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10.5px] tabular-nums text-white/55">
              {d.valor || ''}
            </span>
            <div className="flex w-full flex-1 items-end">
              <div
                className={cn(
                  'w-full rounded-t-[4px] transition-[height,background-color] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]',
                  d.destacado
                    ? 'bg-gradient-to-t from-[#94300a] via-[#e06b17] to-[#f6a33d]'
                    : d.tenue
                      ? 'bg-white/[0.08]'
                      : 'bg-white/[0.22] hover:bg-white/[0.35]'
                )}
                style={{
                  height: listo
                    ? `${Math.max(2, (100 * d.valor) / max)}%`
                    : '2%',
                  transitionDelay: `${Math.min(n, 14) * 25}ms`,
                }}
              />
            </div>
            <span
              className={cn(
                'text-[10px] tabular-nums',
                d.destacado ? 'text-white' : 'text-white/35'
              )}
            >
              {d.etiqueta}
            </span>
          </div>
        </Tip>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Anillo de progreso (una proporción)                                  */
/* ------------------------------------------------------------------ */

export function Anillo({
  valor,
  max,
  tam = 96,
  grosor = 8,
  centro,
  tip,
}: {
  valor: number
  max: number
  tam?: number
  grosor?: number
  centro: ReactNode
  tip?: ReactNode
}) {
  const r = (tam - grosor) / 2
  const c = 2 * Math.PI * r
  const listo = useAparecer()
  const p = listo ? Math.max(0, Math.min(1, max > 0 ? valor / max : 0)) : 0
  const id = `anillo-${tam}-${grosor}`
  return (
    <Tip texto={tip ?? `${valor} de ${max}`} className="inline-flex">
      <div className="relative shrink-0" style={{ width: tam, height: tam }}>
        <svg width={tam} height={tam} className="-rotate-90">
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f6a33d" />
              <stop offset="100%" stopColor="#c4621f" />
            </linearGradient>
          </defs>
          <circle
            cx={tam / 2}
            cy={tam / 2}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth={grosor}
          />
          <circle
            cx={tam / 2}
            cy={tam / 2}
            r={r}
            fill="none"
            stroke={`url(#${id})`}
            strokeWidth={grosor}
            strokeLinecap="round"
            strokeDasharray={`${c * p} ${c}`}
            className="transition-[stroke-dasharray] duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)]"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {centro}
        </div>
      </div>
    </Tip>
  )
}

/* ------------------------------------------------------------------ */
/* Línea de horas (cuándo pasó cada cosa en el día)                     */
/* ------------------------------------------------------------------ */

export function LineaHoras({
  puntos,
  desde = 8,
  hasta = 21,
}: {
  puntos: Array<{
    clave: string
    hora: number
    tip: ReactNode
    resaltado?: boolean
  }>
  desde?: number
  hasta?: number
}) {
  const ahoraD = new Date()
  const ahora = ahoraD.getHours() + ahoraD.getMinutes() / 60
  const pos = (h: number) =>
    `${(100 * (Math.min(hasta, Math.max(desde, h)) - desde)) / (hasta - desde)}%`
  const listo = useAparecer()
  const marcas: number[] = []
  for (let h = desde; h <= hasta; h += 2) marcas.push(h)
  return (
    <div className="relative h-11">
      {/* Eje del día; lo que ya pasó, un poco más claro */}
      <div className="absolute inset-x-0 top-3 h-[3px] rounded-full bg-white/[0.08]">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-white/[0.18] transition-[width] duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ width: listo ? pos(ahora) : '0%' }}
        />
      </div>
      {marcas.map(h => (
        <span
          key={h}
          className="absolute top-6 -translate-x-1/2 text-[10px] tabular-nums text-white/30"
          style={{ left: pos(h) }}
        >
          {h}h
        </span>
      ))}
      {puntos.map(p => (
        <span
          key={p.clave}
          className="absolute top-[13.5px]"
          style={{ left: pos(p.hora) }}
        >
          <Tip
            texto={p.tip}
            className="absolute -translate-x-1/2 -translate-y-1/2"
          >
            <span
              className={cn(
                'block size-3 rounded-full ring-2 ring-black/80 transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.34,1.3,0.64,1)] hover:scale-125',
                listo ? 'scale-100 opacity-100' : 'scale-0 opacity-0',
                p.resaltado ? 'bg-[#f6a33d]' : 'bg-[#e06b17]'
              )}
            />
          </Tip>
        </span>
      ))}
    </div>
  )
}
