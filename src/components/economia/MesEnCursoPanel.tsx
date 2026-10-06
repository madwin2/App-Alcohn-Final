import { Fragment, useMemo, useState } from 'react';
import { diasHabilesDelMes, resumenHabiles, ventasPorDiaHabil, type VentaDiaHabil } from '@/lib/gastos/diasHabiles';
import {
  PROVEEDOR_LABEL,
  calcularMesEnCurso,
  calcularVentasNecesarias,
  publicidadDiariaReciente,
  recurrentesPendientesArs,
  type ControlGastosConfig,
  type FijosEstimados,
  type GastoProveedor,
  type GastoRegistro,
  type MesEnCursoInput,
  type ValuacionMes,
} from '@/lib/gastos/gastosAuto';
import type { GastoRecurrente } from '@/lib/supabase/services/gastosAuto.service';
import { cn } from '@/lib/utils/cn';
import {
  BarraBronce,
  BarraNeutra,
  Estado,
  Panel,
  PanelTitle,
  Segmentado,
  Stat,
  formatArs,
  formatArsCorto,
  formatPct,
  formatUsd,
} from './controlGastosUi';

/** Subconjunto de la fila mensual de Economía (mismo criterio que P&L mensual). */
export type MesEnCursoRow = {
  ventasBrutas: number;
  costosVentas: number;
  costoRegalos: number;
  costoPruebas: number;
  costosFijos: number;
  gastosExtras: number;
  publicidad: number;
  enviosManual: number;
  pedidos?: number;
};

export type VentaDia = { fecha: string; ventas: number; pedidos: number };

export type MesHistorial = {
  mes: string;
  label: string;
  ventas: number;
  publicidad: number;
  ganancia: number;
  pedidos: number;
};

type Props = {
  mes: string;
  etiquetaMes: string;
  hoy: string;
  row: MesEnCursoRow | undefined;
  /** Fijos del mes con lo que falta cargar estimado con el mes anterior (línea por línea). */
  fijos: FijosEstimados;
  etiquetaMesAnterior: string;
  /** Ventas por día calendario del mes en curso. */
  ventasPorDia: VentaDia[];
  /** Últimos meses cerrados (mismo criterio que P&L mensual). */
  historial: MesHistorial[];
  valuacion: ValuacionMes | undefined;
  registros: GastoRegistro[];
  recurrentes: GastoRecurrente[];
  feriados: string[];
  config: ControlGastosConfig | null;
  blueHoy: number | null;
  loading: boolean;
};

type Vista = 'fin' | 'hoy';

/** Escala de la barra principal: el objetivo queda a 2/3 del ancho. */
const ESCALA_RENTABILIDAD = 1.5;

