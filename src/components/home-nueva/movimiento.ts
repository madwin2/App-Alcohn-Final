import { useEffect, useState } from 'react'

/**
 * Lenguaje de movimiento de la Home nueva: todas las animaciones usan estas curvas y duraciones
 * para que se sientan de la misma familia.
 *
 * - `SUAVE`: la curva de siempre (sale rápido y frena largo). Para todo lo que cambia de tamaño,
 *   de lugar o aparece.
 * - `RESORTE`: un rebote corto y contenido; solo para "pops" chicos de hover (íconos, botones).
 * - Duraciones: 200 ms para hover/colores, 300 ms para estados chicos, 500 ms para cambios de
 *   layout (plegar, expandir, deslizar), 700 ms para que los gráficos lleguen a su valor.
 *
 * Son strings literales para que Tailwind las vea.
 */
export const SUAVE = 'ease-[cubic-bezier(0.22,1,0.36,1)]'
export const RESORTE = 'ease-[cubic-bezier(0.34,1.3,0.64,1)]'

export const HOVER = 'duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]'
export const ESTADO = 'duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]'
export const LAYOUT = 'duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]'
export const GRAFICO = 'duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]'

/** Milisegundos de `LAYOUT` (para desmontar lo que se va después de animarlo). */
export const MS_LAYOUT = 500

/**
 * `false` en el primer cuadro y `true` en el siguiente: sirve para que una barra o un anillo
 * crezcan desde cero al aparecer en vez de aparecer ya llenos.
 */
export function useAparecer() {
  const [listo, setListo] = useState(false)
  useEffect(() => {
    let r2 = 0
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setListo(true))
    })
    // Si la pestaña está oculta no hay cuadros: que igual llegue al valor.
    const t = window.setTimeout(() => setListo(true), 120)
    return () => {
      cancelAnimationFrame(r1)
      cancelAnimationFrame(r2)
      window.clearTimeout(t)
    }
  }, [])
  return listo
}

/**
 * Mantiene montado algo que se está yendo hasta que termina su animación de salida.
 * Devuelve `[montado, visible]`: renderizar si `montado`, y animar con `visible`.
 */
export function useSalida(abierto: boolean, ms = MS_LAYOUT) {
  const [montado, setMontado] = useState(abierto)
  const [visible, setVisible] = useState(abierto)
  useEffect(() => {
    if (abierto) {
      setMontado(true)
      const r = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(r)
    }
    setVisible(false)
    const t = window.setTimeout(() => setMontado(false), ms)
    return () => window.clearTimeout(t)
  }, [abierto, ms])
  return [montado, visible] as const
}
