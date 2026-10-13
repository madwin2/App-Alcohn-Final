import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowUpRight,
  Cake,
  Check,
  ChevronDown,
  GripVertical,
  MessageCircle,
  PackagePlus,
  Palmtree,
  Pause,
  Pencil,
  Pin,
  Play,
  Plus,
  Repeat,
  Search,
  SkipForward,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * Dibujos de la guía de Mi perfil. Se dibujan sobre un lienzo fijo (LIENZO) y
 * PerfilTourVisual los escala para que entren enteros en cualquier tamaño.
 * Los textos y botones copian los de /perfil; los números (Marca) coinciden con
 * los pasos de `perfilOnboarding.ts`.
 */
export const LIENZO = { w: 640, h: 460 } as const;

/** Número de paso que está mirando la persona (hover en el texto): se resalta su marca. */
const MarcaActivaContext = createContext<number | null>(null);
export const MarcaActivaProvider = MarcaActivaContext.Provider;

function Stage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn('flex size-full flex-col gap-4 bg-[#0c0c0e] p-7 text-zinc-100', className)}
      style={{ width: LIENZO.w, height: LIENZO.h }}
    >
      {children}
    </div>
  );
}

/** Anillo ámbar + número de paso sobre un trozo de la pantalla. */
function Marca({
  n,
  children,
  className,
  forma = 'pill',
  pos = 'tr',
  style,
}: {
  n: number;
  children: ReactNode;
  className?: string;
  forma?: 'pill' | 'box';
  pos?: 'tr' | 'tl' | 'abajo';
  style?: CSSProperties;
}) {
  const activa = useContext(MarcaActivaContext);
  const resaltada = activa === n;
  const apagada = activa !== null && !resaltada;
  return (
    <div className={cn('relative', className)} style={style}>
      {children}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute -inset-1.5 ring-2 ring-amber-400/85 transition-all duration-200',
          forma === 'pill' ? 'rounded-full' : 'rounded-[22px]',
          resaltada && 'bg-amber-400/[0.07] ring-amber-300',
          apagada && 'opacity-25',
        )}
      />
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute z-20 flex size-6 items-center justify-center rounded-full bg-amber-400 text-[12px] font-bold text-zinc-950 shadow-lg ring-[3px] ring-[#0c0c0e] transition-all duration-200',
          pos === 'tr' && '-right-3.5 -top-3.5',
          pos === 'tl' && '-left-3.5 -top-3.5',
          pos === 'abajo' && '-bottom-11 left-1/2 -translate-x-1/2',
          resaltada && 'scale-125 bg-amber-300',
          apagada && 'opacity-40',
        )}
      >
        {n}
      </span>
    </div>
  );
}

/** Mismo material que Panel de Economía / Mi perfil. */
function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-3xl bg-white/[0.035] p-5', className)}>{children}</div>;
}

function Boton({ icon, children, className }: { icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full bg-white/[0.07] px-4 text-[13px] text-zinc-100',
        className,
      )}
    >
      {icon ? <span className="text-zinc-400 [&>svg]:size-4">{icon}</span> : null}
      {children}
    </span>
  );
}

function Pildoras({ items, activo, chicas }: { items: ReactNode[]; activo: number; chicas?: boolean }) {
  return (
    <div className={cn('inline-flex w-fit items-center gap-0.5 rounded-full', !chicas && 'bg-white/[0.05] p-1')}>
      {items.map((it, i) => (
        <span
          key={i}
          className={cn(
            'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full',
            chicas ? 'px-3.5 py-1 text-[13px]' : 'px-4 py-1.5 text-[14px]',
            i === activo ? 'bg-white/[0.14] text-white' : 'text-zinc-400',
          )}
        >
          {it}
        </span>
      ))}
    </div>
  );
}

function Insignia({ n }: { n: number }) {
  return (
    <span className="min-w-[18px] rounded-full bg-[#e0812f] px-1.5 text-center text-[10px] font-semibold leading-[18px] text-black">
      {n}
    </span>
  );
}

function Segmento({ opciones, activo }: { opciones: string[]; activo: number }) {
  return (
    <div className="inline-flex rounded-full bg-white/[0.06] p-0.5 text-[12px]">
      {opciones.map((o, i) => (
        <span
          key={o}
          className={cn('rounded-full px-3 py-1', i === activo ? 'bg-white/[0.14] text-white' : 'text-zinc-500')}
        >
          {o}
        </span>
      ))}
    </div>
  );
}