function mesAnteriorDe(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

const fechaCorta = (f: string) =>
  new Date(`${f}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' }).replace('.', '');

/**
 * Responde, en orden: ¿llegamos al objetivo? ¿vendemos lo suficiente? ¿cuánta publicidad puedo
 * pagar y en qué se fue? ¿de dónde sale la ganancia? ¿cómo venimos contra los meses anteriores?
 *
 * Dos relojes: las ventas se miden por **día hábil** (lun–vie sin feriados; lo que entra un día no
 * hábil cuenta el hábil siguiente) y la publicidad por **día corrido** (las campañas no paran).
 */
export function MesEnCursoPanel({
  etiquetaMes,
  mes,
  hoy,
  row,
  fijos,
  etiquetaMesAnterior,
  ventasPorDia,
  historial,
  valuacion,
  registros,
  recurrentes,
  feriados,
  config,
  blueHoy,
  loading,
}: Props) {
  const [vista, setVista] = useState<Vista>('fin');
  const objetivo = config?.objetivoRentabilidad ?? 0.25;
  const variablesHoy = (row?.costosVentas ?? 0) + (row?.costoRegalos ?? 0) + (row?.costoPruebas ?? 0);
  const otrosHoy = (row?.gastosExtras ?? 0) + (row?.enviosManual ?? 0);
  const publicidadHoy = row?.publicidad ?? 0;
  const ventasHoy = row?.ventasBrutas ?? 0;

  // ---- Días hábiles y ventas por día hábil ----
  const habilesMes = useMemo(() => diasHabilesDelMes(mes, new Set(feriados)), [mes, feriados]);
  const habiles = useMemo(() => resumenHabiles(habilesMes, hoy), [habilesMes, hoy]);
  const serieHabil = useMemo(() => ventasPorDiaHabil(ventasPorDia, habilesMes), [ventasPorDia, habilesMes]);
  const ventasDiasCompletos = serieHabil.filter((d) => d.fecha < hoy).reduce((s, d) => s + d.ventas, 0);

  const diaria = useMemo(() => {
    if (!config || !registros.some((r) => r.categoria === 'publicidad')) return null;
    return publicidadDiariaReciente(registros, hoy, blueHoy, config);
  }, [registros, hoy, blueHoy, config]);

  // Gasto de ayer (para ver rápido un cambio de presupuesto) y publicidad del mes anterior como referencia.
  const ayer = useMemo(() => {
    if (!config || !registros.some((r) => r.categoria === 'publicidad')) return null;
    return publicidadDiariaReciente(registros, hoy, blueHoy, config, 1);
  }, [registros, hoy, blueHoy, config]);
  const mesAnterior = historial.length ? historial[historial.length - 1] : null;
  const publicidadReferencia = mesAnterior && mesAnterior.mes === mesAnteriorDe(mes) ? mesAnterior.publicidad : null;

  const recurrentesPendientes = useMemo(
    () => (config ? recurrentesPendientesArs(recurrentes, mes, hoy, blueHoy, config) : 0),
    [recurrentes, mes, hoy, blueHoy, config],
  );

  const entrada = useMemo<MesEnCursoInput>(
    () => ({
      mes,
      hoy,
      ventas: ventasHoy,
      ventasDiasCompletos,
      habiles,
      costosVariables: variablesHoy,
      fijos: fijos.total,
      publicidad: publicidadHoy,
      otros: otrosHoy,
      otrosPendientes: recurrentesPendientes,
      publicidadDiaria: diaria,
      publicidadReferenciaMes: publicidadReferencia,
      objetivo,
    }),
    [mes, hoy, ventasHoy, ventasDiasCompletos, habiles, variablesHoy, fijos.total, publicidadHoy, otrosHoy, recurrentesPendientes, diaria, publicidadReferencia, objetivo],
  );
  const r = useMemo(() => calcularMesEnCurso(entrada), [entrada]);
  const nec = useMemo(() => calcularVentasNecesarias(entrada, r), [entrada, r]);
  const pedidosHoy = row?.pedidos ?? ventasPorDia.reduce((s, d) => s + d.pedidos, 0);
  const ticket = pedidosHoy > 0 ? ventasHoy / pedidosHoy : 0;
  const sinVentas = ventasHoy <= 0;
  const llega = r.proyeccion.rentabilidad >= objetivo;
  const faltante = r.proyeccion.ventas * objetivo - r.proyeccion.ganancia;
  const gastoProyectado = r.proyeccion.costosVariables + r.proyeccion.publicidad + r.proyeccion.otros + fijos.total;
  const avisoPublicidad =
    r.origenPublicidad === 'referencia'
      ? `Todavía no hay publicidad de este mes: se estima con la de ${etiquetaMesAnterior} (${formatArsCorto(r.proyeccion.publicidad)}).`
      : r.origenPublicidad === 'sin_datos'
        ? 'No hay datos de publicidad: el cálculo la toma como $0 y la ganancia real va a ser menor.'
        : r.origenPublicidad === 'lineal'
          ? 'La publicidad se proyecta con lo cargado a mano; con Meta y Google conectados se usa el ritmo real.'
          : null;

  // ---- Publicidad ----
  // USD con IVA + recargos: traduce el presupuesto diario a lo que se configura en Meta/Google.
  const pesosPorUsd = config && blueHoy ? blueHoy * (1 + config.ivaPct + config.otrosImpuestosUsdPct) : 0;
  const enUsd = (ars: number) => (pesosPorUsd > 0 ? ars / pesosPorUsd : null);
  const montoDia = (ars: number) => {
    const usd = enUsd(ars);
    return usd != null ? formatUsd(Math.round(usd)) : formatArsCorto(ars);
  };
  const sinMargen = r.publicidadRestante <= 0;
  const excedido = !sinMargen && diaria != null && diaria > r.publicidadPorDia;

  const plataformas = useMemo(() => {
    const m = new Map<GastoProveedor, number>();
    for (const c of valuacion?.conceptos ?? []) {
      if (c.categoria !== 'publicidad') continue;
      m.set(c.proveedor, (m.get(c.proveedor) ?? 0) + c.ars);
    }
    const manual = Math.max(0, publicidadHoy - (valuacion?.porCategoria.publicidad ?? 0));
    const filas = [...m.entries()].sort((a, b) => b[1] - a[1]).map(([prov, ars]) => ({ label: PROVEEDOR_LABEL[prov], ars }));
    if (manual > 0.5) filas.push({ label: 'Cargada a mano', ars: manual });
    return filas;
  }, [valuacion, publicidadHoy]);
  const totalPub = plataformas.reduce((s, p) => s + p.ars, 0);

  // ---- Desglose ----
  const desglose = useMemo(() => {
    const fin = vista === 'fin';
    const ventas = fin ? r.proyeccion.ventas : r.aHoy.ventas;
    const filas = [
      { label: 'Fabricación, regalos y pruebas', monto: fin ? r.proyeccion.costosVariables : variablesHoy },
      { label: 'Publicidad', monto: fin ? r.proyeccion.publicidad : publicidadHoy, destacar: true },
      { label: 'Sueldos y fijos', monto: fin ? fijos.total : r.aHoy.fijosProrrateados },
      { label: 'Otros gastos', monto: fin ? r.proyeccion.otros : otrosHoy },
    ];
    return { ventas, filas, ganancia: fin ? r.proyeccion.ganancia : r.aHoy.ganancia, fin };
  }, [vista, r, variablesHoy, publicidadHoy, fijos.total, otrosHoy]);

  // ---- Notas (supuestos que conviene ver) ----
  const notas: string[] = [];
  if (fijos.faltan.length)
    notas.push(
      `Todavía no están cargados en Gastos: ${fijos.faltan.join(', ')}. Se estiman con ${etiquetaMesAnterior} (${formatArsCorto(fijos.estimado)}).`,
    );
  if (r.origenPublicidad === 'lineal' && avisoPublicidad) notas.push(avisoPublicidad);
  if (recurrentesPendientes > 0) notas.push(`Incluye ${formatArsCorto(recurrentesPendientes)} de recurrentes que se cobran más adelante este mes.`);
  if (valuacion && valuacion.usdBase > 0 && valuacion.estado !== 'pagado')
    notas.push(`Los dólares sin pagar se valúan al blue de hoy (${formatArs(valuacion.cotizacionEfectiva)}).`);

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-12">
        {/* ---------- 1. ¿Llegamos al objetivo? ---------- */}
        <Panel className="flex flex-col xl:col-span-7">
          <p className="text-[13px] text-muted-foreground">
            {etiquetaMes} · día hábil {Math.min(habiles.total, habiles.completos + (habiles.hoyEsHabil ? 1 : 0))} de {habiles.total}
          </p>

          {sinVentas ? (
            <p className="mt-6 text-2xl font-semibold tracking-tight">Todavía no hay ventas este mes.</p>
          ) : (
            <>
              <p className="mt-5 text-[15px] text-muted-foreground">Al ritmo actual, el mes cierra con</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className={cn('text-6xl font-semibold tabular-nums tracking-tight', r.proyeccion.ganancia < 0 && 'text-red-400')}>
                  {formatArsCorto(r.proyeccion.ganancia)}
                </span>
                <span className="text-xl font-medium tabular-nums text-muted-foreground">
                  {formatPct(r.proyeccion.rentabilidad)} de ganancia
                </span>
              </div>

              <div className="mt-8">
                <BarraBronce valor={r.proyeccion.rentabilidad / (objetivo * ESCALA_RENTABILIDAD)} marca={1 / ESCALA_RENTABILIDAD} />
                <div className="relative mt-2 h-4 text-xs text-muted-foreground">
                  <span className="absolute left-0">0 %</span>
                  <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(1 / ESCALA_RENTABILIDAD) * 100}%` }}>
                    objetivo {formatPct(objetivo)}
                  </span>
                </div>
              </div>

              <div className="mt-5">
                {r.origenPublicidad === 'sin_datos' ? (
                  <Estado tono="aviso">{avisoPublicidad}</Estado>
                ) : llega ? (
                  <Estado tono="ok">Por encima del objetivo.</Estado>
                ) : (
                  <Estado tono="mal">
                    Faltan {formatArsCorto(faltante)} de ganancia para llegar al {formatPct(objetivo)}.
                  </Estado>
                )}
              </div>

              <div className="mt-auto grid grid-cols-2 gap-4 border-t border-white/[0.06] pt-5 sm:grid-cols-4">
                <Stat label="Vendido a hoy" value={formatArsCorto(r.aHoy.ventas)} hint={`${pedidosHoy} pedidos`} />
                <Stat
                  label="Gasto proyectado del mes"
                  value={formatArsCorto(gastoProyectado)}
                  hint={r.proyeccion.ventas > 0 ? `${formatPct(gastoProyectado / r.proyeccion.ventas)} de las ventas` : undefined}
                />
                <Stat
                  label="Ganancia a hoy"
                  value={formatArsCorto(r.aHoy.ganancia)}
                  hint={r.aHoy.ventas > 0 ? `${formatPct(r.aHoy.rentabilidad)} · fijos proporcionales` : undefined}
                />
                <Stat
                  label="Quedan"
                  value={`${habiles.restantes} días hábiles`}
                  hint={`${r.diasCorridosRestantes} días corridos de publicidad`}
                />
              </div>
            </>
          )}
        </Panel>

        {/* ---------- 2. ¿Vendemos lo suficiente? ---------- */}
        <VentasPanel
          className="xl:col-span-5"
          serie={serieHabil}
          hoy={hoy}
          ritmo={nec.ritmoActual}
          necesario={nec.porDia}
          ventasMes={nec.ventasMes}
          faltan={nec.faltan}
          ticket={ticket}
          objetivo={objetivo}
          sinVentas={sinVentas}
          restantes={habiles.restantes}
          aviso={avisoPublicidad && r.origenPublicidad !== 'lineal' ? avisoPublicidad : null}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        {/* ---------- 3. Publicidad ---------- */}
        <Panel className="xl:col-span-7">
          <PanelTitle title="Publicidad" sub="Las campañas corren todos los días, por eso se mide por día corrido" />
          <div className="grid gap-8 md:grid-cols-2 md:gap-0 md:divide-x md:divide-white/[0.06]">
            {/* Presupuesto */}
            <div className="flex flex-col md:pr-8">
              {sinVentas ? (
                <p className="text-sm text-muted-foreground">El presupuesto se calcula cuando haya ventas en el mes.</p>
              ) : sinMargen ? (
                <>
                  <p className="text-[13px] text-muted-foreground">Para el {formatPct(objetivo)}</p>
                  <p className="mt-1 text-3xl font-semibold tracking-tight text-red-400">Sin margen</p>
                  <p className="mt-2 text-sm text-muted-foreground">Aunque no se gaste más, este mes no llega al objetivo.</p>
                </>
              ) : (
                <>
                  <p className="text-[13px] text-muted-foreground">Para cerrar en {formatPct(objetivo)} podés gastar hasta</p>
                  <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">
                    {montoDia(r.publicidadPorDia)}
                    <span className="ml-1.5 text-lg font-medium text-muted-foreground">por día</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sumando todas las plataformas{enUsd(1) != null ? ` · ${formatArs(r.publicidadPorDia)} con IVA` : ''}
                  </p>
                </>
              )}

              {!sinVentas && diaria != null ? (
                <div className="mt-6 space-y-3">
                  <ComparaDia
                    label="Gasto actual (prom. 7 días)"
                    valor={montoDia(diaria)}
                    proporcion={sinMargen ? 1 : diaria / Math.max(diaria, r.publicidadPorDia)}
                    tono={excedido || sinMargen ? 'mal' : 'fuerte'}
                  />
                  {!sinMargen ? (
                    <ComparaDia
                      label="Máximo para el objetivo"
                      valor={montoDia(r.publicidadPorDia)}
                      proporcion={r.publicidadPorDia / Math.max(diaria, r.publicidadPorDia)}
                      tono="neutro"
                    />
                  ) : null}
                  {ayer != null ? (
                    <p className="text-xs text-muted-foreground">
                      Ayer se gastaron <span className="text-foreground">{montoDia(ayer)}</span>
                      {diaria > 0 && Math.abs(ayer / diaria - 1) >= 0.2
                        ? ` (${ayer > diaria ? 'más' : 'menos'} que el promedio: ¿cambió algún presupuesto?)`
                        : '.'}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-auto pt-6">
                {sinVentas ? null : diaria == null ? (
                  <Estado tono="neutro">Conectá Meta y Google para comparar con el gasto real.</Estado>
                ) : sinMargen ? (
                  <Estado tono="mal">Conviene pausar o bajar campañas.</Estado>
                ) : excedido ? (
                  <Estado tono="mal">Bajá unos {montoDia(diaria - r.publicidadPorDia)} por día.</Estado>
                ) : (
                  <Estado tono="ok">El gasto actual entra en el presupuesto.</Estado>
                )}
              </div>
            </div>

            {/* En qué se fue */}
            <div className="flex flex-col md:pl-8">
              <p className="text-[13px] text-muted-foreground">Gastado en el mes, con IVA</p>
              {plataformas.length ? (
                <>
                  <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">
                    {formatArsCorto(totalPub)}
                    {ventasHoy > 0 ? (
                      <span className="ml-2 text-lg font-medium text-muted-foreground">{formatPct(totalPub / ventasHoy)} de lo vendido</span>
                    ) : null}
                  </p>
                  <div className="mt-4 rounded-2xl bg-white/[0.03] px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">Al ritmo actual, el mes cierra en</span>
                      <span className={cn('tabular-nums font-medium', r.proyeccion.publicidad > Math.max(0, r.topePublicidad) && 'text-red-300')}>
                        {formatArsCorto(r.proyeccion.publicidad)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                      <span>Máximo para el {formatPct(objetivo)}</span>
                      <span className="tabular-nums">{r.topePublicidad > 0 ? formatArsCorto(r.topePublicidad) : 'sin margen'}</span>
                    </div>
                  </div>
                  <ul className="mt-5 space-y-3">
                    {plataformas.map((p) => (
                      <li key={p.label}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="text-muted-foreground">{p.label}</span>
                          <span className="tabular-nums">{formatArsCorto(p.ars)}</span>
                        </div>
                        <BarraNeutra className="mt-1.5" valor={totalPub > 0 ? p.ars / totalPub : 0} />
                      </li>
                    ))}
                  </ul>
                  {pedidosHoy > 0 ? (
                    <p className="mt-auto pt-6 text-sm text-muted-foreground">
                      Cada pedido costó <span className="text-foreground">{formatArsCorto(totalPub / pedidosHoy)}</span> de publicidad
                      {ticket > 0 ? (
                        <>
                          {' '}sobre un ticket de <span className="text-foreground">{formatArsCorto(ticket)}</span> ({formatPct(totalPub / pedidosHoy / ticket)})
                        </>
                      ) : null}
                      .
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  <p className="mt-2 text-sm text-muted-foreground">{loading ? 'Cargando…' : 'Todavía no hay publicidad registrada este mes.'}</p>
                  {r.origenPublicidad === 'referencia' ? (
                    <p className="mt-4 text-sm text-muted-foreground">
                      Para los cálculos se estima con la de {etiquetaMesAnterior}:{' '}
                      <span className="text-foreground">{formatArsCorto(r.proyeccion.publicidad)}</span>.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </Panel>

        {/* ---------- 4. De dónde sale la ganancia ---------- */}
        <Panel className="xl:col-span-5">
          <PanelTitle
            title="De dónde sale la ganancia"
            sub={
              vista === 'fin'
                ? 'Estimación del mes completo: ventas y gastos al ritmo de hoy'
                : 'Lo real hasta hoy: lo vendido y lo gastado (los fijos, en proporción a los días hábiles)'
            }
            right={
              <Segmentado<Vista>
                valor={vista}
                onChange={setVista}
                opciones={[
                  { valor: 'fin', label: 'Estimado a fin de mes' },
                  { valor: 'hoy', label: 'Real a hoy' },
                ]}
              />
            }
          />
          <FilaDesglose label={desglose.fin ? 'Ventas estimadas' : 'Vendido'} monto={desglose.ventas} proporcion={desglose.ventas > 0 ? 1 : 0} pct={desglose.ventas > 0 ? 1 : null} fuerte />
          {desglose.filas.map((f) => (
            <FilaDesglose
              key={f.label}
              label={f.label}
              monto={-f.monto}
              proporcion={desglose.ventas > 0 ? f.monto / desglose.ventas : 0}
              pct={desglose.ventas > 0 ? f.monto / desglose.ventas : null}
              destacar={f.destacar}
            />
          ))}
          <div className="mt-2 border-t border-white/[0.08] pt-2">
            <FilaDesglose
              label={desglose.fin ? 'Ganancia estimada' : 'Ganancia a hoy'}
              monto={desglose.ganancia}
              proporcion={desglose.ventas > 0 ? Math.max(0, desglose.ganancia) / desglose.ventas : 0}
              pct={desglose.ventas > 0 ? desglose.ganancia / desglose.ventas : null}
              total
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {vista === 'fin'
              ? `Ventas y fabricación al ritmo por día hábil; publicidad al ritmo de los últimos 7 días; fijos completos${fijos.faltan.length ? ' (lo que falta cargar, con el mes anterior)' : ''}.`
              : 'Cambiá a «Estimado a fin de mes» para ver cómo cerraría el mes.'}
          </p>
        </Panel>
      </div>

      {/* ---------- 5. Últimos meses ---------- */}
      <HistorialPanel
        historial={historial}
        actual={
          sinVentas
            ? null
            : { mes, label: 'Este mes', ventas: r.proyeccion.ventas, publicidad: r.proyeccion.publicidad, ganancia: r.proyeccion.ganancia, pedidos: pedidosHoy }
        }
        objetivo={objetivo}
      />

      {notas.length ? (
        <ul className="space-y-1 px-1 text-xs text-muted-foreground">
          {notas.map((n) => (
            <li key={n}>· {n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ComparaDia({ label, valor, proporcion, tono }: { label: string; valor: string; proporcion: number; tono: 'neutro' | 'fuerte' | 'mal' }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{valor}</span>
      </div>
      <BarraNeutra className="mt-1.5" valor={proporcion} tono={tono} />
    </div>
  );
}

function FilaDesglose({
  label,
  monto,
  proporcion,
  pct,
  fuerte,
  destacar,
  total,
}: {
  label: string;
  monto: number;
  proporcion: number;
  pct: number | null;
  fuerte?: boolean;
  destacar?: boolean;
  total?: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,12rem)_1fr_5.5rem_3rem] items-center gap-3 py-2 text-sm">
      <span className={cn('truncate', total ? 'font-medium' : 'text-foreground/85')}>{label}</span>
      <BarraNeutra valor={proporcion} tono={fuerte || total ? 'fuerte' : 'neutro'} className={cn(destacar && '[&>div]:bg-[#e0812f]/80')} />
      <span className={cn('text-right tabular-nums', total && 'font-semibold', total && monto < 0 && 'text-red-400')}>{formatArsCorto(monto)}</span>
      <span className="text-right text-xs tabular-nums text-muted-foreground">{pct != null ? formatPct(pct) : '—'}</span>
    </div>
  );
}

/**
 * Ritmo de ventas por día hábil contra lo necesario, con una barra por día hábil del mes.
 * Lo que entró en fin de semana o feriado está sumado al hábil siguiente (se aclara en el tooltip).
 */
function VentasPanel({
  className,
  serie,
  hoy,
  ritmo,
  necesario,
  ventasMes,
  faltan,
  ticket,
  objetivo,
  sinVentas,
  restantes,
  aviso,
}: {
  className?: string;
  restantes: number;
  /** Supuesto de publicidad que afecta a «Necesario». */
  aviso: string | null;
  serie: VentaDiaHabil[];
  hoy: string;
  ritmo: number;
  necesario: number | null;
  ventasMes: number | null;
  faltan: number | null;
  ticket: number;
  objetivo: number;
  sinVentas: boolean;
}) {
  const max = Math.max(1, necesario ?? 0, ...serie.map((d) => d.ventas));
  const lineaPct = necesario != null ? Math.min(1, necesario / max) : null;
  const alcanza = necesario != null && ritmo >= necesario;
  const etiquetas = serie.length ? [serie[0], serie[Math.floor((serie.length - 1) / 2)], serie[serie.length - 1]] : [];

  return (
    <Panel className={cn('flex flex-col', className)}>
      <PanelTitle title="Ventas" sub="Por día hábil · lo de fines de semana y feriados suma al día hábil siguiente" />

      {sinVentas ? (
        <p className="text-sm text-muted-foreground">Todavía no hay ventas este mes.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Ritmo actual" value={formatArsCorto(ritmo)} hint="por día hábil" />
          <Stat
            label={`Necesario para ${formatPct(objetivo)}`}
            value={necesario != null ? formatArsCorto(necesario) : '—'}
            hint={ventasMes != null ? `para cerrar en ${formatArsCorto(ventasMes)}` : 'no alcanzable con este costo'}
          />
        </div>
      )}

      <div className="mt-7">
        <div className="relative flex h-36 items-end gap-1">
          {serie.map((d) => {
            const futuro = d.fecha > hoy;
            const esHoy = d.fecha === hoy;
            const tip = futuro
              ? fechaCorta(d.fecha)
              : `${fechaCorta(d.fecha)}: ${formatArs(d.ventas)} · ${d.pedidos} pedidos${
                  d.trasladadasDe.length ? ` (incluye ${d.trasladadasDe.map(fechaCorta).join(', ')})` : ''
                }${d.fecha === hoy ? ' · hoy, parcial' : ''}`;
            return (
              <div key={d.fecha} title={tip} className="group flex h-full flex-1 flex-col items-center justify-end">
                <div
                  className={cn(
                    'w-full rounded-t-[4px] transition-colors',
                    futuro
                      ? 'h-1 rounded-[2px] bg-white/[0.06]'
                      : esHoy
                        ? 'bg-white/35'
                        : alcanza || necesario == null || d.ventas >= necesario
                          ? 'bg-white/75 group-hover:bg-white'
                          : 'bg-white/45 group-hover:bg-white/70',
                  )}
                  style={futuro ? undefined : { height: `${Math.max(2, (d.ventas / max) * 100)}%` }}
                />
              </div>
            );
          })}
          {lineaPct != null && !sinVentas ? (
            <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[#e0812f]/80" style={{ bottom: `${lineaPct * 100}%` }}>
              <span className="absolute -top-5 right-0 rounded bg-[#0b0b0b]/80 px-1 text-[11px] text-[#f0a35a]">necesario</span>
            </div>
          ) : null}
        </div>
        <div className="mt-2 flex justify-between text-[11px] capitalize text-muted-foreground">
          {etiquetas.map((d, i) => (
            <span key={`${d.fecha}-${i}`}>{fechaCorta(d.fecha)}</span>
          ))}
        </div>
      </div>

      {!sinVentas && necesario != null ? (
        <div className="mt-auto space-y-2 pt-6">
          {aviso ? <Estado tono="aviso">{aviso}</Estado> : null}
          {alcanza ? (
            <Estado tono="ok">El ritmo de ventas alcanza para el objetivo.</Estado>
          ) : (
            <Estado tono="mal">
              {faltan != null && faltan > 0 ? `Hay que vender ${formatArsCorto(faltan)} en ${restantes} días hábiles: ` : ''}
              {ticket > 0
                ? `unos ${Math.ceil((necesario - ritmo) / ticket)} pedidos más por día que ahora.`
                : `${formatPct(necesario / Math.max(1, ritmo) - 1)} más por día que ahora.`}
            </Estado>
          )}
        </div>
      ) : null}
    </Panel>
  );
}

/**
 * Ganancia de los últimos meses contra el objetivo, más el mes en curso proyectado.
 * Gráfico y tabla comparten la misma grilla: etiquetas una sola vez a la izquierda, un mes por columna.
 */
function HistorialPanel({ historial, actual, objetivo }: { historial: MesHistorial[]; actual: MesHistorial | null; objetivo: number }) {
  const meses = actual ? [...historial, actual] : historial;
  if (!meses.length) return null;
  const rent = (m: MesHistorial) => (m.ventas > 0 ? m.ganancia / m.ventas : 0);
  const escala = Math.max(objetivo * 1.4, ...meses.map((m) => rent(m))) * 1.12; // aire arriba para el número
  const ALTO = 200; // px del área de barras
  const yObjetivo = (objetivo / escala) * ALTO;

  const cerrados = historial.filter((m) => m.ventas > 0);
  const promedio = cerrados.length ? cerrados.reduce((s, m) => s + rent(m), 0) / cerrados.length : null;
  const mejor = cerrados.reduce<MesHistorial | null>((a, m) => (!a || rent(m) > rent(a) ? m : a), null);
  const alcanzaron = cerrados.filter((m) => rent(m) >= objetivo).length;

  const columnas = { gridTemplateColumns: `8.5rem repeat(${meses.length}, minmax(0, 1fr))` };
  const esActual = (m: MesHistorial) => actual?.mes === m.mes;

  return (
    <Panel>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        <div>
          <h3 className="text-[15px] font-medium">Últimos meses</h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Ganancia sobre ventas, con el mismo cálculo. Hasta septiembre la publicidad es la de la tarjeta; desde octubre, la automática.
          </p>
        </div>
        {promedio != null ? (
          <div className="flex gap-8">
            <Stat label={`Promedio ${cerrados.length} meses`} value={formatPct(promedio)} />
            {mejor ? <Stat label="Mejor mes" value={formatPct(rent(mejor))} hint={mejor.label} /> : null}
            <Stat label={`Llegaron al ${formatPct(objetivo)}`} value={`${alcanzaron} de ${cerrados.length}`} />
          </div>
        ) : null}
      </div>

      {/* Gráfico */}
      <div className="grid" style={columnas}>
        <div className="relative" style={{ height: ALTO }}>
          <span className="absolute right-4 translate-y-1/2 text-xs text-muted-foreground" style={{ bottom: yObjetivo }}>
            objetivo {formatPct(objetivo)}
          </span>
        </div>
        <div className="relative border-b border-white/15" style={{ height: ALTO, gridColumn: `span ${meses.length}` }}>
          <div className="absolute inset-x-0 border-t border-dashed border-white/30" style={{ bottom: yObjetivo }} />
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${meses.length}, minmax(0, 1fr))` }}>
            {meses.map((m) => {
              const rr = rent(m);
              const alto = Math.max(3, (Math.max(0, rr) / escala) * ALTO);
              const proy = esActual(m);
              return (
                <div key={m.mes} className="flex flex-col items-center justify-end">
                  <span className={cn('mb-2 text-sm font-semibold tabular-nums', rr < 0 && 'text-red-400', proy && 'text-muted-foreground')}>
                    {formatPct(rr)}
                  </span>
                  <div
                    className={cn(
                      'w-1/2 max-w-[4.5rem] rounded-t-md',
                      proy
                        ? rr >= objetivo
                          ? 'border border-b-0 border-dashed border-[#e0812f] bg-[#e0812f]/15'
                          : 'border border-b-0 border-dashed border-white/50 bg-white/[0.06]'
                        : rr < 0
                          ? 'bg-red-400/70'
                          : rr >= objetivo
                            ? 'bg-gradient-to-t from-[#8a4a1c] via-[#e0812f] to-[#f6c46b]'
                            : 'bg-white/55',
                    )}
                    style={{ height: alto }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mes + tabla, misma grilla */}
      <div className="grid text-sm" style={columnas}>
        <div />
        {meses.map((m) => (
          <div key={m.mes} className="pb-3 pt-3 text-center">
            <p className={cn(esActual(m) ? 'text-foreground' : 'capitalize text-muted-foreground')}>{esActual(m) ? 'Este mes' : m.label}</p>
            {esActual(m) ? <p className="text-[11px] text-muted-foreground">proyección</p> : null}
          </div>
        ))}
        {[
          { label: 'Ventas', valor: (m: MesHistorial) => formatArsCorto(m.ventas) },
          { label: 'Publicidad / ventas', valor: (m: MesHistorial) => (m.ventas > 0 ? formatPct(m.publicidad / m.ventas) : '—') },
          { label: 'Ganancia', valor: (m: MesHistorial) => formatArsCorto(m.ganancia), fuerte: true },
        ].map((fila) => (
          <Fragment key={fila.label}>
            <div className="border-t border-white/[0.06] py-2.5 text-muted-foreground">{fila.label}</div>
            {meses.map((m) => (
              <div
                key={m.mes}
                className={cn(
                  'border-t border-white/[0.06] py-2.5 text-center tabular-nums',
                  fila.fuerte && 'font-medium',
                  fila.fuerte && m.ganancia < 0 && 'text-red-400',
                  esActual(m) && 'text-muted-foreground',
                )}
              >
                {fila.valor(m)}
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </Panel>
  );
}
