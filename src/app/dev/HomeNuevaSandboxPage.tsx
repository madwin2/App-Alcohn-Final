import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { X } from 'lucide-react'
import { BarraObjetivos } from '@/components/home-nueva/BarraObjetivos'
import { BotonesNotas } from '@/components/home-nueva/BotonesNotas'
import { CapaNotas } from '@/components/home-nueva/CapaNotas'
import { ColumnaAcordeon } from '@/components/home-nueva/ColumnaAcordeon'
import { Escritorio } from '@/components/home-nueva/escritorio/Escritorio'
import { FondoFluido } from '@/components/home-nueva/FondoFluido'
import { NotaCompaneroDialog } from '@/components/home-nueva/NotaCompaneroDialog'
import { PanelArea } from '@/components/home-nueva/PanelArea'
import { PanelSellos } from '@/components/home-nueva/PanelSellos'
import { PanelStock } from '@/components/home-nueva/PanelStock'
import { BotonPersonalizar } from '@/components/home-nueva/Personalizar'
import {
  personaDeSlug,
  useVistaInicio,
  vistaBase,
} from '@/components/home-nueva/vista'
import {
  getMiembrosEquipo,
  type PerfilEquipo,
} from '@/lib/supabase/services/equipo.service'
import {
  SelectorModo,
  type ModoHome,
} from '@/components/home-nueva/SelectorModo'
import {
  TarjetaBienvenida,
  type MaterialTarjeta,
} from '@/components/home-nueva/TarjetaBienvenida'
import { useNotas } from '@/components/home-nueva/useNotas'
import { VidrioLiquido } from '@/components/home-nueva/VidrioLiquido'
import { AppMain } from '@/components/layout/AppMain'
import '@/components/home-nueva/movimiento.css'
import { Toaster } from '@/components/ui/toaster'
import { useAuth } from '@/lib/hooks/useAuth'
import { useEquipoRol } from '@/lib/hooks/useEquipoRol'

/**
 * /dev/home — la Home nueva, armada de cero (solo en desarrollo).
 *
 * Fondo: FondoFluido (lámpara de lava en naranjas, con grano). La barra lateral la pone
 * AuthenticatedLayout, igual que en el resto de la app. Va dentro de OrdersScopeLayout (como la
 * Home actual) porque los objetivos se calculan con los pedidos.
 *
 * Izquierda: tarjeta de bienvenida. Arriba al centro: objetivos; a la derecha: botones de notas.
 * Debajo de los objetivos: cuadrados de sellos (prioritarios, para enviar, foto pendiente,
 * especiales, para vectorizar); debajo, el panel de área (Producción, Ventas, Logística,
 * Administración, Equipo) y, debajo de los dos últimos cuadrados, la columna de stock pendiente.
 * Los post-its flotan sobre todo ese espacio.
 *
 * Dos modos (arriba a la derecha, se recuerda): **Panel** (lo de arriba) y **Escritorio**: el
 * espacio del panel de área pasa a ser un escritorio con apps que abren ventanas mini, y los
 * paneles de área van con Stock en una columna en acordeón.
 *
 * Arriba: a la izquierda el modo y "Personalizar" (qué cuadrados, áreas, stock y apps se ven; cada
 * uno arranca con la vista base de su rol, ver `vista.ts`), al centro las ventas del mes y a la
 * derecha las notas.
 *
 * /dev/home/:persona (fede, juli-b, lautaro o cachi) muestra el Inicio como lo vería esa persona:
 * su tarjeta, su área y su vista base (se puede tocar; lo que se cambie queda guardado aparte).
 */
/** Igual que `ALLOWED_EMAIL` en Economía (`src/app/economia/index.tsx`). */
const EMAIL_DUENO = 'julian.475@hotmail.com'

