import { useMemo, useState } from 'react';
import {
  PROVEEDOR_LABEL,
  calcularMesEnCurso,
  calcularVentasNecesarias,
  diasDelMes,
  publicidadDiariaReciente,
  type MesEnCursoInput,
  type ControlGastosConfig,
  type GastoProveedor,
  type GastoRegistro,
  type ValuacionMes,
} from '@/lib/gastos/gastosAuto';
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
  /** Fijos del mes anterior, para estimar si el mes en curso todavía no tiene fijos cargados. */
  fijosMesAnterior: number;
  fijosCargados: boolean;
  /** Ventas por día del mes en curso. */
  ventasPorDia: VentaDia[];
  /** Últimos meses cerrados (mismo criterio que P&L mensual). */
  historial: MesHistorial[];
  valuacion: ValuacionMes | undefined;
  registros: GastoRegistro[];
  config: ControlGastosConfig | null;
  blueHoy: number | null;
  loading: boolean;
};

type Vista = 'fin' | 'hoy';

/** Escala de la barra principal: el objetivo queda a 2/3 del ancho. */
const ESCALA_RENTABILIDAD = 1.5;

/**
 * Responde, en este orden: ¿llegamos al objetivo este mes? ¿cuánto puedo gastar en publicidad
 * por día? ¿de qué se compone la ganancia? ¿cuánto va a cada plataforma?
 */
