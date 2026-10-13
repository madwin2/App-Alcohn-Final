import { useEffect, useMemo, useState } from 'react'
import { ThumbsDown, ThumbsUp } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import {
  getIdeasCorcho,
  type IdeaCorcho,
} from '@/lib/supabase/services/equipoCorcho.service'
import { Bloque, Cargando, Vacio, hace, nombreCliente } from './areaUi'
import { usePedidosDeHoy } from './datos'
import { BarraApilada, Leyenda, LineaHoras } from './graficos'

/**
 * Equipo (para cualquiera), en gráfico:
 * - Hoy: los pedidos que entraron, sobre una línea de horas (cada punto es un pedido; en ámbar
 *   los que vinieron por la web), y cuántos fueron por la web y cuántos cargados a mano.
 * - Corcho: las ideas activas como tarjetitas, con sus votos (las que no viste, primero).
 */

const ESTADO_IDEA: Record<string, string> = {
  propuesta: 'Propuesta',
  aprobada: 'Aprobada',
  descartada: 'Descartada',
}

export function useIdeasActivas() {
  const [ideas, setIdeas] = useState<IdeaCorcho[] | null>(null)
  useEffect(() => {
    let vivo = true
    void getIdeasCorcho()
      .then(i => vivo && setIdeas(i.filter(x => x.estado !== 'descartada')))
      .catch(() => vivo && setIdeas([]))
    return () => {
      vivo = false
    }
  }, [])
  return useMemo(
    () =>
      ideas === null
        ? null
        : [...ideas].sort(
            (a, b) =>
              Number(a.vistaPorMi) - Number(b.vistaPorMi) ||
              b.createdAt.localeCompare(a.createdAt)
          ),
    [ideas]
  )
}

const esWeb = (o: { origen?: string | null }) =>
  (o.origen ?? '').toLowerCase() === 'web'

export function HoyEnPedidos({ compacto }: { compacto?: boolean }) {
  const deHoy = usePedidosDeHoy()
  const web = deHoy.filter(esWeb).length
  const items = deHoy.reduce((s, o) => s + o.items.length, 0)
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <p className="flex items-baseline gap-2">
          <span
            className={cn(
              'font-semibold leading-none tabular-nums',
              compacto ? 'text-[24px]' : 'text-[34px]'
            )}
          >
            {deHoy.length}
          </span>
          <span className="text-[12px] text-white/45">
            {deHoy.length === 1 ? 'pedido' : 'pedidos'} · {items} ítems
          </span>
        </p>
        {deHoy.length ? (
          <div className="w-[45%] min-w-[140px]">
            <BarraApilada
              alto={8}
              segmentos={[
                { texto: 'Por la web', valor: web, color: '#f6a33d' },
                {
                  texto: 'Cargados a mano',
                  valor: deHoy.length - web,
                  color: '#c4621f',
                },
              ]}
            />
            <div className="mt-2">
              <Leyenda
                items={[
                  { texto: 'Web', color: '#f6a33d', valor: web },
                  {
                    texto: 'A mano',
                    color: '#c4621f',
                    valor: deHoy.length - web,
                  },
                ]}
              />
            </div>
          </div>
        ) : null}
      </div>
      <div className="mt-4">
        <LineaHoras
          puntos={deHoy.map(o => {
            const f = new Date(o.createdAt!)
            return {
              clave: o.id,
              hora: f.getHours() + f.getMinutes() / 60,
              resaltado: esWeb(o),
              tip: (
                <>
                  <b className="font-semibold">{nombreCliente(o.customer)}</b>
                  <span className="block text-white/60">
                    {f.toLocaleTimeString('es-AR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    ·{' '}
                    {esWeb(o)
                      ? 'web'
                      : o.takenBy?.name
                        ? `cargó ${o.takenBy.name.split(/\s+/)[0]}`
                        : 'a mano'}
                  </span>
                </>
              ),
            }
          })}
        />
      </div>
      {deHoy.length === 0 ? (
        <p className="text-[12px] text-white/35">
          Todavía no entró ningún pedido hoy.
        </p>
      ) : null}
    </div>
  )
}

export function IdeasCorcho({ max }: { max?: number }) {
  const ideas = useIdeasActivas()
  if (ideas === null) return <Cargando />
  if (ideas.length === 0) return <Vacio>No hay ideas activas.</Vacio>
  return (
    <ul className="-mx-1 min-h-0 flex-1 space-y-2 overflow-y-auto px-1 [scrollbar-width:thin]">
      {ideas.slice(0, max).map(i => {
        const a = i.votos.filter(v => v.valor > 0).length
        const e = i.votos.filter(v => v.valor < 0).length
        return (
          <li
            key={i.id}
            className={cn(
              'rounded-xl px-3 py-2.5 transition-colors',
              i.vistaPorMi ? 'bg-white/[0.03]' : 'bg-[#f6a33d]/[0.08]'
            )}
          >
            <div className="flex items-start gap-2">
              {!i.vistaPorMi ? (
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#f6a33d] shadow-[0_0_8px_rgba(246,163,61,0.9)]" />
              ) : null}
              <p className="min-w-0 flex-1 text-[13px] leading-snug">
                {i.titulo}
              </p>
            </div>
            <div className="mt-2 flex items-center gap-3 text-[11px] text-white/45">
              <span>{ESTADO_IDEA[i.estado] ?? i.estado}</span>
              <span>{hace(i.createdAt)}</span>
              <span className="ml-auto flex items-center gap-2.5 tabular-nums">
                <span className="flex items-center gap-1">
                  <ThumbsUp className="size-3" /> {a}
                </span>
                <span className="flex items-center gap-1">
                  <ThumbsDown className="size-3" /> {e}
                </span>
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function AreaEquipo({
  variante = 'panel',
}: {
  variante?: 'panel' | 'compacto'
}) {
  const ideas = useIdeasActivas()
  const nuevas = (ideas ?? []).filter(i => !i.vistaPorMi).length

  if (variante === 'compacto') {
    return (
      <div className="space-y-4">
        <HoyEnPedidos compacto />
        <div className="flex max-h-[240px] min-h-0 flex-col">
          <IdeasCorcho max={4} />
        </div>
      </div>
    )
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-3">
      <Bloque titulo="Hoy" ir="/pedidos">
        <HoyEnPedidos />
      </Bloque>
      <Bloque
        titulo="Corcho de ideas"
        ir="/corcho"
        derecha={
          nuevas ? (
            <span className="text-[12px] text-[#f6a33d]">{nuevas} sin ver</span>
          ) : null
        }
      >
        <IdeasCorcho />
      </Bloque>
    </div>
  )
}
