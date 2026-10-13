import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useGastosAuto } from '@/lib/hooks/useGastosAuto'
import { PROVEEDOR_LABEL } from '@/lib/gastos/gastosAuto'
import { Bloque, Cargando, claveDia, pesos } from './areaUi'
import { useCobros, useMesEnPedidos } from './datos'
import { BarrasH, Columnas, Tip } from './graficos'

/**
 * Administración (solo el dueño, mismo criterio que Economía), en gráfico:
 * - Pedidos cargados del mes y la comparación con el mes anterior a la misma altura.
 *   🔶 Aproximado (suma de pedidos Venta nacionales); el exacto es el de Economía.
 * - Por cobrar: solo pedidos en Esperando pago o Deudores (mismo criterio que Ventas).
 * - Publicidad del mes por plataforma (Control de gastos, pesos con IVA) y por sello vendido.
 * - Pedidos por día, últimos 14 días.
 */

function usePublicidad(mes: string) {
  const gastos = useGastosAuto(true)
  const val = gastos.porMes[mes]
  const total = val?.porCategoria.publicidad ?? null
  const porPlataforma = new Map<string, number>()
  for (const c of val?.conceptos ?? []) {
    if (c.categoria !== 'publicidad') continue
    const k = PROVEEDOR_LABEL[c.proveedor] ?? c.proveedor
    porPlataforma.set(k, (porPlataforma.get(k) ?? 0) + c.ars)
  }
  return {
    cargando: gastos.loading && !gastos.data,
    total,
    porPlataforma: [...porPlataforma.entries()].sort((a, b) => b[1] - a[1]),
  }
}

function Variacion({ actual, anterior }: { actual: number; anterior: number }) {
  if (anterior <= 0) return null
  const v = (actual - anterior) / anterior
  const sube = v >= 0
  const Icono = sube ? ArrowUpRight : ArrowDownRight
  return (
    <Tip texto={`El mes anterior, a esta altura: ${pesos(anterior)}`}>
      <span
        className={cn(
          'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11.5px] font-semibold tabular-nums',
          sube
            ? 'bg-white/[0.08] text-white/85'
            : 'bg-[#f6a33d]/15 text-[#f6a33d]'
        )}
      >
        <Icono className="size-3" />
        {Math.abs(Math.round(v * 100))}%
      </span>
    </Tip>
  )
}

export function ResumenMes({ compacto }: { compacto?: boolean }) {
  const m = useMesEnPedidos()
  const { porCobrar, pedidosEnCobro } = useCobros()
  const pub = usePublicidad(m.mes)
  const porSello =
    pub.total != null && m.sellos > 0 ? pub.total / m.sellos : null
  return (
    <div className={cn('grid gap-4', compacto ? 'grid-cols-2' : 'grid-cols-4')}>
      <div className="min-w-0">
        <p className="text-[12px] text-white/50">Cargado en pedidos</p>
        <p
          className={cn(
            'mt-1 font-semibold leading-none tabular-nums',
            compacto ? 'text-[18px]' : 'text-[24px]'
          )}
        >
          {pesos(m.cargado)}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <Variacion actual={m.cargado} anterior={m.cargadoAnt} />
          {!compacto ? (
            <span className="text-[11px] text-white/30">vs. mes anterior</span>
          ) : null}
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-[12px] text-white/50">Por cobrar</p>
        <p
          className={cn(
            'mt-1 font-semibold leading-none tabular-nums',
            compacto ? 'text-[18px]' : 'text-[24px]'
          )}
        >
          {pesos(porCobrar)}
        </p>
        <p className="mt-1.5 text-[11px] text-white/35">
          {pedidosEnCobro} pedidos
        </p>
      </div>
      <div className="min-w-0">
        <p className="text-[12px] text-white/50">Publicidad</p>
        <p
          className={cn(
            'mt-1 font-semibold leading-none tabular-nums',
            compacto ? 'text-[18px]' : 'text-[24px]'
          )}
        >
          {pub.cargando ? '…' : pub.total != null ? pesos(pub.total) : '—'}
        </p>
        <p className="mt-1.5 text-[11px] text-white/35">con IVA, este mes</p>
      </div>
      <div className="min-w-0">
        <p className="text-[12px] text-white/50">Publicidad por sello</p>
        <p
          className={cn(
            'mt-1 font-semibold leading-none tabular-nums text-[#f6a33d]',
            compacto ? 'text-[18px]' : 'text-[24px]'
          )}
        >
          {porSello != null ? pesos(porSello) : '—'}
        </p>
        <p className="mt-1.5 text-[11px] text-white/35">
          {m.sellos} sellos vendidos
        </p>
      </div>
    </div>
  )
}

export function PedidosPorDia() {
  const m = useMesEnPedidos()
  const hoy = claveDia(new Date())
  return (
    <Columnas
      datos={m.ultimos.map(d => {
        const f = new Date(`${d.dia}T12:00:00`)
        const finde = [0, 6].includes(f.getDay())
        return {
          clave: d.dia,
          etiqueta: String(Number(d.dia.slice(8))),
          valor: d.n,
          destacado: d.dia === hoy,
          tenue: finde,
          tip: `${f.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' })}: ${d.n} pedidos`,
        }
      })}
    />
  )
}

function PublicidadPorPlataforma() {
  const m = useMesEnPedidos()
  const pub = usePublicidad(m.mes)
  if (pub.cargando) return <Cargando />
  if (!pub.porPlataforma.length)
    return (
      <p className="text-[12px] text-white/35">
        Sin datos de publicidad este mes.
      </p>
    )
  return (
    <BarrasH
      items={pub.porPlataforma.map(([texto, valor]) => ({ texto, valor }))}
      formato={pesos}
    />
  )
}

export function AreaAdministracion({
  variante = 'panel',
}: {
  variante?: 'panel' | 'compacto'
}) {
  const m = useMesEnPedidos()
  const nombreMes = new Date(`${m.mes}-15T12:00:00`).toLocaleDateString(
    'es-AR',
    { month: 'long' }
  )

  if (variante === 'compacto') return <ResumenMes compacto />

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] gap-3">
      <Bloque
        titulo={
          <span className="first-letter:uppercase">{nombreMes} hasta hoy</span>
        }
        ir="/economia"
        className="col-span-2"
      >
        <ResumenMes />
      </Bloque>
      <Bloque titulo="Pedidos por día · últimos 14 días" ir="/pedidos">
        <PedidosPorDia />
      </Bloque>
      <Bloque titulo="Publicidad por plataforma" ir="/gastos">
        <PublicidadPorPlataforma />
      </Bloque>
    </div>
  )
}