export function MesEnCursoPanel({
  etiquetaMes,
  mes,
  hoy,
  row,
  fijosMesAnterior,
  fijosCargados,
  ventasPorDia,
  historial,
  valuacion,
  registros,
  config,
  blueHoy,
  loading,
}: Props) {
  const [vista, setVista] = useState<Vista>('fin');
  const objetivo = config?.objetivoRentabilidad ?? 0.25;
  const fijos = fijosCargados ? row?.costosFijos ?? 0 : fijosMesAnterior;
  const variablesHoy = (row?.costosVentas ?? 0) + (row?.costoRegalos ?? 0) + (row?.costoPruebas ?? 0);
  const otrosHoy = (row?.gastosExtras ?? 0) + (row?.enviosManual ?? 0);
  const publicidadHoy = row?.publicidad ?? 0;

  const diaria = useMemo(() => {
    if (!config || !registros.some((r) => r.categoria === 'publicidad')) return null;
    return publicidadDiariaReciente(registros, hoy, blueHoy, config);
  }, [registros, hoy, blueHoy, config]);

  const entrada = useMemo<MesEnCursoInput>(
    () => ({
      mes,
      hoy,
      ventas: row?.ventasBrutas ?? 0,
      costosVariables: variablesHoy,
      fijos,
      fijosEstimados: !fijosCargados,
      publicidad: publicidadHoy,
      otros: otrosHoy,
      publicidadDiaria: diaria,
      objetivo,
    }),
    [mes, hoy, row, variablesHoy, fijos, fijosCargados, publicidadHoy, otrosHoy, diaria, objetivo],
  );
  const r = useMemo(() => calcularMesEnCurso(entrada), [entrada]);
  const necesarias = useMemo(() => calcularVentasNecesarias(entrada, r), [entrada, r]);
  const pedidosHoy = row?.pedidos ?? ventasPorDia.reduce((s, d) => s + d.pedidos, 0);
  const ticket = pedidosHoy > 0 ? (row?.ventasBrutas ?? 0) / pedidosHoy : 0;

  // USD con IVA + recargos, para traducir el presupuesto diario a lo que se configura en Meta/Google.
  const pesosPorUsd = config && blueHoy ? blueHoy * (1 + config.ivaPct + config.otrosImpuestosUsdPct) : 0;
  const enUsd = (ars: number) => (pesosPorUsd > 0 ? ars / pesosPorUsd : null);

  const llega = r.proyeccion.rentabilidad >= objetivo;
  const faltante = r.proyeccion.ventas * objetivo - r.proyeccion.ganancia;
  const sinVentas = (row?.ventasBrutas ?? 0) <= 0;

  // ---- Desglose de la ganancia ----
  const desglose = useMemo(() => {
    const finDeMes = vista === 'fin';
    const ventas = finDeMes ? r.proyeccion.ventas : r.aHoy.ventas;
    const filas = [
      { label: 'Fabricación, regalos y pruebas', monto: finDeMes ? r.proyeccion.costosVariables : variablesHoy },
      { label: 'Publicidad (con IVA)', monto: finDeMes ? r.proyeccion.publicidad : publicidadHoy, destacar: true },
      {
        label: fijosCargados ? 'Sueldos y fijos' : 'Sueldos y fijos (estimados)',
        monto: finDeMes ? fijos : r.aHoy.fijosProrrateados,
      },
      { label: 'Otros gastos', monto: otrosHoy },
    ];
    const ganancia = finDeMes ? r.proyeccion.ganancia : r.aHoy.ganancia;
    return { ventas, filas, ganancia };
  }, [vista, r, variablesHoy, publicidadHoy, fijos, fijosCargados, otrosHoy]);

  // ---- Publicidad por plataforma ----
  const plataformas = useMemo(() => {
    const m = new Map<GastoProveedor, number>();
    for (const c of valuacion?.conceptos ?? []) {
      if (c.categoria !== 'publicidad') continue;
      m.set(c.proveedor, (m.get(c.proveedor) ?? 0) + c.ars);
    }
    const auto = valuacion?.porCategoria.publicidad ?? 0;
    const manual = Math.max(0, publicidadHoy - auto);
    const filas: Array<{ label: string; ars: number }> = [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([prov, ars]) => ({ label: PROVEEDOR_LABEL[prov], ars }));
    if (manual > 0.5) filas.push({ label: 'Cargada a mano', ars: manual });
    return filas;
  }, [valuacion, publicidadHoy]);
  const totalPlataformas = plataformas.reduce((s, p) => s + p.ars, 0);
  const usdPublicidad = (valuacion?.conceptos ?? [])
    .filter((c) => c.categoria === 'publicidad' && c.moneda === 'USD')
    .reduce((s, c) => s + c.montoOriginal, 0);

  // ---- Veredicto de publicidad ----
  const porDiaUsd = enUsd(r.publicidadPorDia);
  const diariaUsd = diaria != null ? enUsd(diaria) : null;
  const montoDia = (ars: number, usd: number | null) => (usd != null ? formatUsd(Math.round(usd)) : formatArsCorto(ars));
  const sinMargen = r.publicidadRestante <= 0;
  const excedido = !sinMargen && diaria != null && diaria > r.publicidadPorDia;

  const notas: string[] = [];
  if (r.pocosDatos) notas.push('Van pocos días del mes: la proyección todavía se mueve mucho.');
  if (!fijosCargados) notas.push(`Los fijos de este mes todavía no están cargados en Gastos; se usan los del mes anterior (${formatArsCorto(fijosMesAnterior)}).`);
  if (valuacion && valuacion.usdBase > 0 && valuacion.estado !== 'pagado')
    notas.push(`Los dólares sin pagar se valúan al blue de hoy (${formatArs(valuacion.cotizacionEfectiva)}).`);

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-12">
        {/* ---------- Héroe: ¿llegamos al objetivo? ---------- */}
        <Panel className="lg:col-span-2 xl:col-span-5">
          <p className="text-[13px] text-muted-foreground">
            {etiquetaMes} · día {r.diasTranscurridos} de {r.diasMes}
          </p>

          {sinVentas ? (
            <p className="mt-6 text-2xl font-semibold tracking-tight">Todavía no hay ventas este mes.</p>
          ) : (
            <>
              <p className="mt-4 text-[15px] text-muted-foreground">Al ritmo actual, el mes cierra con</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span
                  className={cn(
                    'text-5xl font-semibold tabular-nums tracking-tight sm:text-6xl',
                    r.proyeccion.ganancia < 0 && 'text-red-400',
                  )}
                >
                  {formatArsCorto(r.proyeccion.ganancia)}
                </span>
                <span className="text-xl font-medium tabular-nums text-muted-foreground">
                  {formatPct(r.proyeccion.rentabilidad)} de ganancia
                </span>
              </div>

              <div className="mt-7">
                <BarraBronce
                  valor={r.proyeccion.rentabilidad / (objetivo * ESCALA_RENTABILIDAD)}
                  marca={1 / ESCALA_RENTABILIDAD}
                />
                <div className="relative mt-2 h-4 text-xs text-muted-foreground">
                  <span className="absolute left-0">0 %</span>
                  <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(1 / ESCALA_RENTABILIDAD) * 100}%` }}>
                    objetivo {formatPct(objetivo)}
                  </span>
                </div>
              </div>

              <div className="mt-5">
                {publicidadHoy <= 0 ? (
                  <Estado tono="aviso">
                    Todavía no hay publicidad registrada este mes: la ganancia real va a ser menor.
                  </Estado>
                ) : llega ? (
                  <Estado tono="ok">Por encima del objetivo.</Estado>
                ) : (
                  <Estado tono="mal">
                    Faltan {formatArsCorto(faltante)} de ganancia para llegar al {formatPct(objetivo)}.
                  </Estado>
                )}
              </div>

              <div className="mt-6 grid grid-cols-3 gap-4 border-t border-white/[0.06] pt-5">
                <Stat label="Vendido a hoy" value={formatArsCorto(r.aHoy.ventas)} />
                <Stat label="Ventas proyectadas" value={formatArsCorto(r.proyeccion.ventas)} />
                <Stat
                  label="Ganancia a hoy"
                  value={formatArsCorto(r.aHoy.ganancia)}
                  hint={r.aHoy.ventas > 0 ? formatPct(r.aHoy.rentabilidad) : undefined}
                />
              </div>
            </>
          )}
        </Panel>

        {/* ---------- Publicidad: cuánto por día ---------- */}
        <Panel className="flex flex-col xl:col-span-4">
          <PanelTitle title="Publicidad" sub={`Para cerrar el mes en ${formatPct(objetivo)}`} />

          {sinVentas ? (
            <p className="text-sm text-muted-foreground">Se calcula cuando haya ventas en el mes.</p>
          ) : sinMargen ? (
            <>
              <p className="text-3xl font-semibold tracking-tight text-red-400">Sin margen</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Aunque no se gaste más en publicidad, este mes no llega al {formatPct(objetivo)}.
              </p>
            </>
          ) : (
            <>
              <p className="text-[13px] text-muted-foreground">Podés gastar hasta</p>
              <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">
                {montoDia(r.publicidadPorDia, porDiaUsd)}
                <span className="ml-1.5 text-lg font-medium text-muted-foreground">por día</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {porDiaUsd != null ? `${formatArs(r.publicidadPorDia)} con IVA · ` : ''}
                entre todas las plataformas, de acá a fin de mes
              </p>
            </>
          )}

          {!sinVentas && diaria != null ? (
            <div className="mt-6 space-y-3">
              <ComparaDia
                label="Gasto diario actual"
                valor={montoDia(diaria, diariaUsd)}
                proporcion={sinMargen ? 1 : diaria / Math.max(diaria, r.publicidadPorDia)}
                tono={excedido || sinMargen ? 'mal' : 'fuerte'}
              />
              {!sinMargen ? (
                <ComparaDia
                  label="Máximo para el objetivo"
                  valor={montoDia(r.publicidadPorDia, porDiaUsd)}
                  proporcion={r.publicidadPorDia / Math.max(diaria, r.publicidadPorDia)}
                  tono="neutro"
                />
              ) : null}
              <p className="text-[11px] text-muted-foreground">Gasto diario: promedio de los últimos 7 días.</p>
            </div>
          ) : null}

          <div className="mt-auto pt-6">
            {sinVentas ? null : diaria == null ? (
              <Estado tono="neutro">Conectá Meta y Google para comparar con el gasto real.</Estado>
            ) : sinMargen ? (
              <Estado tono="mal">Conviene pausar o bajar campañas.</Estado>
            ) : excedido ? (
              <Estado tono="mal">
                Bajá unos {montoDia(diaria - r.publicidadPorDia, diariaUsd != null && porDiaUsd != null ? diariaUsd - porDiaUsd : null)} por día.
              </Estado>
            ) : (
              <Estado tono="ok">El gasto actual entra en el presupuesto.</Estado>
            )}
          </div>
        </Panel>

        {/* ---------- Ventas: lo que hace falta ---------- */}
        <Panel className="flex flex-col xl:col-span-3">
          <PanelTitle title="Ventas" sub={`Lo que hace falta para el ${formatPct(objetivo)}`} />
          {sinVentas ? (
            <p className="text-sm text-muted-foreground">Se calcula cuando haya ventas en el mes.</p>
          ) : necesarias.porDia == null || necesarias.ventasMes == null ? (
            <p className="text-sm text-muted-foreground">Con el costo de fabricación actual no se puede llegar al objetivo.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Stat label="Vendés por día" value={formatArsCorto(necesarias.ritmoActual)} />
                <Stat label="Necesitás por día" value={formatArsCorto(necesarias.porDia)} />
              </div>
              <div className="mt-5">
                <BarraNeutra
                  valor={necesarias.ritmoActual / Math.max(necesarias.ritmoActual, necesarias.porDia, 1)}
                  tono={necesarias.ritmoActual >= necesarias.porDia ? 'fuerte' : 'mal'}
                />
                <BarraNeutra className="mt-2" valor={necesarias.porDia / Math.max(necesarias.ritmoActual, necesarias.porDia, 1)} />
              </div>
              <p className="mt-5 text-sm text-muted-foreground">
                El mes tiene que cerrar en <span className="text-foreground">{formatArsCorto(necesarias.ventasMes)}</span>
                {necesarias.faltan != null && necesarias.faltan > 0 ? (
                  <>
                    {' '}· faltan <span className="text-foreground">{formatArsCorto(necesarias.faltan)}</span>
                  </>
                ) : null}
                .
              </p>
              <div className="mt-auto pt-6">
                {necesarias.ritmoActual >= necesarias.porDia ? (
                  <Estado tono="ok">El ritmo de ventas alcanza.</Estado>
                ) : (
                  <Estado tono="mal">
                    {ticket > 0
                      ? `Faltan unos ${Math.ceil((necesarias.porDia - necesarias.ritmoActual) / ticket)} pedidos más por día.`
                      : `Hace falta vender ${formatPct(necesarias.porDia / Math.max(1, necesarias.ritmoActual) - 1)} más por día.`}
                  </Estado>
                )}
              </div>
            </>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-12">
        {/* ---------- Cómo se forma la ganancia ---------- */}
        <Panel className="lg:col-span-2 xl:col-span-5">
          <PanelTitle
            title="De dónde sale la ganancia"
            sub="Cada gasto como parte de lo vendido"
            right={
              <Segmentado<Vista>
                valor={vista}
                onChange={setVista}
                opciones={[
                  { valor: 'fin', label: 'Fin de mes' },
                  { valor: 'hoy', label: 'A hoy' },
                ]}
              />
            }
          />
          <FilaDesglose label="Ventas" monto={desglose.ventas} proporcion={desglose.ventas > 0 ? 1 : 0} pct={desglose.ventas > 0 ? 1 : null} fuerte />
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
              label="Ganancia"
              monto={desglose.ganancia}
              proporcion={desglose.ventas > 0 ? Math.max(0, desglose.ganancia) / desglose.ventas : 0}
              pct={desglose.ventas > 0 ? desglose.ganancia / desglose.ventas : null}
              total
            />
          </div>
        </Panel>

        {/* ---------- Ventas por día ---------- */}
        <VentasPorDiaPanel
          className="xl:col-span-4"
          mes={mes}
          hoy={hoy}
          dias={ventasPorDia}
          necesarioPorDia={necesarias.porDia}
          objetivo={objetivo}
        />

        {/* ---------- Publicidad por plataforma ---------- */}
        <Panel className="flex flex-col xl:col-span-3">
          <PanelTitle title="Publicidad del mes" sub="Lo gastado hasta hoy, con IVA" />
          {plataformas.length ? (
            <>
              <div className="mb-6 flex flex-wrap items-baseline gap-x-3">
                <span className="text-3xl font-semibold tabular-nums tracking-tight">{formatArsCorto(totalPlataformas)}</span>
                {r.aHoy.ventas > 0 ? (
                  <span className="text-sm text-muted-foreground">{formatPct(totalPlataformas / r.aHoy.ventas)} de lo vendido</span>
                ) : null}
              </div>
              <ul className="space-y-4">
                {plataformas.map((p) => (
                  <li key={p.label}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span>{p.label}</span>
                      <span className="tabular-nums">
                        {formatArsCorto(p.ars)}
                        <span className="ml-2 inline-block w-10 text-right text-xs text-muted-foreground">
                          {totalPlataformas > 0 ? formatPct(p.ars / totalPlataformas) : ''}
                        </span>
                      </span>
                    </div>
                    <BarraNeutra className="mt-2" valor={totalPlataformas > 0 ? p.ars / totalPlataformas : 0} />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {loading ? 'Cargando…' : 'Todavía no hay publicidad registrada este mes.'}
            </p>
          )}
          {pedidosHoy > 0 && totalPlataformas > 0 ? (
            <div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/[0.06] pt-5">
              <Stat label="Publicidad por pedido" value={formatArsCorto(totalPlataformas / pedidosHoy)} hint={`${pedidosHoy} pedidos`} />
              <Stat label="Ticket promedio" value={formatArsCorto(ticket)} hint={ticket > 0 ? `${formatPct(totalPlataformas / pedidosHoy / ticket)} se va en publicidad` : undefined} />
            </div>
          ) : null}
          {valuacion && usdPublicidad > 0 ? (
            <p className="mt-auto pt-6 text-xs text-muted-foreground">
              {formatUsd(usdPublicidad)} + IVA ·{' '}
              {valuacion.estado === 'pagado'
                ? `pagados a ${formatArs(valuacion.cotizacionEfectiva)} por dólar`
                : `al blue de hoy (${formatArs(valuacion.cotizacionEfectiva)})`}
            </p>
          ) : null}
        </Panel>
      </div>

      <HistorialPanel
        historial={historial}
        actual={
          sinVentas
            ? null
            : {
                mes,
                label: 'Este mes',
                ventas: r.proyeccion.ventas,
                publicidad: r.proyeccion.publicidad,
                ganancia: r.proyeccion.ganancia,
                pedidos: pedidosHoy,
              }
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

function ComparaDia({
  label,
  valor,
  proporcion,
  tono,
}: {
  label: string;
  valor: string;
  proporcion: number;
  tono: 'neutro' | 'fuerte' | 'mal';
}) {
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
    <div className="grid grid-cols-[minmax(0,11rem)_1fr_5.5rem_3.5rem] items-center gap-3 py-2 text-sm sm:grid-cols-[minmax(0,14rem)_1fr_6rem_3.5rem]">
      <span className={cn('truncate', total ? 'font-medium' : 'text-foreground/85')}>{label}</span>
      <BarraNeutra valor={proporcion} tono={fuerte || total ? 'fuerte' : 'neutro'} className={cn(destacar && '[&>div]:bg-[#e0812f]/80')} />
      <span className={cn('text-right tabular-nums', total && 'font-semibold', monto < 0 && !total && 'text-foreground/80', total && monto < 0 && 'text-red-400')}>
        {formatArsCorto(monto)}
      </span>
      <span className="text-right text-xs tabular-nums text-muted-foreground">{pct != null ? formatPct(pct) : '—'}</span>
    </div>
  );
}

/** Barras por día del mes; los días que faltan quedan como huecos. Línea = lo necesario por día. */
function VentasPorDiaPanel({
  className,
  mes,
  hoy,
  dias,
  necesarioPorDia,
  objetivo,
}: {
  className?: string;
  mes: string;
  hoy: string;
  dias: VentaDia[];
  necesarioPorDia: number | null;
  objetivo: number;
}) {
  const total = diasDelMes(mes);
  const porFecha = new Map(dias.map((d) => [d.fecha, d]));
  const serie = Array.from({ length: total }, (_, i) => {
    const fecha = `${mes}-${String(i + 1).padStart(2, '0')}`;
    return { dia: i + 1, fecha, futuro: fecha > hoy, ventas: porFecha.get(fecha)?.ventas ?? 0, pedidos: porFecha.get(fecha)?.pedidos ?? 0 };
  });
  const max = Math.max(1, necesarioPorDia ?? 0, ...serie.map((d) => d.ventas));
  const conVentas = serie.filter((d) => !d.futuro);
  const mejor = conVentas.reduce<(typeof serie)[number] | null>((a, d) => (!a || d.ventas > a.ventas ? d : a), null);
  const pedidos = conVentas.reduce((s, d) => s + d.pedidos, 0);
  const lineaPct = necesarioPorDia != null ? Math.min(1, necesarioPorDia / max) : null;

  return (
    <Panel className={cn('flex flex-col', className)}>
      <PanelTitle title="Ventas por día" sub={`${pedidos} pedidos en el mes`} />
      <div className="relative flex h-40 items-end gap-[3px]">
        {serie.map((d) => (
          <div
            key={d.dia}
            title={d.futuro ? `${d.dia}` : `${d.dia}: ${formatArs(d.ventas)} · ${d.pedidos} pedidos`}
            className="flex h-full flex-1 items-end"
          >
            <div
              className={cn(
                'w-full rounded-[3px]',
                d.futuro ? 'h-1 bg-white/[0.05]' : d.fecha === hoy ? 'bg-white/40' : 'bg-white/70',
              )}
              style={d.futuro ? undefined : { height: `${Math.max(2, (d.ventas / max) * 100)}%` }}
            />
          </div>
        ))}
        {lineaPct != null ? (
          <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[#e0812f]/70" style={{ bottom: `${lineaPct * 100}%` }}>
            <span className="absolute -top-5 right-0 text-[11px] text-[#f0a35a]">necesario para {formatPct(objetivo)}</span>
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>1</span>
        <span>{Math.ceil(total / 2)}</span>
        <span>{total}</span>
      </div>
      {mejor && mejor.ventas > 0 ? (
        <p className="mt-auto pt-5 text-xs text-muted-foreground">
          Mejor día: el {mejor.dia}, con {formatArsCorto(mejor.ventas)} ({mejor.pedidos} pedidos). Hoy va parcial.
        </p>
      ) : null}
    </Panel>
  );
}

/** Rentabilidad de los últimos meses contra el objetivo, más el mes en curso proyectado. */
function HistorialPanel({
  historial,
  actual,
  objetivo,
}: {
  historial: MesHistorial[];
  actual: MesHistorial | null;
  objetivo: number;
}) {
  const meses = actual ? [...historial, actual] : historial;
  if (!meses.length) return null;
  const rent = (m: MesHistorial) => (m.ventas > 0 ? m.ganancia / m.ventas : 0);
  const escala = Math.max(objetivo * 1.6, ...meses.map((m) => rent(m)));
  const ALTO = 140; // px del área de barras

  return (
    <Panel>
      <PanelTitle
        title="Últimos meses"
        sub="Ganancia sobre ventas con el mismo cálculo. Hasta septiembre la publicidad es la de la tarjeta; desde octubre, la automática."
      />
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${meses.length}, minmax(0, 1fr))` }}>
        {meses.map((m) => {
          const rr = rent(m);
          const esActual = actual?.mes === m.mes;
          return (
            <div key={m.mes} className="min-w-0">
              <div className="relative border-b border-white/15" style={{ height: ALTO }}>
                <div className="absolute -inset-x-1.5 border-t border-dashed border-white/35" style={{ bottom: (objetivo / escala) * ALTO }} />
                <div className="absolute inset-0 flex items-end justify-center">
                  <div
                    className={cn(
                      'w-full max-w-14 rounded-t-lg',
                      rr < 0 ? 'bg-red-400/70' : rr >= objetivo ? 'bg-gradient-to-t from-[#8a4a1c] via-[#e0812f] to-[#f6c46b]' : 'bg-white/60',
                      esActual && 'opacity-60',
                    )}
                    style={{ height: Math.max(3, (Math.max(0, rr) / escala) * ALTO) }}
                  />
                </div>
              </div>
              <div className="mt-3 text-center">
                <p className={cn('text-lg font-semibold tabular-nums', rr < 0 && 'text-red-400')}>{formatPct(rr)}</p>
                <p className="text-[13px] text-muted-foreground">{esActual ? 'Este mes (proy.)' : m.label}</p>
              </div>
              <dl className="mt-3 space-y-1 border-t border-white/[0.06] pt-3 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Ventas</dt>
                  <dd className="tabular-nums">{formatArsCorto(m.ventas)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Publicidad</dt>
                  <dd className="tabular-nums">{m.ventas > 0 ? formatPct(m.publicidad / m.ventas) : '—'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Ganancia</dt>
                  <dd className={cn('tabular-nums', m.ganancia < 0 && 'text-red-400')}>{formatArsCorto(m.ganancia)}</dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-[11px] text-muted-foreground">
        Línea punteada: objetivo {formatPct(objetivo)}. En bronce, los meses que lo alcanzaron.
      </p>
    </Panel>
  );
}
