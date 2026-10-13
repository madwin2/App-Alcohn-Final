import { useDeferredValue, useMemo } from 'react'
import { useOrdersState } from '@/lib/hooks/useOrders'
import {
  itemCuentaComoVenta,
  ordenCuentaComoVenta,
} from '@/lib/pedidos/tipoPedido'
import type { FabricationState, Order, ShippingCarrier } from '@/lib/types'
import { claveDia, nombreCliente } from './areaUi'

/**
 * Datos de los paneles de área de la Home nueva, calculados una vez desde los pedidos
 * (`OrdersProvider`). Los usan los paneles anchos, el acordeón del modo escritorio y las ventanas
 * mini, así todos muestran los mismos números.
 */

export function usePedidos(): Order[] {
  const { operationalOrders } = useOrdersState()
  return useDeferredValue(operationalOrders)
}

/* ---------------------------- Producción ---------------------------- */

export const ETAPAS_FABRICACION: Array<{
  clave: FabricationState
  texto: string
}> = [
  { clave: 'SIN_HACER', texto: 'Sin hacer' },
  { clave: 'PROGRAMADO', texto: 'Programado' },
  { clave: 'HACIENDO', texto: 'Haciendo' },
  { clave: 'VERIFICAR', texto: 'Verificar' },
]
export const DESVIOS_FABRICACION: Array<{
  clave: FabricationState
  texto: string
}> = [
  { clave: 'RETOCAR', texto: 'Retocar' },
  { clave: 'REHACER', texto: 'Rehacer' },
]

/** Sellos todavía no Hechos (y no despachados), por estado. */
export function useColaFabricacion() {
  const pedidos = usePedidos()
  return useMemo(() => {
    const porEstado = new Map<FabricationState, number>()
    let prioritarios = 0
    let vencidos = 0
    const hoy = claveDia(new Date())
    for (const o of pedidos) {
      for (const it of o.items) {
        if (it.fabricationState === 'HECHO') continue
        if (
          it.shippingState === 'DESPACHADO' ||
          it.shippingState === 'SEGUIMIENTO_ENVIADO'
        )
          continue
        porEstado.set(
          it.fabricationState,
          (porEstado.get(it.fabricationState) ?? 0) + 1
        )
        if (it.isPriority) prioritarios += 1
        if (o.deadlineAt && o.deadlineAt.slice(0, 10) < hoy) vencidos += 1
      }
    }
    const total = [...porEstado.values()].reduce((a, b) => a + b, 0)
    return { porEstado, total, prioritarios, vencidos }
  }, [pedidos])
}

/* ------------------------------ Ventas ------------------------------ */

export type PedidoCobro = {
  id: string
  cliente: string
  resta: number
  desde: string | null
  dias: number
  internacional: boolean
}

function aCobro(o: Order): PedidoCobro {
  const desde = o.saleStateOrderChangedAt ?? o.createdAt ?? null
  const dias = desde
    ? Math.max(
        0,
        Math.floor((Date.now() - new Date(desde).getTime()) / 86400000)
      )
    : 0
  return {
    id: o.id,
    cliente: nombreCliente(o.customer),
    resta: Math.max(0, o.balanceAmountCached ?? 0),
    desde,
    dias,
    internacional: Boolean(o.international),
  }
}

/** Antigüedad: hasta 7 días, de 8 a 30, más de 30. */
export const TRAMOS = [
  { clave: 'nuevo', texto: 'Hasta 7 días', hasta: 7 },
  { clave: 'medio', texto: '8 a 30 días', hasta: 30 },
  { clave: 'viejo', texto: 'Más de 30 días', hasta: Infinity },
] as const

export function tramosDe(lista: PedidoCobro[]) {
  const out = TRAMOS.map(t => ({ ...t, pedidos: 0, monto: 0 }))
  for (const p of lista) {
    const i = TRAMOS.findIndex(t => p.dias <= t.hasta)
    out[i].pedidos += 1
    if (!p.internacional) out[i].monto += p.resta
  }
  return out
}

export const montoTotal = (l: PedidoCobro[]) =>
  l.filter(p => !p.internacional).reduce((s, p) => s + p.resta, 0)

/** Colas de cobro (mismo criterio que la Home actual): Esperando pago y Deudores. */
export function useCobros() {
  const pedidos = usePedidos()
  return useMemo(() => {
    const esperando: PedidoCobro[] = []
    const deudores: PedidoCobro[] = []
    for (const o of pedidos) {
      if (!ordenCuentaComoVenta(o)) continue
      if (
        o.items.some(
          it =>
            it.fabricationState === 'HECHO' && it.saleState === 'FOTO_ENVIADA'
        )
      )
        esperando.push(aCobro(o))
      if (o.items.some(it => it.saleState === 'DEUDOR'))
        deudores.push(aCobro(o))
    }
    const masViejo = (a: PedidoCobro, b: PedidoCobro) => b.dias - a.dias
    esperando.sort(masViejo)
    deudores.sort(masViejo)
    const ids = new Set([...esperando, ...deudores].map(p => p.id))
    const porCobrar = [...ids].reduce((s, id) => {
      const p =
        esperando.find(x => x.id === id) ?? deudores.find(x => x.id === id)!
      return s + (p.internacional ? 0 : p.resta)
    }, 0)
    return { esperando, deudores, porCobrar, pedidosEnCobro: ids.size }
  }, [pedidos])
}

