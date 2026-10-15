import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { VidrioTarjeta } from './VidrioTarjeta'
import {
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { weekdayOfKey } from '@/lib/equipo/fechas'
import { useToast } from '@/components/ui/use-toast'
import { AccionesTarea } from '@/components/perfil/AccionesTarea'
import { Estado } from '@/components/perfil/perfilUi'
import type { TareaRecurrenteFormValue } from '@/components/perfil/TareaRecurrenteDialog'
import { crearTareaRecurrente } from '@/lib/supabase/services/equipoTareas.service'
import type { PerfilEquipo } from '@/lib/supabase/services/equipo.service'
import { getUserInicioImage, getUserInitials } from '@/lib/utils/userImages'
import { NuevaTareaDialog } from './NuevaTareaDialog'
import {
  grillaDelMes,
  lunesDe,
  useBienvenida,
  type Companero,
  type DatosBienvenida,
  type DiaCalendario,
} from './useBienvenida'
import { ChromaKeyVideo } from '@/components/home/ChromaKeyVideo'

/**
 * Tarjeta de bienvenida / personal de la Home nueva.
 *
 * Arriba: personaje + saludo + nombre + fecha + una línea con lo del día. En el medio, resumen:
 * calendario (semana; click → mes), feedback nuevo y Mis números del mes (el detalle está en
 * Mi perfil). Abajo: tareas, con dos vistas que se pasan deslizando: "Mi día" (tareas del perfil)
 * va pegada a la tarjeta; "Proyectos" (tareas de Innovación asignadas) se despega.
 *
 * Con el mes abierto, las tareas se pliegan a una línea (como Feedback); en Proyectos se pliega
 * Mis números para que la lista tenga lugar.
 * Ocupa el alto disponible sin scroll de página: lo único que scrollea es la lista de tareas.
 */

/** Material de las superficies: vidrio ahumado oscuro sobre el fondo de lava. */
const SUPERFICIE = 'bg-[#0d0b0a]/80 backdrop-blur-2xl'

/**
 * Material de la tarjeta (para comparar desde Personalizar):
 * - `actual`: translúcida y desenfocada (la de siempre).
 * - `negra`: como la barra lateral y el resto de los paneles.
 * - `vidrio`: vidrio líquido como el de prueba (lo dibuja `VidrioTarjeta` detrás).
 */
export type MaterialTarjeta = 'actual' | 'negra' | 'vidrio'

function superficie(m: MaterialTarjeta) {
  return m === 'actual' ? SUPERFICIE : m === 'negra' ? 'border bg-card/95' : ''
}
const EASE = 'duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]'
/** Cruce de dos textos: el que se va sale rápido (200 ms, desenfocado) y el que llega entra
 *  después, con la curva de siempre. */
const CRUCE = 'duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]'
const GRADIENTE = 'bg-gradient-to-br from-[#f6a33d] via-[#e06b17] to-[#94300a]'

type Vista = 'dia' | 'proyectos'

export function TarjetaBienvenida({
  perfil,
  material = 'actual',
  className,
  style,
}: {
  perfil: PerfilEquipo
  material?: MaterialTarjeta
  className?: string
  style?: React.CSSProperties
}) {
  const ref = useRef<HTMLElement>(null)
  const { datos, recargar } = useBienvenida(perfil)
  const [vista, setVista] = useState<Vista>('dia')
  const [mesAbierto, setMesAbierto] = useState(false)
  const separada = vista === 'proyectos'
  const tareasPlegadas = mesAbierto

  return (
    <section
      ref={ref}
      className={cn(
        'relative flex h-full min-h-0 w-full max-w-[460px] flex-col text-white',
        material === 'negra' && !separada && 'rounded-[28px] shadow-2xl',
        className
      )}
      style={style}
      // Vidrio: unida es una sola placa; despegada, una por parte.
      data-placa={material === 'vidrio' && !separada ? '' : undefined}
    >
      {material === 'vidrio' ? <VidrioTarjeta contenedor={ref} /> : null}
      {/* ---------- Parte de arriba: bienvenida + resumen ---------- */}
      <div
        data-placa={material === 'vidrio' && separada ? '' : undefined}
        className={cn(
          superficie(material),
          material === 'negra' && !separada && 'border-b-0',
          'relative flex flex-col rounded-t-[28px] transition-[border-radius]',
          EASE,
          // Con las tareas plegadas, esta parte ocupa el resto del alto (la tarjeta siempre llega abajo).
          tareasPlegadas ? 'min-h-0 flex-1' : 'shrink-0',
          separada ? 'rounded-b-[28px]' : 'rounded-b-none'
        )}
      >
        <Bienvenida perfil={perfil} datos={datos} />
        {datos ? (
          <Resumen
            datos={datos}
            mesAbierto={mesAbierto}
            onMes={setMesAbierto}
            numerosPlegados={vista === 'proyectos'}
          />
        ) : (
          <ResumenCargando />
        )}
      </div>

      {/* ---------- Tareas: pegadas (Mi día) o despegadas (Proyectos) ---------- */}
      <div
        data-placa={material === 'vidrio' && separada ? '' : undefined}
        className={cn(
          superficie(material),
          material === 'negra' && !separada && 'border-t-0',
          'relative flex flex-col overflow-hidden transition-[margin,border-radius,background-color,box-shadow]',
          EASE,
          tareasPlegadas ? 'flex-none' : 'min-h-[132px] flex-1',
          separada
            ? cn(
                'mt-3 rounded-[28px] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.8)]',
                material === 'actual' && 'bg-[#14100d]/85',
                material === 'vidrio' && 'shadow-none'
              )
            : '-mt-px rounded-b-[28px] rounded-t-none'
        )}
      >
        {/* Divisor que solo existe mientras están pegadas */}
        <div
          aria-hidden
          className={cn(
            'mx-7 h-px shrink-0 bg-white/[0.06] transition-opacity',
            EASE,
            separada ? 'opacity-0' : 'opacity-100'
          )}
        />
        <Tareas
          perfil={perfil}
          datos={datos}
          vista={vista}
          onVista={setVista}
          onCambio={recargar}
          plegadas={tareasPlegadas}
          onDesplegar={() => setMesAbierto(false)}
        />
      </div>
    </section>
  )
}

/** Contenedor que se pliega/despliega con animación de alto (sin medir: grid 0fr ↔ 1fr). */
function Plegable({
  abierto,
  children,
  className,
}: {
  abierto: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid transition-[grid-template-rows,opacity]',
        EASE,
        abierto ? 'opacity-100' : 'opacity-0',
        className
      )}
      style={{ gridTemplateRows: abierto ? '1fr' : '0fr' }}
      aria-hidden={!abierto}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Bienvenida                                                           */
/* ------------------------------------------------------------------ */

function Bienvenida({
  perfil,
  datos,
}: {
  perfil: PerfilEquipo
  datos: DatosBienvenida | null
}) {
  const personaje = getUserInicioImage(perfil.nombre)
  const nombre = perfil.nombre.split(/\s+/)[0] || perfil.nombre
  const [senalado, setSenalado] = useState<string | null>(null)
  const companero = datos?.equipo.find(c => c.id === senalado) ?? null

  return (
    <div className="relative h-[188px] overflow-hidden rounded-t-[28px] px-7 pt-7">
      <div className="relative z-10 max-w-[56%]">
        <p className="text-[13px] text-white/55">{saludo()}</p>
        <h1 className="mt-0.5 text-[44px] font-semibold leading-[1.02] tracking-tight">
          {nombre}
        </h1>
        {/* Fecha ↔ nombre del compañero señalado (se cruzan con fundido) */}
        <div className="relative mt-2 h-5 text-[13px]">
          <p
            className={cn(
              'absolute inset-0 text-white/55 transition-[opacity,transform,filter] first-letter:uppercase',
              CRUCE,
              companero
                ? '-translate-y-1 opacity-0 blur-[2px] duration-200'
                : 'translate-y-0 opacity-100 delay-100'
            )}
          >
            {fechaDeHoy()}
          </p>
          <p
            className={cn(
              'absolute inset-0 whitespace-nowrap transition-[opacity,transform,filter]',
              CRUCE,
              companero
                ? 'translate-y-0 opacity-100 delay-100'
                : 'translate-y-1 opacity-0 blur-[2px] duration-200'
            )}
          >
            {companero ? (
              <>
                <span className="text-white/90">{companero.nombre}</span>
                {companero.ausente ? (
                  <span className="text-white/40"> · hoy no está</span>
                ) : null}
              </>
            ) : null}
          </p>
        </div>
        {datos ? (
          <Equipo
            equipo={datos.equipo}
            activo={senalado}
            onActivo={setSenalado}
          />
        ) : null}
      </div>

      {/* Luz cálida detrás del personaje */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 h-[220px] w-[260px] rounded-tr-[28px] bg-[radial-gradient(circle_at_60%_45%,rgba(224,107,23,0.38),rgba(148,48,10,0.12)_45%,transparent_70%)]"
      />

      {personaje ? (
        // El personaje vive dentro de la tarjeta (recortado por la esquina) y se desvanece abajo.
        <div className="pointer-events-none absolute bottom-0 right-0 top-0 w-[240px] overflow-hidden rounded-tr-[28px] [mask-image:linear-gradient(to_bottom,black_78%,transparent)]">
          <img
            src={personaje}
            alt=""
            draggable={false}
            className="absolute left-1/2 -top-2.5 w-[350px] max-w-none -translate-x-[52%] select-none drop-shadow-[0_12px_30px_rgba(0,0,0,0.5)]"
          />
        </div>
      ) : (
        <div
          className={cn(
            GRADIENTE,
            'absolute bottom-8 right-10 flex size-28 items-center justify-center rounded-full text-3xl font-semibold text-black'
          )}
        >
          {getUserInitials(perfil.nombre)}
        </div>
      )}
    </div>
  )
}

/**
 * Compañeros (los mismos de la barra de la Home actual): bustos sin fondo que se desvanecen
 * abajo, levemente superpuestos. Al pasar el mouse se separan, el señalado crece y muestra su
 * video, y su nombre reemplaza a la fecha mientras tanto. Quien falta hoy, apagado.
 */
function Equipo({
  equipo,
  activo,
  onActivo,
}: {
  equipo: Companero[]
  activo: string | null
  onActivo: (id: string | null) => void
}) {
  if (equipo.length === 0) return null

  return (
    <div className="group/eq mt-3 flex items-end">
      {equipo.map((c, i) => {
        const enVideo = activo === c.id && Boolean(c.video)
        return (
          <div
            key={c.id}
            onMouseEnter={() => onActivo(c.id)}
            onMouseLeave={() => onActivo(null)}
            className={cn(
              'relative size-[60px] shrink-0 origin-bottom transition-[margin,transform,opacity]',
              EASE,
              i > 0 && '-ml-4 group-hover/eq:-ml-1',
              'group-hover/eq:opacity-55 hover:z-10 hover:scale-[1.14] hover:!opacity-100'
            )}
          >
            <div className="absolute inset-0 [mask-image:linear-gradient(to_bottom,black_68%,transparent)]">
              <img
                src={c.foto}
                alt={c.nombre}
                draggable={false}
                className={cn(
                  'h-full w-full select-none object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.45)] transition-opacity duration-150',
                  c.ausente && 'opacity-40 grayscale',
                  enVideo && 'opacity-0'
                )}
              />
              {c.video ? (
                <div
                  className={cn(
                    'absolute inset-0 transition-opacity duration-150',
                    enVideo ? 'opacity-100' : 'pointer-events-none opacity-0'
                  )}
                >
                  <ChromaKeyVideo
                    src={c.video}
                    active={enVideo}
                    circular={false}
                  />
                </div>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Resumen: calendario, feedback, mis números                           */
/* ------------------------------------------------------------------ */

function Flecha({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      onClick={e => e.stopPropagation()}
      className="rounded-full p-1 text-white/30 transition-colors hover:text-white/85"
      aria-label={label}
    >
      <ArrowUpRight className="size-3.5" />
    </Link>
  )
}

function Resumen({
  datos,
  mesAbierto,
  onMes,
  numerosPlegados,
}: {
  datos: DatosBienvenida
  mesAbierto: boolean
  onMes: (abierto: boolean) => void
  numerosPlegados: boolean
}) {
  return (
    <>
      <Calendario datos={datos} abierto={mesAbierto} onAbierto={onMes} />

      <Link
        to="/perfil?tab=lo-mio&sub=feedback"
        className="group flex items-center justify-between border-t border-white/[0.06] px-7 py-3.5 transition-colors hover:bg-white/[0.02]"
      >
        <p className="text-[13px] text-white/55">Feedback</p>
        <span className="flex items-center gap-3">
          {datos.feedbackNoLeido > 0 ? (
            <span className="flex items-center gap-2 text-[14px] font-semibold">
              <span className="size-1.5 rounded-full bg-[#f6a33d] shadow-[0_0_8px_rgba(246,163,61,0.9)]" />
              {datos.feedbackNoLeido === 1
                ? '1 nuevo'
                : `${datos.feedbackNoLeido} nuevos`}
            </span>
          ) : (
            <span className="text-[14px] font-semibold">Al día</span>
          )}
          <ArrowUpRight className="size-3.5 text-white/30 transition-colors group-hover:text-white/85" />
        </span>
      </Link>

      <MisNumeros datos={datos} plegado={numerosPlegados} />
    </>
  )
}

/** Nombre corto de una métrica para la versión en línea (ej. "Envíos con etiqueta" → "con etiqueta"). */
function tituloCorto(titulo: string): string {
  const t = titulo.toLowerCase()
  return t.length > 22 ? `${t.slice(0, 20).trimEnd()}…` : t
}

/** Mis números: completo (valores grandes) o plegado a una línea como Feedback. */
function MisNumeros({
  datos,
  plegado,
}: {
  datos: DatosBienvenida
  plegado: boolean
}) {
  const metricas = datos.numeros?.metricas.slice(0, 3) ?? []

  return (
    <div
      className={cn(
        'border-t border-white/[0.06] px-7 transition-[padding]',
        EASE,
        plegado ? 'py-3.5' : 'py-4'
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="shrink-0 text-[13px] text-white/55">
          Mis números
          {datos.numeros?.label && !plegado ? (
            <span className="text-white/30"> · {datos.numeros.label}</span>
          ) : null}
        </p>
        <div className="flex min-w-0 items-center gap-3">
          {/* Versión plegada: los valores en línea */}
          <span
            className={cn(
              'flex min-w-0 items-center gap-3 overflow-hidden whitespace-nowrap transition-opacity',
              EASE,
              plegado ? 'opacity-100' : 'pointer-events-none w-0 opacity-0'
            )}
          >
            {metricas.slice(0, 2).map(m => (
              <span
                key={m.key}
                className="truncate text-[13px] text-white/45"
                title={m.titulo}
              >
                <span className="text-[14px] font-semibold tabular-nums text-white">
                  {m.valor.toLocaleString('es-AR')}
                </span>{' '}
                {tituloCorto(m.titulo)}
              </span>
            ))}
          </span>
          <Flecha to="/perfil?tab=numeros" label="Ver Mis números" />
        </div>
      </div>

      <Plegable abierto={!plegado}>
        <div className="pt-3">
          {datos.numeros === null ? (
            <div className="grid grid-cols-3 gap-4">
              {[0, 1, 2].map(k => (
                <div
                  key={k}
                  className="h-11 animate-pulse rounded-xl bg-white/[0.04]"
                />
              ))}
            </div>
          ) : metricas.length === 0 ? (
            <p className="text-[13px] text-white/40">
              Todavía no hay números para mostrar.
            </p>
          ) : (
            <div
              className="grid gap-4"
              style={{
                gridTemplateColumns: `repeat(${metricas.length}, minmax(0, 1fr))`,
              }}
            >
              {metricas.map(m => (
                <div key={m.key} className="min-w-0" title={m.comparacion}>
                  <p className="text-[26px] font-semibold leading-none tabular-nums">
                    {m.valor.toLocaleString('es-AR')}
                  </p>
                  <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-white/55">
                    {m.titulo}
                  </p>
                  {m.comparacion ? (
                    <p className="mt-0.5 truncate text-[11px] text-white/30">
                      {m.comparacion}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </Plegable>
    </div>
  )
}

const LETRAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/**
 * Calendario: por defecto la semana actual; un click lo abre al mes (las otras semanas se
 * despliegan alrededor de la actual) y otro click lo vuelve a cerrar. Con el mes abierto se
 * puede ir a otros meses.
 */
function Calendario({
  datos,
  abierto,
  onAbierto,
}: {
  datos: DatosBienvenida
  abierto: boolean
  onAbierto: (abierto: boolean) => void
}) {
  const mesHoy = `${datos.hoy.slice(0, 8)}01`
  // Mes que se está mirando (se guarda el día 1).
  const [mes, setMes] = useState(mesHoy)
  const mesVisto = abierto ? mes : mesHoy
  const lunesHoy = lunesDe(datos.hoy)

  const semanas = useMemo(() => {
    const g = grillaDelMes(mesVisto)
    const dias = datos.dias(g.desde, g.hasta)
    const out: DiaCalendario[][] = []
    for (let i = 0; i < dias.length; i += 7) out.push(dias.slice(i, i + 7))
    return out
  }, [mesVisto, datos])

  const visibles = abierto
    ? semanas.flat()
    : (semanas.find(s => s[0]?.fecha === lunesHoy) ?? [])

  const alternar = () => {
    if (abierto) setMes(mesHoy)
    onAbierto(!abierto)
  }

  const moverMes = (delta: number) => {
    const y = Number(mes.slice(0, 4))
    const m = Number(mes.slice(5, 7)) - 1 + delta
    const d = new Date(Date.UTC(y, m, 1, 12))
    setMes(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={abierto}
      aria-label={abierto ? 'Ver la semana' : 'Ver el mes'}
      onClick={alternar}
      onKeyDown={e => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          alternar()
        }
      }}
      className={cn(
        'group/cal cursor-pointer border-t border-white/[0.06] px-7 py-4 outline-none transition-colors hover:bg-white/[0.015] focus-visible:bg-white/[0.03]',
        // Mes abierto: el calendario se estira y reparte las semanas en el alto que sobra.
        abierto && 'flex min-h-0 flex-1 flex-col'
      )}
    >
      <div className="mb-2 flex h-6 items-center justify-between gap-2">
        <div className="relative h-6 min-w-0 flex-1">
          {/* Título: "Esta semana" ↔ mes con flechas (se cruzan con fundido) */}
          <p
            className={cn(
              'absolute inset-y-0 left-0 flex items-center text-[13px] text-white/55 transition-[opacity,transform,filter]',
              CRUCE,
              abierto
                ? 'pointer-events-none -translate-y-1 opacity-0 blur-[2px] duration-200'
                : 'translate-y-0 opacity-100 delay-100'
            )}
          >
            Esta semana
          </p>
          <div
            className={cn(
              'absolute inset-y-0 -left-1.5 flex items-center gap-0.5 transition-[opacity,transform,filter]',
              CRUCE,
              abierto
                ? 'translate-y-0 opacity-100 delay-100'
                : 'pointer-events-none translate-y-1 opacity-0 blur-[2px] duration-200'
            )}
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              tabIndex={abierto ? 0 : -1}
              onClick={() => moverMes(-1)}
              className="rounded-full p-1 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white"
              aria-label="Mes anterior"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <button
              type="button"
              tabIndex={abierto ? 0 : -1}
              onClick={() => setMes(mesHoy)}
              className={cn(
                'px-1 text-[13px] first-letter:uppercase',
                mes === mesHoy
                  ? 'text-white/55'
                  : 'text-white/85 hover:text-white'
              )}
              title={mes === mesHoy ? undefined : 'Volver a este mes'}
            >
              {nombreMes(mes)}
            </button>
            <button
              type="button"
              tabIndex={abierto ? 0 : -1}
              onClick={() => moverMes(1)}
              className="rounded-full p-1 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white"
              aria-label="Mes siguiente"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
        <span className="flex items-center gap-1">
          <span className="text-[12px] text-transparent transition-colors group-hover/cal:text-white/35">
            {abierto ? 'Ver semana' : 'Ver mes'}
          </span>
          <Flecha to="/perfil?tab=dia" label="Ver calendario" />
        </span>
      </div>

      <div className="grid grid-cols-7">
        {LETRAS.map((l, i) => (
          <span key={i} className="pb-1 text-center text-[11px] text-white/35">
            {l}
          </span>
        ))}
      </div>

      {/* Semanas: la actual siempre; las demás se despliegan a su alrededor */}
      <div
        className={cn(
          'flex flex-col',
          abierto && 'min-h-0 flex-1 justify-evenly'
        )}
      >
        {semanas.map(semana => {
          const actual = semana[0]?.fecha === lunesHoy && mesVisto === mesHoy
          return (
            <Plegable key={semana[0]?.fecha} abierto={abierto || actual}>
              <div className="grid grid-cols-7 py-0.5">
                {semana.map(d => (
                  <Dia
                    key={d.fecha}
                    dia={d}
                    chico={abierto}
                    fuera={
                      abierto && d.fecha.slice(0, 7) !== mesVisto.slice(0, 7)
                    }
                  />
                ))}
              </div>
            </Plegable>
          )
        })}
      </div>

      <p className="mt-2 truncate text-[13px] text-white/65">
        {pieCalendario(datos, visibles, abierto ? 'mes' : 'semana')}
      </p>
    </div>
  )
}

/**
 * Un día del calendario. Los eventos marcan el círculo del número: feriado = fondo gris,
 * vacaciones / cambio de día = fondo naranja tenue, cumpleaños = borde ámbar (se combina con
 * los otros). Las tareas van con un punto blanco abajo. Sábado y domingo, en gris.
 */
function Dia({
  dia,
  chico,
  fuera,
}: {
  dia: DiaCalendario
  chico?: boolean
  fuera?: boolean
}) {
  const detalle = [
    dia.feriado ? `Feriado: ${dia.feriado}` : null,
    dia.ausencia
      ? dia.ausencia === 'vacaciones'
        ? 'Vacaciones'
        : 'Cambio de día'
      : null,
    dia.cumples.length ? `Cumpleaños: ${dia.cumples.join(', ')}` : null,
    dia.tareas ? (dia.tareas === 1 ? '1 tarea' : `${dia.tareas} tareas`) : null,
  ].filter(Boolean)
  const wd = weekdayOfKey(dia.fecha)
  const finDeSemana = wd === 0 || wd === 6

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-0.5 transition-opacity',
        EASE,
        fuera && 'opacity-30'
      )}
      title={detalle.join(' · ') || undefined}
    >
      <span
        className={cn(
          'flex items-center justify-center rounded-full tabular-nums transition-[width,height,font-size,background-color,color,box-shadow]',
          EASE,
          chico ? 'size-7 text-[12px]' : 'size-9 text-[14px]',
          dia.esHoy
            ? `${GRADIENTE} font-semibold text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]`
            : dia.feriado
              ? 'bg-white/[0.1] text-white/70'
              : dia.ausencia
                ? 'bg-[#e06b17]/20 text-[#f6a33d]'
                : finDeSemana
                  ? 'text-white/35'
                  : 'text-white/85',
          dia.cumples.length > 0 &&
            (dia.esHoy
              ? 'ring-2 ring-[#f6a33d] ring-offset-2 ring-offset-[#0d0b0a]'
              : 'ring-1 ring-inset ring-[#f6a33d]/80')
        )}
      >
        {Number(dia.fecha.slice(8))}
      </span>
      <span
        className={cn(
          'size-1 rounded-full bg-white transition-opacity',
          dia.tareas ? 'opacity-100' : 'opacity-0'
        )}
      />
    </div>
  )
}

function ResumenCargando() {
  return (
    <div className="space-y-3 border-t border-white/[0.06] px-7 py-4">
      <div className="h-24 animate-pulse rounded-2xl bg-white/[0.04]" />
      <div className="h-8 animate-pulse rounded-2xl bg-white/[0.04]" />
      <div className="h-16 animate-pulse rounded-2xl bg-white/[0.04]" />
    </div>
  )
}

/** Píldora de opciones con indicador que se desliza. */
function Segmento<T extends string>({
  opciones,
  valor,
  onCambio,
}: {
  opciones: ReadonlyArray<readonly [T, string]>
  valor: T
  onCambio: (v: T) => void
}) {
  const i = Math.max(
    0,
    opciones.findIndex(([v]) => v === valor)
  )
  return (
    <div className="relative flex rounded-full bg-white/[0.05] p-1 text-[13px]">
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-1 left-1 rounded-full bg-white/[0.1] transition-transform',
          EASE
        )}
        style={{
          width: `calc((100% - 8px) / ${opciones.length})`,
          transform: `translateX(${i * 100}%)`,
        }}
      />
      {opciones.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onCambio(v)}
          className={cn(
            'relative z-10 w-[92px] rounded-full py-1.5 transition-colors',
            valor === v ? 'text-white' : 'text-white/45 hover:text-white/75'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Tareas: Mi día ↔ Proyectos                                           */
/* ------------------------------------------------------------------ */

function Tareas({
  perfil,
  datos,
  vista,
  onVista,
  onCambio,
  plegadas,
  onDesplegar,
}: {
  perfil: PerfilEquipo
  datos: DatosBienvenida | null
  vista: Vista
  onVista: (v: Vista) => void
  onCambio: () => Promise<void>
  /** Con el mes abierto, las tareas quedan en una línea; al tocarla se cierra el mes. */
  plegadas: boolean
  onDesplegar: () => void
}) {
  const { toast } = useToast()
  const [dialogo, setDialogo] = useState(false)
  const [guardando, setGuardando] = useState(false)

  // Deslizar: arrastre (mouse / táctil) o desplazamiento horizontal del trackpad.
  const inicioX = useRef<number | null>(null)
  const ruedaX = useRef(0)
  const ir = (dx: number) => {
    if (dx < -50) onVista('proyectos')
    else if (dx > 50) onVista('dia')
  }

  const guardar = async (value: TareaRecurrenteFormValue) => {
    setGuardando(true)
    try {
      await crearTareaRecurrente({
        userId: perfil.userId,
        ...value,
        orden: 999,
      })
      toast({ title: 'Tarea creada' })
      setDialogo(false)
      await onCambio()
    } catch (err) {
      toast({
        title: 'No se pudo crear',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setGuardando(false)
    }
  }

  const hechas = datos?.hechasHoy ?? 0
  const total = datos ? datos.tareasHoy.length + hechas : 0

  if (plegadas) {
    const n = datos
      ? vista === 'dia'
        ? datos.tareasHoy.length
        : datos.proyectos.length
      : 0
    const texto =
      vista === 'dia'
        ? n === 0
          ? 'Nada pendiente'
          : n === 1
            ? '1 para hoy'
            : `${n} para hoy`
        : n === 1
          ? '1 abierta'
          : `${n} abiertas`
    return (
      <button
        type="button"
        onClick={onDesplegar}
        className="group flex w-full items-center justify-between px-7 py-3.5 text-left transition-colors hover:bg-white/[0.02]"
      >
        <span className="text-[13px] text-white/55">
          {vista === 'dia' ? 'Mi día' : 'Proyectos'}
        </span>
        <span className="flex items-center gap-3">
          <span className="text-[14px] font-semibold">{texto}</span>
          <ChevronDown className="size-3.5 text-white/30 transition-colors group-hover:text-white/85" />
        </span>
      </button>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-4">
      <div className="flex shrink-0 items-center justify-between px-7">
        <Segmento
          opciones={[
            ['dia', 'Mi día'],
            ['proyectos', 'Proyectos'],
          ]}
          valor={vista}
          onCambio={onVista}
        />
        {vista === 'dia' ? (
          <button
            type="button"
            onClick={() => setDialogo(true)}
            className="flex h-8 items-center gap-1.5 rounded-full bg-white/[0.07] px-3.5 text-[13px] text-white/85 transition-colors hover:bg-white/[0.12]"
          >
            <Plus className="size-3.5" />
            Sumar
          </button>
        ) : (
          <Link
            to="/innovacion"
            className="flex h-8 items-center gap-1 rounded-full px-3 text-[13px] text-white/55 transition-colors hover:text-white"
          >
            Innovación
            <ArrowUpRight className="size-3.5" />
          </Link>
        )}
      </div>

      {/* Avance del día (solo en Mi día y si hay algo) */}
      <div
        className={cn(
          'shrink-0 overflow-hidden px-7 transition-[max-height,opacity]',
          EASE,
          vista === 'dia' && total > 0
            ? 'max-h-10 opacity-100'
            : 'max-h-0 opacity-0'
        )}
      >
        <div className="flex items-center gap-3 pt-3.5">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className={cn(
                GRADIENTE,
                'h-full rounded-full transition-[width] duration-700'
              )}
              style={{ width: `${total ? (100 * hechas) / total : 0}%` }}
            />
          </div>
          <span className="shrink-0 text-[12px] tabular-nums text-white/45">
            {hechas} de {total} hechas
          </span>
        </div>
      </div>

      <div
        className="relative mt-3 min-h-0 flex-1 overflow-hidden"
        onPointerDown={e => {
          if (e.pointerType === 'mouse' && e.button !== 0) return
          inicioX.current = e.clientX
        }}
        onPointerUp={e => {
          if (inicioX.current !== null) ir(e.clientX - inicioX.current)
          inicioX.current = null
        }}
        onPointerCancel={() => (inicioX.current = null)}
        onWheel={e => {
          if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
          ruedaX.current -= e.deltaX
          if (Math.abs(ruedaX.current) > 60) {
            ir(ruedaX.current)
            ruedaX.current = 0
          }
        }}
      >
        <div
          className={cn('flex h-full w-[200%] transition-transform', EASE)}
          style={{
            transform: vista === 'dia' ? 'translateX(0)' : 'translateX(-50%)',
          }}
        >
          <div className="h-full w-1/2 overflow-y-auto px-7 pb-5 [scrollbar-width:thin]">
            <MiDia
              datos={datos}
              onSumar={() => setDialogo(true)}
              onCambio={onCambio}
            />
          </div>
          <div className="h-full w-1/2 overflow-y-auto px-7 pb-5 [scrollbar-width:thin]">
            <Proyectos datos={datos} />
          </div>
        </div>
      </div>

      {datos ? (
        <NuevaTareaDialog
          open={dialogo}
          onOpenChange={setDialogo}
          hoy={datos.hoy}
          saving={guardando}
          onSave={guardar}
        />
      ) : null}
    </div>
  )
}

function MiDia({
  datos,
  onSumar,
  onCambio,
}: {
  datos: DatosBienvenida | null
  onSumar: () => void
  onCambio: () => Promise<void>
}) {
  if (!datos) return <ListaCargando />
  if (datos.tareasHoy.length === 0) {
    return (
      <div className="flex flex-col items-start gap-1 py-1">
        <p className="text-[15px] font-semibold">
          {datos.hechasHoy > 0 ? 'Listo por hoy' : 'Nada pendiente para hoy'}
        </p>
        <p className="text-[13px] text-white/45">
          {datos.hechasHoy > 0
            ? 'Terminaste todas tus tareas. '
            : 'Lo que agendes para hoy (o lo que quedó atrasado) aparece acá. '}
          <button
            type="button"
            onClick={onSumar}
            className="text-white/75 underline-offset-2 hover:underline"
          >
            Sumar una tarea
          </button>
        </p>
      </div>
    )
  }
  return (
    <ul className="space-y-2">
      {datos.tareasHoy.map(oc => (
        <li
          key={`${oc.tareaId}-${oc.fechaProgramada}`}
          className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.04] py-2.5 pl-4 pr-2"
        >
          {/* El título sigue en la línea de abajo si es largo; los botones quedan fijos a la derecha */}
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm leading-snug">{oc.titulo}</p>
            {oc.estado === 'atrasada' ? (
              <Estado tono="aviso" className="mt-0.5 text-xs text-white/50">
                Atrasada
                {oc.vecesAtrasada && oc.vecesAtrasada > 1
                  ? ` (${oc.vecesAtrasada} veces)`
                  : ''}
              </Estado>
            ) : null}
          </div>
          <div className="shrink-0 [&>div]:flex-nowrap">
            <AccionesTarea
              ocurrencia={oc}
              feriados={datos.feriados}
              misAusencias={datos.misAusencias}
              onChanged={onCambio}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

function Proyectos({ datos }: { datos: DatosBienvenida | null }) {
  if (!datos) return <ListaCargando />
  if (datos.proyectos.length === 0) {
    return (
      <div className="py-1">
        <p className="text-[15px] font-semibold">Sin tareas de proyecto</p>
        <p className="mt-1 text-[13px] text-white/45">
          Las tareas de Innovación que te asignen aparecen acá.
        </p>
      </div>
    )
  }
  return (
    <ul className="space-y-2">
      {datos.proyectos.map(({ task, project, area }) => (
        <li key={task.id}>
          <Link
            to="/innovacion"
            className="block rounded-2xl bg-white/[0.04] px-4 py-3 transition-colors hover:bg-white/[0.07]"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 text-sm">{task.title}</p>
              {task.dueDate ? (
                <span
                  className={cn(
                    'shrink-0 text-[12px] tabular-nums',
                    task.dueDate.slice(0, 10) < datos.hoy
                      ? 'text-[#f6a33d]'
                      : 'text-white/40'
                  )}
                >
                  {fechaCorta(task.dueDate)}
                </span>
              ) : null}
            </div>
            <p className="mt-1 flex items-center gap-1.5 truncate text-[12px] text-white/45">
              {area?.color ? (
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: area.color }}
                />
              ) : null}
              {project?.title ?? 'Proyecto'} · {task.status}
            </p>
            <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className={cn(GRADIENTE, 'h-full rounded-full')}
                style={{
                  width: `${Math.max(0, Math.min(100, task.progress))}%`,
                }}
              />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function ListaCargando() {
  return (
    <div className="space-y-2">
      {[0, 1].map(k => (
        <div
          key={k}
          className="h-14 animate-pulse rounded-2xl bg-white/[0.04]"
        />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Textos                                                               */
/* ------------------------------------------------------------------ */

const TZ = 'America/Argentina/Buenos_Aires'

function saludo() {
  const h = Number(
    new Intl.DateTimeFormat('es-AR', {
      hour: 'numeric',
      hour12: false,
      timeZone: TZ,
    }).format(new Date())
  )
  if (h < 13) return 'Buen día'
  if (h < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

function fechaDeHoy() {
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: TZ,
  }).format(new Date())
}

function fechaCorta(key: string) {
  const d = new Date(`${key.slice(0, 10)}T12:00:00`)
  return Number.isNaN(d.getTime())
    ? key
    : d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function nombreMes(key: string) {
  return new Date(`${key}T12:00:00`).toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
  })
}

function nombreDia(key: string) {
  const s = new Date(`${key}T12:00:00`).toLocaleDateString('es-AR', {
    weekday: 'long',
  })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Pie del calendario: quién falta hoy y lo próximo para destacar (feriado, cumpleaños, ausencia). */
function pieCalendario(
  datos: DatosBienvenida,
  dias: DiaCalendario[],
  modo: 'semana' | 'mes'
): string {
  const partes: string[] = []
  if (datos.faltanHoy.length) {
    partes.push(
      datos.faltanHoy.length === 1
        ? `Hoy no está ${datos.faltanHoy[0]}`
        : `Hoy no están ${datos.faltanHoy.join(' y ')}`
    )
  }
  for (const d of dias) {
    if (d.fecha < datos.hoy) continue
    const cuando = d.esHoy
      ? 'Hoy'
      : modo === 'semana'
        ? nombreDia(d.fecha)
        : `${nombreDia(d.fecha)} ${Number(d.fecha.slice(8))}`
    const evento = d.feriado
      ? `feriado (${d.feriado})`
      : d.cumples.length
        ? `cumpleaños de ${d.cumples.join(' y ')}`
        : d.ausencia
          ? d.ausencia === 'vacaciones'
            ? 'estás de vacaciones'
            : 'cambio de día'
          : null
    if (evento) {
      partes.push(`${cuando}: ${evento}`)
      break
    }
  }
  if (partes.length) return partes.join(' · ')
  return modo === 'semana'
    ? 'Están todos. Semana sin feriados ni cumpleaños.'
    : 'Están todos. Sin feriados ni cumpleaños por delante.'
}
