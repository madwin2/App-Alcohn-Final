import { cn } from '@/lib/utils/cn'
import {
  getFabricationChipVisual,
  getSaleChipVisual,
  getShippingChipVisual,
} from '@/lib/utils/format'

/**
 * Chip de estado del Inicio con los MISMOS colores que la tabla de Pedidos (`getFabricationChipVisual`,
 * `getSaleChipVisual`, `getShippingChipVisual` de `lib/utils/format.ts`), en tamaño chico. Así un
 * "Haciendo" o un "Transferido" se ve igual acá que en Pedidos.
 */

export type TipoEstado = 'fabricacion' | 'venta' | 'envio' | 'programa'

const TEXTOS: Record<TipoEstado, Record<string, string>> = {
  fabricacion: {
    SIN_HACER: 'Sin hacer',
    PROGRAMADO: 'Programado',
    HACIENDO: 'Haciendo',
    VERIFICAR: 'Verificar',
    RETOCAR: 'Retocar',
    REHACER: 'Rehacer',
    HECHO: 'Hecho',
  },
  venta: {
    SEÑADO: 'Señado',
    FOTO_ENVIADA: 'Foto enviada',
    TRANSFERIDO: 'Transferido',
    DEUDOR: 'Deudor',
  },
  envio: {
    SIN_ENVIO: 'Sin envío',
    HACER_ETIQUETA: 'Hacer etiqueta',
    ERROR_ETIQUETA: 'Error etiqueta',
    ETIQUETA_LISTA: 'Etiqueta lista',
    DESPACHADO: 'Despachado',
    SEGUIMIENTO_ENVIADO: 'Seguimiento',
  },
  programa: {
    BORRADOR: 'Borrador',
    LISTO: 'Listo',
    BLOQUEADO: 'Bloqueado',
    EN_FABRICACION: 'En fabricación',
    FINALIZADO: 'Finalizado',
  },
}

/** Programas: mismos tonos que las etiquetas de la página Programas (verde, rojo, azul, gris). */
const PROGRAMA: Record<string, { rgb: string; oscuro?: boolean }> = {
  BORRADOR: { rgb: '107,114,128', oscuro: true },
  LISTO: { rgb: '34,197,94' },
  BLOQUEADO: { rgb: '239,68,68' },
  EN_FABRICACION: { rgb: '59,130,246' },
  FINALIZADO: { rgb: '148,163,184', oscuro: true },
}

export const textoEstado = (tipo: TipoEstado, valor: string) =>
  TEXTOS[tipo][valor] ?? valor

function visual(tipo: TipoEstado, valor: string, prioritario?: boolean) {
  if (tipo === 'programa') {
    const c = PROGRAMA[valor] ?? PROGRAMA.BORRADOR
    return {
      backgroundImage: `linear-gradient(60deg, rgba(${c.rgb},${c.oscuro ? 0.18 : 0.05}) 0%, rgba(${c.rgb},0) 100%)`,
      backgroundColor: c.oscuro ? undefined : `rgba(${c.rgb},0.1)`,
      borderColor: `rgba(${c.rgb},${c.oscuro ? 0.35 : 0.7})`,
      textClass: c.oscuro ? 'text-muted-foreground' : '',
      textColor: c.oscuro ? undefined : `rgba(${c.rgb},0.82)`,
    }
  }
  return tipo === 'fabricacion'
    ? getFabricationChipVisual(valor, prioritario)
    : tipo === 'venta'
      ? getSaleChipVisual(valor)
      : getShippingChipVisual(valor)
}

/** Color (r,g,b) del estado, el mismo del chip: para teñir nodos de flujo, puntos, etc. */
export function colorEstado(tipo: TipoEstado, valor: string): string {
  const m = visual(tipo, valor).borderColor.match(/rgba\((\d+),(\d+),(\d+)/)
  return m ? `${m[1]},${m[2]},${m[3]}` : '255,255,255'
}

export function ChipEstado({
  tipo,
  valor,
  prioritario,
  texto,
  className,
}: {
  tipo: TipoEstado
  valor: string
  prioritario?: boolean
  /** Para reemplazar el texto (por ejemplo, el nombre del programa). */
  texto?: string
  className?: string
}) {
  const v = visual(tipo, valor, prioritario)
  // Los chips "oscuros" de la app usan text-muted-foreground: acá, gris claro.
  const oscuro = Boolean(v.textClass.includes('muted'))
  return (
    <span
      className={cn(
        'inline-flex h-[22px] min-w-[72px] shrink-0 items-center justify-center truncate rounded-full border px-2.5 text-[11px] leading-none',
        oscuro && 'text-white/55',
        prioritario && 'font-semibold',
        className
      )}
      style={{
        backgroundImage: v.backgroundImage,
        backgroundColor: v.backgroundColor,
        borderColor: v.borderColor,
        color: oscuro ? undefined : v.textColor,
      }}
    >
      {texto ?? textoEstado(tipo, valor)}
    </span>
  )
}