function Dato({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-[12px] text-zinc-500">{label}</p>
      <p className="mt-0.5 text-[17px] font-semibold tracking-tight">{value}</p>
      {hint ? <p className="text-[11px] text-zinc-500">{hint}</p> : null}
    </div>
  );
}

const TABS_PERFIL = (badge = true) => [
  'Mi día',
  'Tareas',
  <>
    Lo mío
    {badge ? <Insignia n={2} /> : null}
  </>,
  'Mis números',
];

/* ------------------------------------------------------------------ */

export function MockIntro() {
  return (
    <Stage className="justify-center gap-7">
      <div className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="relative size-16 shrink-0">
            <div className="flex size-full items-center justify-center rounded-3xl bg-white/[0.07] text-xl font-semibold text-zinc-300">
              VOS
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-sky-400 ring-4 ring-[#0c0c0e]" />
          </div>
          <div>
            <p className="text-[24px] font-semibold leading-tight tracking-tight">Tu nombre</p>
            <p className="mt-0.5 text-[13px] text-zinc-500">Tu puesto · Tu área</p>
          </div>
        </div>
        <Marca n={1} forma="box">
          <div className="flex gap-7 px-1 py-0.5">
            <Dato label="En Alcohn" value="2 años" hint="desde el 1 de marzo" />
            <Dato label="Vacaciones" value="12 días" hint="disponibles" />
            <Dato label="Cumpleaños" value="21 de octubre" />
          </div>
        </Marca>
      </div>

      <Marca n={2} pos="tl" className="w-fit">
        <Pildoras
          items={[
            'Mi día',
            'Tareas',
            <>
              Lo mío
              {/* El número va abajo, afuera de la píldora, para no tapar la insignia */}
              <Marca n={3} pos="abajo">
                <Insignia n={2} />
              </Marca>
            </>,
            'Mis números',
          ]}
          activo={0}
        />
      </Marca>

      <Panel className="space-y-3 opacity-45">
        <p className="text-[12px] text-zinc-500">Martes 13 de octubre</p>
        <p className="text-[20px] font-semibold tracking-tight">2 tareas para hoy</p>
        <div className="h-11 rounded-2xl bg-white/[0.03]" />
        <div className="h-11 rounded-2xl bg-white/[0.03]" />
      </Panel>
    </Stage>
  );
}

export function MockMiDia() {
  const fila = (titulo: string, extra: ReactNode, conMarcas = false) => (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.03] px-4 py-3">
      <div>
        <p className="text-[14px] text-zinc-100">{titulo}</p>
        {extra}
      </div>
      <div className="flex items-center gap-1.5">
        {conMarcas ? (
          <>
            <Marca n={2}>
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/[0.08] px-3.5 text-[12px]">
                <Check className="size-3.5" />
                Hecha
              </span>
            </Marca>
            <Marca n={3} className="ml-3">
              <span className="inline-flex h-8 items-center gap-0.5 rounded-full bg-white/[0.06] px-3 text-[12px] text-zinc-300">
                Más
                <ChevronDown className="size-3.5" />
              </span>
            </Marca>
          </>
        ) : (
          <>
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/[0.08] px-3.5 text-[12px]">
              <Check className="size-3.5" />
              Hecha
            </span>
            <span className="inline-flex h-8 items-center gap-0.5 rounded-full px-3 text-[12px] text-zinc-500">
              Más
              <ChevronDown className="size-3.5" />
            </span>
          </>
        )}
      </div>
    </div>
  );

  return (
    <Stage className="justify-center">
      <Panel className="relative space-y-5 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] text-zinc-500">Martes 13 de octubre</p>
            <p className="mt-1 text-[22px] font-semibold tracking-tight">3 tareas para hoy</p>
          </div>
          <Marca n={1}>
            <Boton icon={<Plus />}>Tarea para hoy</Boton>
          </Marca>
        </div>

        <div className="space-y-2">
          {fila('Revisar cotizaciones', null, true)}
          {fila(
            'Limpiar la CNC',
            <p className="mt-1 flex items-center gap-1.5 text-[12px] text-zinc-500">
              <span className="size-1.5 rounded-full bg-amber-400" />
              Atrasada
            </p>,
          )}
          {fila('Subir fotos de pedidos', null)}
        </div>

        {/* Menú «Más» abierto */}
        <div className="absolute right-8 top-[150px] z-10 w-52 rounded-xl border border-white/10 bg-[#18181b] p-1 text-[13px] shadow-2xl">
          <p className="flex items-center gap-2 rounded-lg bg-white/[0.06] px-2.5 py-1.5">
            <SkipForward className="size-3.5 text-zinc-400" />
            Posponer
          </p>
          <p className="px-2.5 py-1.5 pl-[30px] text-zinc-300">Mover a otro día…</p>
          <p className="px-2.5 py-1.5 pl-[30px] text-zinc-300">No hecha</p>
        </div>
      </Panel>
    </Stage>
  );
}

