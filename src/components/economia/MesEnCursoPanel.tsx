import { useMemo, useState } from 'react';
import {
  PROVEEDOR_LABEL,
  calcularMesEnCurso,
  publicidadDiariaReciente,
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
};

type Props = {
  mes: string;
  etiquetaMes: string;
  hoy: string;
  row: MesEnCursoRow | undefined;
  /** Fijos del mes anterior, para estimar si el mes en curso todavía no tiene fijos cargados. */
  fijosMesAnterior: number;
  fijosCargados: boolean;
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

  const r = useMemo(
    () =>
      calcularMesEnCurso({
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
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-5">
        {/* ---------- Héroe: ¿llegamos al objetivo? ---------- */}
        <Panel className="lg:col-span-3">
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
        <Panel className="flex flex-col lg:col-span-2">
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
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* ---------- Cómo se forma la ganancia ---------- */}
        <Panel className="lg:col-span-3">
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

        {/* ---------- Publicidad por plataforma ---------- */}
        <Panel className="flex flex-col lg:col-span-2">
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
