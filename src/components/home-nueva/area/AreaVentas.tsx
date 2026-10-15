import { useEffect, useMemo, useState } from 'react'
import { ChipEstado } from '../ChipEstado'
import { cn } from '@/lib/utils/cn'
import {
  listMockupSolicitudes,
  type MockupSolicitudListRow,
} from '@/lib/supabase/services/mockupSolicitudes.service'
import { fetchComercialSeguimientosClientes } from '@/lib/supabase/services/comercialSeguimientos.service'
import type { ClienteSeguimientoData } from '@/lib/comercial/types'
import { Bloque, Cargando, claveDia, pesos } from './areaUi'
import {
  TRAMOS,
  montoTotal,
  tramosDe,
  useCobros,
  type PedidoCobro,
} from './datos'
import {
  BarraApilada,
  Columnas,
  Leyenda,
  TONOS_URGENCIA,
  Tip,
} from './graficos'

/**
 * Ventas, en gráfico:
 * - Por cobrar: el total y, para Esperando pago (Hecho + Foto enviada) y Deudores, una barra de
 *   antigüedad (hasta 7 días · 8 a 30 · más de 30) — cuanto más naranja, más viejo — y los
 *   pedidos más atrasados.
 * - Mockups de la app sin terminar por estado (los web en "procesando" son abandonos, Q-MOCK-001).
 * - Seguimientos a clientes: enviados por día en la última semana y cuántos quedan para enviar.
 * Los internacionales no suman a los montos (otra moneda).
 */

const ESTADO_MOCKUP: Array<{ clave: string; texto: string }> = [
  { clave: 'procesando', texto: 'Generándose' },
  { clave: 'pendiente_aprobacion', texto: 'Para aprobar' },
  { clave: 'error', texto: 'Con error' },
]

function useMockupsPendientes() {
  const [mockups, setMockups] = useState<MockupSolicitudListRow[] | null>(null)
  useEffect(() => {
    let vivo = true
    const hace14 = Date.now() - 14 * 86400000
    void listMockupSolicitudes(80).then(({ data }) => {
      if (!vivo) return
      setMockups(
        data.filter(
          m =>
            m.origen !== 'web' &&
            m.estado !== 'completado' &&
            new Date(m.created_at as string).getTime() >= hace14
        )
      )
    })
    return () => {
      vivo = false
    }
  }, [])
  return mockups
}

function useSeguimientos() {
  const [d, setD] = useState<ClienteSeguimientoData | null | undefined>(
    undefined
  )
  useEffect(() => {
    let vivo = true
    void fetchComercialSeguimientosClientes()
      .then(x => vivo && setD(x))
      .catch(() => vivo && setD(null))
    return () => {
      vivo = false
    }
  }, [])
  return d
}

