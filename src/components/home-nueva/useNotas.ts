import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import {
  deleteDashboardTask,
  getDashboardTasksForUser,
  updateDashboardTaskPosition,
  type DashboardTask,
} from '@/lib/supabase/services/dashboard-tasks.service'
import { parseStockReplenishTask } from '@/lib/supabase/services/stock.service'
import { getApprovedUsers } from '@/lib/supabase/services/auth.service'
import { getUserProfileImage } from '@/lib/utils/userImages'

/** Nota propia (se guarda en este navegador, igual que en la Home actual). */
export type NotaPropia = { id: string; text: string; x: number; y: number }

export type Persona = { id: string; nombre: string; foto: string | null }

/**
 * Notas de la Home nueva, con las mismas fuentes que la Home actual:
 * - Propias: localStorage `dashboard_notes_<userId>` (las mismas notas en las dos Home).
 * - De compañeros: `tareas_dashboard` (sin las de reposición de stock, que van en su sección),
 *   con tiempo real y refresco cada 12 s como respaldo.
 */
export function useNotas(userId: string | null | undefined) {
  const [propias, setPropias] = useState<NotaPropia[]>([])
  const [deCompaneros, setDeCompaneros] = useState<DashboardTask[]>([])
  const [personas, setPersonas] = useState<Persona[]>([])

  // ---------- Propias ----------
  useEffect(() => {
    if (!userId) return
    try {
      const raw = localStorage.getItem(`dashboard_notes_${userId}`)
      if (raw) {
        const parsed = JSON.parse(raw) as Array<
          Partial<NotaPropia> & { id: string; text: string }
        >
        setPropias(
          parsed.map(n => ({
            id: n.id,
            text: n.text,
            x: n.x ?? 0,
            y: n.y ?? 0,
          }))
        )
      }
    } catch {
      // ignore
    }
  }, [userId])

  const guardar = useCallback(
    (next: NotaPropia[]) => {
      setPropias(next)
      if (!userId) return
      try {
        localStorage.setItem(`dashboard_notes_${userId}`, JSON.stringify(next))
      } catch {
        // ignore
      }
    },
    [userId]
  )

  const agregarPropia = useCallback(
    (text: string, x: number, y: number) => {
      const t = text.trim()
      if (!t) return
      guardar([
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          text: t,
          x,
          y,
        },
        ...propias,
      ])
    },
    [propias, guardar]
  )
  const quitarPropia = useCallback(
    (id: string) => guardar(propias.filter(n => n.id !== id)),
    [propias, guardar]
  )
  const moverPropia = useCallback(
    (id: string, x: number, y: number) =>
      guardar(propias.map(n => (n.id === id ? { ...n, x, y } : n))),
    [propias, guardar]
  )

  // ---------- De compañeros ----------
  const cargar = useCallback(async () => {
    if (!userId) return
    const tareas = await getDashboardTasksForUser(userId)
    setDeCompaneros(tareas.filter(t => !parseStockReplenishTask(t.texto)))
  }, [userId])

  useEffect(() => {
    if (!userId) return
    void cargar()
    const intervalo = window.setInterval(() => void cargar(), 12000)
    const canal = supabase
      .channel('tareas-dashboard-home-nueva')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tareas_dashboard' },
        () => void cargar()
      )
      .subscribe()
    return () => {
      window.clearInterval(intervalo)
      supabase.removeChannel(canal)
    }
  }, [userId, cargar])

  const completarDeCompanero = useCallback(async (id: string) => {
    await deleteDashboardTask(id)
    setDeCompaneros(prev => prev.filter(t => t.id !== id))
  }, [])
  const moverDeCompaneroLocal = useCallback(
    (id: string, x: number, y: number) => {
      setDeCompaneros(prev =>
        prev.map(t => (t.id === id ? { ...t, posX: x, posY: y } : t))
      )
    },
    []
  )
  const moverDeCompaneroGuardar = useCallback(
    async (id: string, x: number, y: number) => {
      try {
        await updateDashboardTaskPosition(id, x, y)
      } catch {
        void cargar()
      }
    },
    [cargar]
  )

  // ---------- Personas para "nota a un compañero" ----------
  useEffect(() => {
    let vivo = true
    void getApprovedUsers().then(us => {
      if (!vivo) return
      setPersonas(
        us
          .filter(u => u.id !== userId)
          .map(u => ({
            id: u.id,
            nombre: u.name,
            foto: getUserProfileImage(u.name),
          }))
      )
    })
    return () => {
      vivo = false
    }
  }, [userId])

  return {
    propias,
    agregarPropia,
    quitarPropia,
    moverPropia,
    deCompaneros,
    completarDeCompanero,
    moverDeCompaneroLocal,
    moverDeCompaneroGuardar,
    recargarDeCompaneros: cargar,
    personas,
  }
}