/* ----------------------------- Logística ---------------------------- */

export type EtapaEnvio =
  | 'enviar'
  | 'HACER_ETIQUETA'
  | 'ERROR_ETIQUETA'
  | 'ETIQUETA_LISTA'
  | 'DESPACHADO'

export const ETAPAS_ENVIO: Array<{ clave: EtapaEnvio; texto: string }> = [
  { clave: 'enviar', texto: 'Para enviar' },
  { clave: 'HACER_ETIQUETA', texto: 'Hacer etiqueta' },
  { clave: 'ERROR_ETIQUETA', texto: 'Error de etiqueta' },
  { clave: 'ETIQUETA_LISTA', texto: 'Etiqueta lista' },
  { clave: 'DESPACHADO', texto: 'Despachado' },
]

export const TRANSPORTE: Record<ShippingCarrier | 'SIN', string> = {
  ANDREANI: 'Andreani',
  CORREO_ARGENTINO: 'Correo',
  VIA_CARGO: 'Vía Cargo',
  DHL: 'DHL',
  RETIRO_EN_PERSONA: 'Retiro',
  OTRO: 'Otro',
  SIN: 'Sin definir',
}

/** Etapas de envío de un pedido (cuenta si alguno de sus sellos está en ella). */
export function etapasDe(o: Order): Set<EtapaEnvio> {
  const s = new Set<EtapaEnvio>()
  for (const it of o.items) {
    if (
      o.orderType !== 'PRUEBA' &&
      it.fabricationState === 'HECHO' &&
      it.saleState === 'TRANSFERIDO' &&
      it.shippingState === 'SIN_ENVIO'
    )
      s.add('enviar')
    if (
      it.shippingState === 'HACER_ETIQUETA' ||
      it.shippingState === 'ERROR_ETIQUETA' ||
      it.shippingState === 'ETIQUETA_LISTA' ||
      it.shippingState === 'DESPACHADO'
    )
      s.add(it.shippingState)
  }
  // El error de MiCorreo queda en el pedido (labelState) aunque el sello no cambie de estado.
  if (
    o.labelState === 'error' &&
    o.items.some(
      it =>
        it.shippingState !== 'DESPACHADO' &&
        it.shippingState !== 'SEGUIMIENTO_ENVIADO'
    )
  )
    s.add('ERROR_ETIQUETA')
  return s
}

export function useEnvios() {
  const pedidos = usePedidos()
  return useMemo(() => {
    const porEtapa = new Map<EtapaEnvio, Order[]>()
    for (const e of ETAPAS_ENVIO) porEtapa.set(e.clave, [])
    for (const o of pedidos)
      for (const e of etapasDe(o)) porEtapa.get(e)!.push(o)
    return { porEtapa }
  }, [pedidos])
}

/** Cuántos pedidos de una lista van por cada transporte (de mayor a menor). */
export function porTransporte(lista: Order[]) {
  const m = new Map<string, number>()
  for (const o of lista) {
    const t = o.shipping?.carrier ?? 'SIN'
    m.set(t, (m.get(t) ?? 0) + 1)
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => ({ texto: TRANSPORTE[t as ShippingCarrier] ?? t, n }))
}

/* ------------------------------ Del día ----------------------------- */

/** Pedidos cargados hoy, del más nuevo al más viejo. */
export function usePedidosDeHoy() {
  const pedidos = usePedidos()
  return useMemo(() => {
    const hoy = claveDia(new Date())
    return pedidos
      .filter(o => o.createdAt && claveDia(new Date(o.createdAt)) === hoy)
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  }, [pedidos])
}

/* --------------------------- Administración -------------------------- */

/** Pedidos Venta nacionales cargados en el mes (y hasta el mismo día del mes anterior). */
export function useMesEnPedidos() {
  const pedidos = usePedidos()
  return useMemo(() => {
    const ahora = new Date()
    const hoy = claveDia(ahora)
    const mes = hoy.slice(0, 7)
    const ant = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1)
    const mesAnt = claveDia(ant).slice(0, 7)
    const diaHoy = Number(hoy.slice(8))
    let cargado = 0
    let cargadoAnt = 0
    let sellos = 0
    const porDia = new Map<string, number>()
    for (const o of pedidos) {
      const ref = o.createdAt ? new Date(o.createdAt) : null
      if (!ref) continue
      const dia = claveDia(ref)
      porDia.set(dia, (porDia.get(dia) ?? 0) + 1)
      if (!ordenCuentaComoVenta(o) || o.international) continue
      if (dia.slice(0, 7) === mes) {
        cargado += o.totalValue ?? 0
        for (const it of o.items) {
          const esSello =
            (it.itemType ??
              (it.stampType === 'ABC' ? 'ABECEDARIO' : 'SELLO')) === 'SELLO'
          if (esSello && itemCuentaComoVenta(o, it)) sellos += 1
        }
      } else if (dia.slice(0, 7) === mesAnt && Number(dia.slice(8)) <= diaHoy) {
        cargadoAnt += o.totalValue ?? 0
      }
    }
    const ultimos: Array<{ dia: string; n: number }> = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const k = claveDia(d)
      ultimos.push({ dia: k, n: porDia.get(k) ?? 0 })
    }
    return { mes, cargado, cargadoAnt, sellos, ultimos }
  }, [pedidos])
}
