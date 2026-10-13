import { useCallback, useEffect, useState } from 'react'
import type {
  AreaPrincipalEquipo,
  PerfilEquipo,
} from '@/lib/supabase/services/equipo.service'

/**
 * Qué muestra el Inicio de cada persona: cuadrados de sellos, pestañas de área, la columna de
 * stock y las apps del escritorio. Cada uno arranca con la **vista base de su rol** y la puede
 * cambiar desde "Personalizar" (queda guardada en este navegador).
 *
 * Las vistas base salen de los roles de `docs/01-product/equipo.md` y las confirmó el dueño
 * (2026-10-12, Q-INI-002). Nada queda bloqueado: todo se puede apagar y volver a la base.
 */

export type CuadradoId =
  'prioritarios' | 'enviar' | 'foto' | 'especiales' | 'vectorizar'
export type AreaId =
  'produccion' | 'ventas' | 'logistica' | 'administracion' | 'equipo'
export type AppId =
  | 'pedidos'
  | 'envios'
  | 'produccion'
  | 'programas'
  | 'corcho'
  | 'perfil'
  | 'economia'
  | 'gastos'

export type VistaInicio = {
  cuadrados: CuadradoId[]
  areas: AreaId[]
  stock: boolean
  apps: AppId[]
}

export const CUADRADOS: Array<{ id: CuadradoId; texto: string }> = [
  { id: 'prioritarios', texto: 'Prioritarios' },
  { id: 'enviar', texto: 'Para enviar' },
  { id: 'foto', texto: 'Foto pendiente' },
  { id: 'especiales', texto: 'Especiales' },
  { id: 'vectorizar', texto: 'Para vectorizar' },
]
export const AREAS: Array<{ id: AreaId; texto: string; soloDueno?: boolean }> =
  [
    { id: 'produccion', texto: 'Producción' },
    { id: 'ventas', texto: 'Ventas' },
    { id: 'logistica', texto: 'Logística' },
    { id: 'administracion', texto: 'Administración', soloDueno: true },
    { id: 'equipo', texto: 'Equipo' },
  ]
export const APPS_VISTA: Array<{
  id: AppId
  texto: string
  soloDueno?: boolean
}> = [
  { id: 'pedidos', texto: 'Pedidos' },
  { id: 'envios', texto: 'Envíos' },
  { id: 'produccion', texto: 'Producción' },
  { id: 'programas', texto: 'Programas' },
  { id: 'corcho', texto: 'Corcho' },
  { id: 'perfil', texto: 'Mi perfil' },
  { id: 'economia', texto: 'Economía', soloDueno: true },
  { id: 'gastos', texto: 'Gastos', soloDueno: true },
]

/* ----------------------------- Vistas base ----------------------------- */

const TODO: VistaInicio = {
  cuadrados: CUADRADOS.map(c => c.id),
  areas: AREAS.map(a => a.id),
  stock: true,
  apps: APPS_VISTA.map(a => a.id),
}

/** Producción (Fede): vectoriza, arma programas y opera las CNC. */
const PRODUCCION: VistaInicio = {
  cuadrados: ['prioritarios', 'especiales', 'vectorizar'],
  areas: ['produccion', 'equipo'],
  stock: true,
  apps: ['produccion', 'programas', 'pedidos', 'corcho', 'perfil'],
}

/** Ventas (Juli B): vende, cobra y saca/sube las fotos de los sellos terminados. */
const VENTAS: VistaInicio = {
  cuadrados: ['prioritarios', 'foto', 'especiales'],
  areas: ['ventas', 'equipo'],
  stock: false,
  apps: ['pedidos', 'envios', 'corcho', 'perfil'],
}

/** Ventas y logística (Cachi): vende, cobra, carga envíos y arma los sellos al despachar. */
const LOGISTICA: VistaInicio = {
  cuadrados: ['prioritarios', 'enviar', 'especiales'],
  areas: ['ventas', 'logistica', 'equipo'],
  stock: true,
  apps: ['pedidos', 'envios', 'corcho', 'perfil'],
}