export function MockMiDiaResumen() {
  return (
    <Stage className="justify-center">
      <div className="grid grid-cols-[1.25fr_1fr] gap-4">
        <Panel className="flex flex-col p-5">
          <p className="text-[12px] text-zinc-500">Martes 13 de octubre</p>
          <p className="mt-1 text-[19px] font-semibold tracking-tight">3 tareas para hoy</p>
          <div className="mt-4 space-y-2 opacity-40">
            <div className="h-10 rounded-2xl bg-white/[0.04]" />
            <div className="h-10 rounded-2xl bg-white/[0.04]" />
          </div>
          <div className="mt-auto space-y-5 pt-8">
            <Marca n={1} forma="box" className="w-fit">
              <div className="flex gap-2">
                <Boton icon={<Palmtree />}>Vacaciones</Boton>
                <Boton icon={<Repeat />}>Cambio de día</Boton>
              </div>
            </Marca>
            <Marca n={2} forma="box" className="w-fit">
              <div className="flex gap-2">
                <Boton icon={<PackagePlus />}>Pedir algo</Boton>
                <Boton icon={<Pin />}>Pinchar una idea</Boton>
              </div>
            </Marca>
          </div>
        </Panel>

        <Panel className="flex flex-col divide-y divide-white/[0.06] px-5 py-1">
          <Marca n={3} forma="box" className="my-3">
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <Dato label="Hoy no están" value="Todos" hint="están en la oficina" />
                <Dato label="Tus vacaciones" value="12 días" hint="disponibles" />
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-[12px] text-zinc-500">
                  <Cake className="size-3.5" />
                  Cumpleaños
                </p>
                <p className="mt-1 flex justify-between text-[13px]">
                  Ana <span className="text-[12px] text-zinc-500">21 de octubre</span>
                </p>
              </div>
            </div>
          </Marca>
          <Marca n={4} forma="box" className="my-3">
            <div className="grid grid-cols-2 gap-3 py-2">
              {[
                ['Corcho', '2 ideas nuevas'],
                ['Feedback', '1 sin leer'],
              ].map(([t, v]) => (
                <div key={t}>
                  <p className="flex items-center justify-between text-[12px] text-zinc-500">
                    {t}
                    <ArrowUpRight className="size-3.5 opacity-50" />
                  </p>
                  <p className="mt-0.5 text-[13px] font-medium">{v}</p>
                </div>
              ))}
            </div>
          </Marca>
        </Panel>
      </div>
    </Stage>
  );
}