export default function HomeNuevaSandboxPage() {
  const { perfil: miPerfil, loading: cargandoMio } = useEquipoRol()
  const { user } = useAuth()

  // Vista previa del Inicio de otra persona (/dev/home/fede).
  const { persona: slug } = useParams()
  const persona = personaDeSlug(slug)
  const [perfilAjeno, setPerfilAjeno] = useState<
    PerfilEquipo | null | undefined
  >(undefined)
  useEffect(() => {
    if (!persona) return
    let vivo = true
    setPerfilAjeno(undefined)
    void getMiembrosEquipo()
      .then(m => {
        if (!vivo) return
        setPerfilAjeno(
          m.find(x => persona.buscar.test(`${x.nombre} ${x.email ?? ''}`)) ??
            null
        )
      })
      .catch(() => vivo && setPerfilAjeno(null))
    return () => {
      vivo = false
    }
  }, [persona])

  const perfil = persona ? (perfilAjeno ?? null) : miPerfil
  const loading = persona ? perfilAjeno === undefined : cargandoMio
  const idVista = persona ? (perfilAjeno?.userId ?? null) : (user?.id ?? null)
  // Mismo criterio que Economía para los montos (Administración solo la ve el dueño).
  const esDueno = !persona && user?.email?.toLowerCase() === EMAIL_DUENO
  const notas = useNotas(idVista ?? undefined)
  // Qué se ve: la base del rol, o lo que la persona eligió en Personalizar.
  const control = useVistaInicio(
    persona ? `vista-previa-${persona.slug}` : (user?.id ?? null),
    persona ? persona.base : vistaBase(perfil, esDueno)
  )
  const { vista } = control
  const bloquesColumna = [
    ...(vista.stock ? (['stock'] as const) : []),
    ...vista.areas,
  ]
  const [agregando, setAgregando] = useState(false)
  const [paraCompanero, setParaCompanero] = useState(false)
  const [modo, setModo] = useState<ModoHome>(() => {
    try {
      return localStorage.getItem('home_nueva_modo_v1') === 'escritorio'
        ? 'escritorio'
        : 'panel'
    } catch {
      return 'panel'
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('home_nueva_modo_v1', modo)
    } catch {
      // ignore
    }
  }, [modo])
  // La cascada de entrada es solo al cargar; al cambiar de modo, lo nuevo entra enseguida.
  const cargando = useRef(true)
  useEffect(() => {
    cargando.current = false
  }, [])
  const ordenModo = {
    '--i': cargando.current ? 6 : -0.86,
  } as React.CSSProperties
  // Versión de la tarjeta de perfil (para comparar; se recuerda).
  const [tarjeta, setTarjeta] = useState<MaterialTarjeta>(() => {
    try {
      const g = localStorage.getItem('home_nueva_tarjeta_v1')
      return g === 'negra' || g === 'vidrio' ? g : 'actual'
    } catch {
      return 'actual'
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('home_nueva_tarjeta_v1', tarjeta)
    } catch {
      // ignore
    }
  }, [tarjeta])
  const anchoColumna = { width: 'calc((100% - 48px) * 2 / 5 + 12px)' }

  return (
    <AppMain className="home-nueva relative h-screen overflow-hidden bg-transparent text-white">
      <FondoFluido />
      <Toaster />

      {/* Alto fijo de pantalla: la página no scrollea; la tarjeta se acomoda al espacio. */}
      <main className="relative z-10 flex h-full min-h-0 gap-8 overflow-hidden px-6 py-4 lg:px-10">
        {perfil ? (
          // Al cargar, cada bloque entra en cascada (ver movimiento.css).
          <TarjetaBienvenida
            perfil={perfil}
            material={tarjeta}
            className="entrada"
            style={{ '--i': 0 } as React.CSSProperties}
          />
        ) : loading ? null : (
          <p className="text-sm text-white/60">
            {persona
              ? `No encontré a ${persona.nombre} en el equipo.`
              : 'Tu usuario todavía no tiene perfil en el equipo.'}
          </p>
        )}

        <div className="relative flex min-w-0 flex-1 flex-col">
          {/* Arriba: modo y Personalizar a la izquierda, ventas del mes al centro, notas a la derecha */}
          <div className="grid shrink-0 grid-cols-[minmax(max-content,1fr)_auto_minmax(max-content,1fr)] items-start gap-4">
            <div
              className="entrada flex min-w-0 items-start gap-3 justify-self-start"
              style={{ '--i': 1 } as React.CSSProperties}
            >
              <SelectorModo modo={modo} onModo={setModo} />
              <BotonPersonalizar
                control={control}
                modo={modo}
                esDueno={esDueno}
                persona={persona?.slug ?? null}
                tarjeta={tarjeta}
                onTarjeta={setTarjeta}
              />
            </div>
            <BarraObjetivos
              className="entrada"
              style={{ '--i': 2 } as React.CSSProperties}
            />
            <div
              className="entrada flex items-start justify-self-end"
              style={{ '--i': 3 } as React.CSSProperties}
            >
              <BotonesNotas
                onNota={() => setAgregando(true)}
                onNotaCompanero={() => setParaCompanero(true)}
              />
            </div>
          </div>

          <div className="relative mt-3 flex min-h-0 flex-1 flex-col gap-3">
            {/* Cuadrados de sellos; el que se abre crece hacia los costados */}
            {vista.cuadrados.length ? (
              <PanelSellos cuadrados={vista.cuadrados} />
            ) : null}
            {/* Al cambiar de modo, el contenido nuevo entra igual que al cargar. */}
            {modo === 'panel' ? (
              <div
                key="panel"
                className="entrada flex min-h-0 flex-1 gap-3"
                style={ordenModo}
              >
                {/* Panel de área: lo que cada área tiene que mover hoy (abre en el área del perfil) */}
                {vista.areas.length ? (
                  <PanelArea
                    area={perfil?.areaPrincipal}
                    esDueno={esDueno}
                    areas={vista.areas}
                    className="flex-1"
                  />
                ) : (
                  <SinNada className="flex-1" />
                )}
                {/* Stock pendiente: columna debajo de Especiales y Para vectorizar, del ancho de esos
                    dos cuadrados (5 cuadrados, 4 huecos de 12px). */}
                {vista.stock ? (
                  <PanelStock
                    userId={idVista}
                    className="shrink-0"
                    style={anchoColumna}
                  />
                ) : null}
              </div>
            ) : (
              <div
                key="escritorio"
                className="entrada flex min-h-0 flex-1 gap-3"
                style={ordenModo}
              >
                {/* Escritorio: apps que abren ventanas mini */}
                <Escritorio
                  perfil={perfil}
                  esDueno={esDueno}
                  apps={vista.apps}
                  className="flex-1"
                />
                {/* Stock y paneles de área en acordeón */}
                {bloquesColumna.length ? (
                  <ColumnaAcordeon
                    userId={idVista}
                    area={perfil?.areaPrincipal}
                    esDueno={esDueno}
                    bloques={bloquesColumna}
                    className="shrink-0"
                    style={anchoColumna}
                  />
                ) : null}
              </div>
            )}

            {/* Post-its: flotan sobre todo el espacio (se arrastran a cualquier lado) */}
            <CapaNotas
              className="absolute inset-0 z-10"
              propias={notas.propias}
              deCompaneros={notas.deCompaneros}
              agregando={agregando}
              onCerrarAgregar={() => setAgregando(false)}
              onAgregar={notas.agregarPropia}
              onPropiaHecha={notas.quitarPropia}
              onMoverPropia={notas.moverPropia}
              onCompaneroHecha={notas.completarDeCompanero}
              onMoverCompaneroLocal={notas.moverDeCompaneroLocal}
              onMoverCompaneroGuardar={notas.moverDeCompaneroGuardar}
            />
          </div>
        </div>
      </main>

      {/* Vista previa del Inicio de otra persona: pastilla abajo para volver al propio */}
      {persona ? (
        <Link
          to="/dev/home"
          className="fixed bottom-5 left-1/2 z-30 flex h-10 -translate-x-1/2 items-center gap-2 rounded-full border bg-card/95 pl-4 pr-3 text-[12.5px] text-white/70 shadow-2xl transition-colors duration-200 hover:text-white"
          title="Volver a mi inicio"
        >
          Viendo el inicio de{' '}
          <b className="font-semibold text-white">{persona.nombre}</b>
          <X className="size-3.5" />
        </Link>
      ) : null}

      {/* Prueba: vidrio líquido que refracta el fondo (se arrastra; la rueda cambia el mes) */}
      <VidrioLiquido />

      <NotaCompaneroDialog
        open={paraCompanero}
        onOpenChange={setParaCompanero}
        personas={notas.personas}
        miId={idVista ?? ''}
        onCreada={() => void notas.recargarDeCompaneros()}
      />
    </AppMain>
  )
}

/** Lugar del panel de áreas cuando se apagaron todas. */
function SinNada({ className }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center rounded-[28px] border border-dashed border-white/10 text-center text-[13px] text-white/40 ${className ?? ''}`}
    >
      No elegiste ninguna área. Prendé las que quieras desde Personalizar.
    </div>
  )
}