const POR_AREA: Record<AreaPrincipalEquipo, VistaInicio> = {
  produccion: PRODUCCION,
  ventas: VENTAS,
  logistica: LOGISTICA,
  administracion: TODO,
}

/**
 * Personas para ver su Inicio desde /dev/home/:persona. `buscar` se compara con el nombre y el
 * mail del perfil del equipo.
 */
export const PERSONAS_PRUEBA: Array<{
  slug: string
  nombre: string
  buscar: RegExp
  base: VistaInicio
}> = [
  {
    slug: 'fede',
    nombre: 'Fede',
    buscar: /fede|federico|minuto/i,
    base: PRODUCCION,
  },
  {
    slug: 'juli-b',
    nombre: 'Juli B',
    buscar: /bobasso|juli\s*b/i,
    base: VENTAS,
  },
  {
    slug: 'lautaro',
    nombre: 'Cachi',
    buscar: /lautaro|cachi|albornoz/i,
    base: LOGISTICA,
  },
]

/** Alias de la URL (/dev/home/cachi = /dev/home/lautaro). */
export const personaDeSlug = (slug: string | undefined) => {
  if (!slug) return null
  const s = slug.toLowerCase() === 'cachi' ? 'lautaro' : slug.toLowerCase()
  return PERSONAS_PRUEBA.find(p => p.slug === s) ?? null
}

export function vistaBase(
  perfil: PerfilEquipo | null,
  esDueno: boolean
): VistaInicio {
  if (esDueno) return TODO
  const texto = `${perfil?.nombre ?? ''} ${perfil?.email ?? ''}`
  const persona = PERSONAS_PRUEBA.find(p => p.buscar.test(texto))
  if (persona) return persona.base
  return perfil?.areaPrincipal ? POR_AREA[perfil.areaPrincipal] : TODO
}

/* ------------------------------ Guardado ------------------------------ */

const clave = (dueno: string) => `home_nueva_vista_v1_${dueno}`

function leer(dueno: string): VistaInicio | null {
  try {
    const v = JSON.parse(localStorage.getItem(clave(dueno)) ?? 'null')
    if (
      v &&
      Array.isArray(v.cuadrados) &&
      Array.isArray(v.areas) &&
      Array.isArray(v.apps)
    )
      return { ...v, stock: Boolean(v.stock) }
  } catch {
    // ignore
  }
  return null
}

/**
 * Vista del Inicio de una persona: la guardada si la cambió; si no, la base de su rol.
 * `dueno` identifica dónde se guarda (el id del usuario, o la persona de la vista previa).
 */
export function useVistaInicio(dueno: string | null, base: VistaInicio) {
  const [propia, setPropia] = useState<VistaInicio | null>(() =>
    dueno ? leer(dueno) : null
  )
  useEffect(() => {
    setPropia(dueno ? leer(dueno) : null)
  }, [dueno])

  const guardar = useCallback(
    (v: VistaInicio | null) => {
      setPropia(v)
      if (!dueno) return
      try {
        if (v) localStorage.setItem(clave(dueno), JSON.stringify(v))
        else localStorage.removeItem(clave(dueno))
      } catch {
        // ignore
      }
    },
    [dueno]
  )

  const vista = propia ?? base
  /** Prende o apaga un elemento (respeta el orden original de cada lista). */
  const alternar = useCallback(
    <K extends 'cuadrados' | 'areas' | 'apps'>(
      lista: K,
      id: VistaInicio[K][number]
    ) => {
      const orden =
        lista === 'cuadrados'
          ? CUADRADOS.map(c => c.id)
          : lista === 'areas'
            ? AREAS.map(a => a.id)
            : APPS_VISTA.map(a => a.id)
      const actual = vista[lista] as string[]
      const nueva = actual.includes(id)
        ? actual.filter(x => x !== id)
        : orden.filter(x => x === id || actual.includes(x))
      guardar({ ...vista, [lista]: nueva })
    },
    [vista, guardar]
  )

  return {
    vista,
    cambiada: propia !== null,
    alternar,
    setStock: (stock: boolean) => guardar({ ...vista, stock }),
    restablecer: () => guardar(null),
  }
}