export function MockCalendario() {
  const dias = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
  const semanas = [
    [12, 13, 14, 15, 16, 17, 18],
    [19, 20, 21, 22, 23, 24, 25],
  ];
  const rayado =
    'repeating-linear-gradient(135deg, rgba(255,255,255,0.025) 0 6px, transparent 6px 12px)';
  return (
    <Stage className="gap-3.5 py-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[15px] font-medium">Calendario del equipo</p>
          <p className="mt-0.5 text-[12px] text-zinc-500">Vacaciones, cambios de día, feriados, cumpleaños y tus tareas.</p>
        </div>
        <Marca n={1}>
          <Boton icon={<Plus />}>
            Agregar
            <ChevronDown className="size-3.5 opacity-70" />
          </Boton>
        </Marca>
      </div>

      <div className="flex items-center justify-between">
        <Marca n={2}>
          <div className="flex items-center gap-1 text-[12px]">
            <span className="rounded-full bg-white/[0.12] px-3 py-1">Todos</span>
            <span className="rounded-full px-3 py-1 text-zinc-400">Solo yo</span>
            <span className="mx-1 h-4 w-px bg-white/10" />
            <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-zinc-400">
              <span className="size-2 rounded-full bg-sky-400" />
              Ana
            </span>
            <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-zinc-400">
              <span className="size-2 rounded-full bg-emerald-400" />
              Tomi
            </span>
          </div>
        </Marca>
        <Marca n={3}>
          <Segmento opciones={['Mes', 'Semana', 'Próximos días']} activo={0} />
        </Marca>
      </div>

      <p className="text-[18px] font-semibold tracking-tight">Octubre 2026</p>

      <div className="relative overflow-visible rounded-2xl bg-white/[0.02]">
        <div className="grid grid-cols-7 border-b border-white/[0.06] text-[11px] text-zinc-500">
          {dias.map((d) => (
            <span key={d} className="px-2 py-1.5">
              {d}
            </span>
          ))}
        </div>
        {semanas.map((sem, si) => (
          <div key={si} className="relative grid grid-cols-7 border-b border-white/[0.06] last:border-0">
            {sem.map((n, di) => {
              const finde = di >= 5;
              const rango = n === 22 || n === 23;
              return (
                <div
                  key={n}
                  style={finde ? { backgroundImage: rayado } : undefined}
                  className={cn(
                    'flex h-[74px] flex-col gap-1 border-r border-white/[0.06] px-1.5 pt-1.5 last:border-r-0',
                    rango && 'bg-[#e0812f]/[0.14]',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[12px] tabular-nums',
                        n === 13
                          ? 'bg-gradient-to-br from-[#e0812f] to-[#f6c46b] font-semibold text-black'
                          : finde
                            ? 'text-zinc-600'
                            : 'text-zinc-300',
                      )}
                    >
                      {n}
                    </span>
                    {n === 22 ? (
                      <span className="inline-flex size-5 items-center justify-center rounded-full bg-white/10 text-zinc-200">
                        <Plus className="size-3" />
                      </span>
                    ) : null}
                  </div>
                  {n === 14 ? (
                    <span className="truncate rounded-md bg-[#e0812f]/20 px-1.5 py-0.5 text-[10px] text-[#f6c46b]">
                      Revisar stock
                    </span>
                  ) : null}
                  {n === 21 ? <span className="truncate px-1 text-[10px] text-zinc-400">🎂 Ana</span> : null}
                </div>
              );
            })}
            {si === 0 ? (
              <span
                className="absolute top-[34px] flex h-[18px] items-center gap-1.5 rounded-md px-2 text-[10px] font-medium text-white/90"
                style={{
                  left: `calc(${(3 / 7) * 100}% + 4px)`,
                  width: `calc(${(2 / 7) * 100}% - 8px)`,
                  backgroundColor: '#34d39952',
                  boxShadow: 'inset 3px 0 0 #34d399',
                }}
              >
                Tomi <span className="font-normal text-white/50">vacaciones</span>
              </span>
            ) : null}
            {si === 1 ? (
              // Rango arrastrado: 22 y 23 (jueves y viernes)
              <Marca
                n={4}
                forma="box"
                className="!absolute inset-y-1.5"
                style={{ left: `calc(${(3 / 7) * 100}% + 4px)`, width: `calc(${(2 / 7) * 100}% - 8px)` }}
              >
                <span className="block size-full" />
              </Marca>
            ) : null}
          </div>
        ))}
      </div>
    </Stage>
  );
}