/** Una cola de cobro: monto, cantidad, barra de antigüedad y los más atrasados. */
function ColaCobro({
  titulo,
  estado,
  pedidos,
  compacto,
  maxFilas = 3,
}: {
  titulo: string
  /** Estado de venta de la cola: el título va como el chip de Pedidos. */
  estado: 'FOTO_ENVIADA' | 'DEUDOR'
  pedidos: PedidoCobro[]
  compacto?: boolean
  maxFilas?: number
}) {
  const tramos = tramosDe(pedidos)
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <ChipEstado tipo="venta" valor={estado} texto={titulo} />
        <p className="text-[12px] text-white/40">
          {pedidos.length} {pedidos.length === 1 ? 'pedido' : 'pedidos'}
        </p>
      </div>
      <p
        className={cn(
          'mt-1 font-semibold leading-none tabular-nums',
          compacto ? 'text-[20px]' : 'text-[26px]'
        )}
      >
        {pesos(montoTotal(pedidos))}
      </p>
      <div className="mt-3">
        <BarraApilada
          segmentos={tramos.map((t, i) => ({
            texto: t.texto,
            valor: t.pedidos,
            color: TONOS_URGENCIA[i],
            detalle: `${t.pedidos} pedidos · ${pesos(t.monto)}`,
          }))}
        />
      </div>
      {pedidos.length ? (
        <ul className="mt-3 space-y-1">
          {pedidos.slice(0, maxFilas).map(p => (
            <li key={p.id} className="flex items-center gap-2 text-[12px]">
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{
                  backgroundColor:
                    TONOS_URGENCIA[TRAMOS.findIndex(t => p.dias <= t.hasta)],
                }}
              />
              <span className="min-w-0 flex-1 truncate text-white/75">
                {p.cliente}
              </span>
              <span className="shrink-0 tabular-nums text-white/40">
                {p.dias} d
              </span>
              <span className="w-[86px] shrink-0 text-right tabular-nums text-white/85">
                {p.internacional ? 'Internac.' : pesos(p.resta)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function PorCobrar({ compacto }: { compacto?: boolean }) {
  const { esperando, deudores, porCobrar, pedidosEnCobro } = useCobros()
  return (
    <div className="flex min-h-0 flex-col">
      {!compacto ? (
        <p className="flex items-baseline gap-2">
          <span className="text-[34px] font-semibold leading-none tabular-nums">
            {pesos(porCobrar)}
          </span>
          <span className="text-[12px] text-white/45">
            por cobrar en {pedidosEnCobro} pedidos
          </span>
        </p>
      ) : null}
      <div
        className={cn(
          'grid gap-5',
          compacto ? 'grid-cols-1' : 'mt-5 grid-cols-2'
        )}
      >
        <ColaCobro
          titulo="Esperando pago"
          estado="FOTO_ENVIADA"
          pedidos={esperando}
          compacto={compacto}
        />
        <ColaCobro
          titulo="Deudores"
          estado="DEUDOR"
          pedidos={deudores}
          compacto={compacto}
        />
      </div>
      <div className="mt-4">
        <Leyenda
          items={TRAMOS.map((t, i) => ({
            texto: t.texto,
            color: TONOS_URGENCIA[i],
          }))}
        />
      </div>
    </div>
  )
}

function Mockups() {
  const mockups = useMockupsPendientes()
  if (mockups === null) return <Cargando />
  const total = mockups.length
  return (
    <div>
      <p className="flex items-baseline gap-2">
        <span className="text-[26px] font-semibold leading-none tabular-nums">
          {total}
        </span>
        <span className="text-[12px] text-white/45">
          en los últimos 14 días
        </span>
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {ESTADO_MOCKUP.map(e => {
          const n = mockups.filter(m => m.estado === e.clave).length
          const alerta = e.clave === 'error' && n > 0
          return (
            <Tip
              key={e.clave}
              className="flex"
              texto={
                n
                  ? mockups
                      .filter(m => m.estado === e.clave)
                      .slice(0, 6)
                      .map(m => (
                        <span key={m.id} className="block">
                          {m.nombre_muestra || m.nombre_slug}
                        </span>
                      ))
                  : `Ninguno ${e.texto.toLowerCase()}`
              }
            >
              <div
                className={cn(
                  'flex-1 rounded-xl px-3 py-2',
                  alerta ? 'bg-[#f6a33d]/15' : 'bg-white/[0.04]'
                )}
              >
                <p className="text-[18px] font-semibold leading-none tabular-nums">
                  {n}
                </p>
                <p className="mt-1 truncate text-[11px] text-white/45">
                  {e.texto}
                </p>
              </div>
            </Tip>
          )
        })}
      </div>
    </div>
  )
}

function Seguimientos() {
  const d = useSeguimientos()
  const dias = useMemo(() => {
    const out: Array<{
      clave: string
      etiqueta: string
      valor: number
      destacado: boolean
      tip: string
    }> = []
    for (let i = 6; i >= 0; i--) {
      const f = new Date()
      f.setDate(f.getDate() - i)
      const k = claveDia(f)
      const n = (d?.historial ?? []).filter(
        h => h.estado === 'enviado' && claveDia(new Date(h.enviadoAt)) === k
      ).length
      out.push({
        clave: k,
        etiqueta: f
          .toLocaleDateString('es-AR', { weekday: 'narrow' })
          .toUpperCase(),
        valor: n,
        destacado: i === 0,
        tip: `${f.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric' })}: ${n} enviados`,
      })
    }
    return out
  }, [d])
  if (d === undefined) return <Cargando />
  if (d === null || !d.available)
    return <p className="text-[12px] text-white/35">No disponible.</p>
  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <div className="shrink-0">
        <p className="text-[26px] font-semibold leading-none tabular-nums">
          {d.resumen.elegiblesCount}
        </p>
        <p className="mt-1 text-[11px] text-white/45">para enviar</p>
        <p className="mt-3 text-[13px] font-semibold tabular-nums">
          {d.resumen.enviadosUltimos7Dias}
        </p>
        <p className="text-[11px] text-white/45">en 7 días</p>
      </div>
      <div className="min-w-0 flex-1">
        <Columnas datos={dias} />
      </div>
    </div>
  )
}

export function AreaVentas({
  variante = 'panel',
}: {
  variante?: 'panel' | 'compacto'
}) {
  if (variante === 'compacto') return <PorCobrar compacto />
  return (
    <div className="grid h-full min-h-0 grid-cols-2 grid-rows-[minmax(0,1fr)_auto] gap-3">
      <Bloque titulo="Por cobrar" ir="/pedidos" className="col-span-2">
        <PorCobrar />
      </Bloque>
      <Bloque titulo="Mockups sin terminar" ir="/mockups">
        <Mockups />
      </Bloque>
      <Bloque titulo="Seguimientos a clientes" ir="/comercial">
        <Seguimientos />
      </Bloque>
    </div>
  )
}