export function MockTareas() {
  const fila = (titulo: string, sub: string, pausada = false) => (
    <div className="flex items-center gap-2.5 rounded-2xl bg-white/[0.03] px-3 py-2.5">
      <GripVertical className="size-4 shrink-0 text-zinc-600" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px]">{titulo}</p>
        <p className="text-[11px] text-zinc-500">{sub}</p>
      </div>
      <Pencil className="size-3.5 text-zinc-500" />
      {pausada ? <Play className="size-3.5 text-zinc-500" /> : <Pause className="size-3.5 text-zinc-500" />}
    </div>
  );
  const titulo = (t: string, sub: string) => (
    <div className="mb-3">
      <p className="text-[14px] font-medium">{t}</p>
      <p className="text-[11px] text-zinc-500">{sub}</p>
    </div>
  );
  return (
    <Stage className="gap-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-zinc-400">
          Lo que tenés que hacer y cada cuánto. Se marcan como hechas desde Mi día.
        </p>
        <Marca n={1}>
          <Boton icon={<Plus />}>Nueva tarea</Boton>
        </Marca>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Marca n={2} forma="box" pos="tl" className="col-span-2">
          <div className="grid grid-cols-2 gap-4">
            <Panel className="p-4">
              {titulo('Diarias', '2 tareas · arrastrá para ordenar')}
              <div className="space-y-1.5">
                {fila('Revisar cotizaciones', 'Todos los días')}
                {fila('Contestar mensajes', 'Todos los días')}
              </div>
            </Panel>
            <Panel className="p-4">
              {titulo('Semanales', '2 tareas · arrastrá para ordenar')}
              <div className="space-y-1.5">
                {fila('Limpiar la CNC', 'Lunes y jueves')}
                {fila('Revisar stock', 'Viernes')}
              </div>
            </Panel>
          </div>
        </Marca>
        <Panel className="p-4 opacity-60">
          {titulo('Mensuales', '1 tarea · arrastrá para ordenar')}
          {fila('Cierre de mes', 'Día 1')}
        </Panel>
        <Marca n={3} forma="box">
          <Panel className="p-4">
            {titulo('Pausadas', 'No aparecen en Mi día hasta que las reactives')}
            {fila('Inventario de insumos', 'Cada 15 días', true)}
          </Panel>
        </Marca>
      </div>
    </Stage>
  );
}

export function MockLoMio() {
  const subs = ['Anotaciones', 'Lo que necesito', 'Crecimiento', 'Feedback'];
  return (
    <Stage className="gap-6 pt-9">
      <div className="opacity-50">
        <Pildoras items={TABS_PERFIL(true)} activo={2} />
      </div>
      <div className="flex gap-4">
        {subs.map((s, i) => (
          <Marca key={s} n={i + 1}>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px]',
                i === 0 ? 'bg-white/[0.14] text-white' : 'bg-white/[0.04] text-zinc-400',
              )}
            >
              {s}
              {s === 'Feedback' ? <Insignia n={2} /> : null}
            </span>
          </Marca>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-[180px_1fr] gap-4">
        <Panel className="space-y-2 p-3">
          <div className="flex items-center gap-1.5">
            <span className="flex h-8 flex-1 items-center gap-1.5 rounded-full bg-white/[0.05] px-3 text-[12px] text-zinc-500">
              <Search className="size-3.5" />
              Buscar…
            </span>
            <span className="inline-flex size-8 items-center justify-center rounded-full bg-white/[0.07]">
              <Plus className="size-4" />
            </span>
          </div>
          <p className="rounded-xl bg-white/[0.07] px-3 py-2 text-[12px]">Ideas para catálogo</p>
          <p className="rounded-xl px-3 py-2 text-[12px] text-zinc-500">Pasos para el Aspire</p>
          <p className="rounded-xl px-3 py-2 text-[12px] text-zinc-500">Clientes a llamar</p>
        </Panel>
        <Panel className="space-y-3 p-4">
          <p className="text-[19px] font-semibold tracking-tight">Ideas para catálogo</p>
          <div className="space-y-1 rounded-2xl bg-black/25 p-3 font-mono text-[11px] leading-relaxed text-zinc-400">
            <p>## Para probar</p>
            <p>- Fotos con fondo de madera</p>
            <p>- Sellos chicos en grilla</p>
          </div>
        </Panel>
      </div>
    </Stage>
  );
}

export function MockNumeros() {
  const barras = [18, 24, 21, 30, 32, 38];
  const meses = ['may', 'jun', 'jul', 'ago', 'sep', 'oct'];
  return (
    <Stage className="justify-center gap-6">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-zinc-400">Solo los ves vos.</p>
        <Marca n={1}>
          <Segmento opciones={['Semana', 'Mes', 'Año']} activo={1} />
        </Marca>
      </div>

      <Marca n={2} forma="box">
        <Panel className="grid grid-cols-2 divide-x divide-white/[0.06] p-5">
          <div className="pr-5">
            <p className="text-[12px] text-zinc-500">Datos de envío cargados</p>
            <p className="mt-1 text-[38px] font-semibold leading-none tracking-tight">38</p>
            <p className="mt-2 text-[11px] text-zinc-500">+6 vs a esta altura de septiembre</p>
          </div>
          <div className="pl-5">
            <p className="text-[12px] text-zinc-500">Envíos con etiqueta</p>
            <p className="mt-1 text-[38px] font-semibold leading-none tracking-tight">31</p>
            <p className="mt-2 text-[11px] text-zinc-500">-2 vs a esta altura de septiembre</p>
          </div>
        </Panel>
      </Marca>

      <Marca n={3} forma="box">
        <div className="grid grid-cols-[1fr_1.4fr] gap-4">
          <Panel className="p-4">
            <p className="text-[13px] font-medium">Últimos 6 meses</p>
            <div className="mt-3 flex h-20 items-end gap-2">
              {barras.map((b, i) => (
                <div key={meses[i]} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className={cn('w-full rounded-md', i === 5 ? 'bg-[#e0812f]' : 'bg-white/[0.12]')}
                    style={{ height: `${(b / 38) * 64}px` }}
                  />
                  <span className="text-[10px] text-zinc-500">{meses[i]}</span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel className="p-4">
            <p className="text-[13px] font-medium">Galería</p>
            <p className="text-[11px] text-zinc-500">Los sellos del período</p>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="aspect-square rounded-xl bg-gradient-to-br from-zinc-700 to-zinc-900 ring-1 ring-white/5"
                />
              ))}
            </div>
          </Panel>
        </div>
      </Marca>
    </Stage>
  );
}

export function MockCorcho() {
  const nota = (titulo: string, color: string, giro: string, votos: number, comentarios: number, nueva?: boolean) => (
    <div className={cn('relative rounded-sm p-3.5 text-zinc-800 shadow-lg', color, giro)}>
      <Pin className="absolute -top-1.5 left-1/2 size-4 -translate-x-1/2 fill-red-600 text-red-800" />
      {nueva ? (
        <span className="absolute right-2 top-2 rounded bg-zinc-900 px-1.5 py-0.5 text-[9px] font-semibold text-white">
          Nueva
        </span>
      ) : null}
      <p className="pr-8 text-[13px] font-semibold leading-snug">{titulo}</p>
      <p className="mt-1.5 text-[11px] leading-snug text-zinc-600">Lo que propone, en dos o tres líneas…</p>
      <p className="mt-3 flex items-center gap-2.5 text-[11px] text-zinc-600">
        <span className="flex items-center gap-1">
          <ThumbsUp className="size-3" />
          {votos}
        </span>
        <ThumbsDown className="size-3" />
        <span className="flex items-center gap-1">
          <MessageCircle className="size-3" />
          {comentarios}
        </span>
      </p>
    </div>
  );
  return (
    <Stage className="justify-center gap-5 rounded-3xl bg-[#3a2a1c]">
      <div className="flex items-center justify-between">
        <p className="text-[22px] font-semibold tracking-tight text-[#f5e6d3]">Corcho</p>
        <Marca n={1}>
          <Boton icon={<Pin />} className="bg-[#f5e6d3] text-[#2a1a0e] [&_span]:text-[#2a1a0e]">
            Pinchar una idea
          </Boton>
        </Marca>
      </div>
      <div className="flex items-center gap-2 text-[12px] text-[#f5e6d3]/80">
        <span className="rounded-full bg-black/25 px-3 py-1">Todos</span>
        <span className="rounded-full px-3 py-1">Activas</span>
        <Marca n={3} className="ml-2">
          <span className="block rounded-full bg-black/25 px-3 py-1">Solo nuevas</span>
        </Marca>
      </div>
      <div className="grid grid-cols-3 gap-5 pt-2">
        <Marca n={2} forma="box" pos="tl">
          {nota('Packaging más chico', 'bg-[#fff8e7]', 'rotate-[-1.5deg]', 4, 2, true)}
        </Marca>
        {nota('Checklist antes de enviar', 'bg-[#e8f0ff]', 'rotate-[1.5deg]', 7, 3)}
        {nota('Ordenar el depósito', 'bg-[#eaf7e4]', 'rotate-[-1deg]', 2, 0)}
      </div>
    </Stage>
  );
}
