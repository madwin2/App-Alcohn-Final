/**
 * Vista previa (solo desarrollo) de «Mes en curso» y «Gastos automáticos» con datos de ejemplo.
 * Ruta: /dev/control-gastos
 */
import { useMemo, useState } from 'react';
import { MesEnCursoPanel } from '@/components/economia/MesEnCursoPanel';
import { Panel, PanelTitle, Segmentado } from '@/components/economia/controlGastosUi';
import { BarrasApiladasMes, BarrasMes, CeldaMes, Sparkline, Variacion, filaCls, tablaCls, tdCls, theadCls, thCls } from '@/components/economia/EconomiaGraficos';
import { GastosAutoCard } from '@/components/gastos/GastosAutoCard';
import { GastosRecurrentesCard } from '@/components/gastos/GastosRecurrentesCard';
import { Toaster } from '@/components/ui/toaster';
import { DEFAULT_CONTROL_GASTOS_CONFIG, valuarGastosPorMes, type GastoRegistro } from '@/lib/gastos/gastosAuto';
import type { GastosAutoData } from '@/lib/supabase/services/gastosAuto.service';

type Escenario = 'excedido' | 'bien' | 'sin-conectar';

const HOY = '2026-10-06';
const MESES_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const HISTORIAL = Array.from({ length: 27 }, (_, i) => {
  const d = new Date(2024, 6 + i, 1);
  const ventas = 9_000_000 + i * 480_000 + (i % 4) * 1_300_000;
  const pub = ventas * (0.12 + (i % 5) * 0.03);
  const ganancia = ventas * (0.05 + ((i * 7) % 11) * 0.022) - (i === 26 ? 2_000_000 : 0);
  return {
    mes: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    label: `${MESES_ES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
    ventas,
    publicidad: pub,
    ganancia,
    pedidos: Math.round(ventas / 95_000),
  };
});
const FERIADOS = ['2026-10-12'];
const RECURRENTES = [
  { id: 'h', nombre: 'Hetzner', categoria: 'automatizaciones' as const, moneda: 'USD' as const, monto: 38, ivaAplica: true, diaDelMes: 1, activo: true },
  { id: 'c', nombre: 'Canva', categoria: 'automatizaciones' as const, moneda: 'USD' as const, monto: 15, ivaAplica: true, diaDelMes: 3, activo: true },
  { id: 'w', nombre: 'Dominio y hosting web', categoria: 'automatizaciones' as const, moneda: 'ARS' as const, monto: 25_000, ivaAplica: false, diaDelMes: 10, activo: true },
  { id: 'f', nombre: 'Bot Francisco (servidor)', categoria: 'automatizaciones' as const, moneda: 'USD' as const, monto: 20, ivaAplica: true, diaDelMes: 5, activo: false },
];
const BLUE = 1545;

function registrosDemo(escala: number): GastoRegistro[] {
  const out: GastoRegistro[] = [];
  let id = 0;
  const dias = ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06'];
  for (const fecha of dias) {
    const r = (p: Partial<GastoRegistro>) => out.push({ id: String(++id), fecha, externalRef: '', ivaAplica: true, moneda: 'USD', ...p } as GastoRegistro);
    r({ proveedor: 'meta_ads', categoria: 'publicidad', concepto: 'Sellos para cuero — conversiones', monto: 52 * escala });
    r({ proveedor: 'meta_ads', categoria: 'publicidad', concepto: 'Remarketing web', monto: 18 * escala });
    r({ proveedor: 'meta_ads', categoria: 'publicidad', concepto: 'Mensajes a WhatsApp — madera', monto: 23 * escala });
    r({ proveedor: 'google_ads', categoria: 'publicidad', concepto: 'Búsqueda — sello personalizado', monto: 27 * escala });
    r({ proveedor: 'openai', categoria: 'automatizaciones', concepto: 'Web – imágenes', monto: 1.8 });
  }
  out.push({ id: 'h', fecha: '2026-10-01', proveedor: 'recurrente', categoria: 'automatizaciones', concepto: 'Hetzner', externalRef: 'h', moneda: 'USD', monto: 38, ivaAplica: true });
  out.push({ id: 'c', fecha: '2026-10-03', proveedor: 'recurrente', categoria: 'automatizaciones', concepto: 'Canva', externalRef: 'c', moneda: 'USD', monto: 15, ivaAplica: true });
  return out;
}

export default function ControlGastosSandboxPage() {
  const [esc, setEsc] = useState<Escenario>('excedido');
  const config = DEFAULT_CONTROL_GASTOS_CONFIG;

  const registros = useMemo(() => (esc === 'sin-conectar' ? [] : registrosDemo(esc === 'bien' ? 0.4 : 1)), [esc]);
  const porMes = useMemo(() => valuarGastosPorMes(registros, [], BLUE, config), [registros, config]);
  const oct = porMes['2026-10'];

  const data: GastosAutoData = {
    config,
    registros,
    pagos: [],
    recurrentes: esc === 'sin-conectar' ? [] : RECURRENTES,
    feriados: FERIADOS,
    cotizaciones: [{ fecha: HOY, oficial: 1540, blue: BLUE }],
    cotizacion: { fecha: HOY, blueVenta: BLUE, oficialVenta: 1540 },
    ultimosSync:
      esc === 'sin-conectar'
        ? [{ proveedor: 'cotizacion', ok: true, detalle: 'blue 1545', filas: null, createdAt: `${HOY}T10:00:00Z` }]
        : [
            { proveedor: 'cotizacion', ok: true, detalle: null, filas: null, createdAt: `${HOY}T10:00:00Z` },
            { proveedor: 'meta_ads', ok: true, detalle: null, filas: 21, createdAt: `${HOY}T10:00:02Z` },
            { proveedor: 'google_ads', ok: true, detalle: null, filas: 7, createdAt: `${HOY}T09:00:00Z` },
            { proveedor: 'openai', ok: true, detalle: null, filas: 7, createdAt: `${HOY}T10:00:03Z` },
            { proveedor: 'recurrentes', ok: true, detalle: null, filas: 2, createdAt: `${HOY}T10:00:01Z` },
          ],
  };

  const ventas = esc === 'bien' ? 4_100_000 : 3_150_000;
  const row = {
    ventasBrutas: ventas,
    pedidos: 33,
    unidades: 38,
    sellos: 30,
    costosVentas: ventas * 0.155,
    costoRegalos: 40_000,
    costoPruebas: 12_000,
    costosFijos: 0,
    gastosExtras: (oct?.porCategoria.automatizaciones ?? 0) + (oct?.impuestosExtra ?? 0) + 60_000,
    publicidad: oct?.porCategoria.publicidad ?? 0,
    enviosManual: 90_000,
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Vista previa · control de gastos</h1>
        <Segmentado<Escenario>
          valor={esc}
          onChange={setEsc}
          opciones={[
            { valor: 'excedido', label: 'Gasto alto' },
            { valor: 'bien', label: 'En presupuesto' },
            { valor: 'sin-conectar', label: 'Sin conectar' },
          ]}
        />
      </div>

      <p className="mb-3 text-[13px] text-muted-foreground">Economía → Mes en curso</p>
      <MesEnCursoPanel
        mes="2026-10"
        etiquetaMes="Octubre 2026"
        hoy={HOY}
        row={row}
        fijos={{ total: 8_900_000, estimado: 8_550_000, faltan: ['Sueldos', 'Alquiler', 'Electricidad'] }}
        etiquetaMesAnterior="septiembre"
        ventasPorDia={[
          { fecha: '2026-10-01', ventas: ventas * 0.22, pedidos: 8, items: 9, sellos: 7 },
          { fecha: '2026-10-02', ventas: ventas * 0.26, pedidos: 9, items: 11, sellos: 9 },
          { fecha: '2026-10-03', ventas: ventas * 0.07, pedidos: 2, items: 2, sellos: 2 },
          { fecha: '2026-10-04', ventas: ventas * 0.05, pedidos: 2, items: 2, sellos: 1 },
          { fecha: '2026-10-05', ventas: ventas * 0.28, pedidos: 9, items: 10, sellos: 8 },
          { fecha: '2026-10-06', ventas: ventas * 0.12, pedidos: 3, items: 4, sellos: 3 },
        ]}
        historial={HISTORIAL}
        valuacion={oct}
        registros={registros}
        recurrentes={data.recurrentes}
        feriados={FERIADOS}
        config={config}
        blueHoy={BLUE}
        loading={false}
      />

      <p className="mb-3 mt-12 text-[13px] text-muted-foreground">Economía → Ventas / Productos / Por año (componentes)</p>
      <div className="flex flex-col gap-4">
        <Panel>
          <PanelTitle title="Ventas por mes" sub="Últimos 12 meses" />
          <BarrasMes
            datos={HISTORIAL.slice(-12).map((m, i, a) => ({ key: m.mes, label: m.label, valor: m.ventas, actual: i === a.length - 1 }))}
            formato={(n) => `$ ${(n / 1_000_000).toFixed(1).replace('.', ',')} M`}
            referencia={{ valor: 17_000_000, label: 'promedio' }}
          />
        </Panel>
        <Panel>
          <PanelTitle title="Productos por mes" sub="24 meses" />
          <BarrasApiladasMes
            filas={HISTORIAL.slice(-24).map((m) => ({ key: m.mes, label: m.label, valores: { s: m.pedidos * 0.7, a: m.pedidos * 0.2, o: m.pedidos * 0.1 } }))}
            series={[
              { key: 's', label: 'Sellos medianos', color: '#e0812f' },
              { key: 'a', label: 'Abecedarios', color: '#9ca3af' },
              { key: 'o', label: 'Accesorios', color: '#4b5563' },
            ]}
            formato={(n) => String(Math.round(n))}
            actualKey={HISTORIAL[HISTORIAL.length - 1].mes}
          />
        </Panel>
        <div className="grid gap-4 lg:grid-cols-3">
          {['Ventas', 'Ganancia', 'Ahorro e inversiones'].map((t, k) => (
            <Panel key={t}>
              <h3 className="text-[15px] font-medium">{t}</h3>
              <Sparkline valores={HISTORIAL.map((m) => (k === 0 ? m.ventas : k === 1 ? m.ganancia : m.publicidad))} className="mt-4" alto={72} />
            </Panel>
          ))}
        </div>
        <Panel>
          <PanelTitle title="Mes a mes" sub="Tabla" />
          <table className={tablaCls}>
            <thead className={theadCls}>
              <tr>
                <th className={thCls}>Mes</th>
                <th className={thCls}>Pedidos</th>
                <th className={thCls}>Ventas</th>
                <th className={thCls}>Ganancia</th>
                <th className={thCls}>Ventas vs mes ant.</th>
              </tr>
            </thead>
            <tbody>
              {HISTORIAL.slice(-5).reverse().map((m, i) => (
                <tr key={m.mes} className={filaCls(i === 0)}>
                  <td className={tdCls}>
                    <CeldaMes label={m.label} actual={i === 0} />
                  </td>
                  <td className={tdCls}>{m.pedidos}</td>
                  <td className={tdCls}>{Math.round(m.ventas).toLocaleString('es-AR')}</td>
                  <td className={tdCls}>{Math.round(m.ganancia).toLocaleString('es-AR')}</td>
                  <td className={tdCls}>
                    <Variacion pct={i === 0 ? null : (i % 2 ? 8 : -5)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <p className="mb-3 mt-12 text-[13px] text-muted-foreground">Gastos</p>
      <div className="grid gap-4 lg:grid-cols-5 lg:items-start">
        <div className="lg:col-span-3">
          <GastosAutoCard
            mes="2026-10"
            etiquetaMes="Octubre 2026"
            valuacion={oct}
            data={data}
            blueHoy={BLUE}
            loading={false}
            error={null}
            onReload={async () => {}}
          />
        </div>
        <div className="lg:col-span-2">
          <GastosRecurrentesCard
            key={esc}
            onChanged={async () => {}}
            demo={
              esc === 'sin-conectar'
                ? []
                : [
                    { id: 'h', nombre: 'Hetzner', categoria: 'automatizaciones', moneda: 'USD', monto: 38, ivaAplica: true, diaDelMes: 1, activo: true },
                    { id: 'c', nombre: 'Canva', categoria: 'automatizaciones', moneda: 'USD', monto: 15, ivaAplica: true, diaDelMes: 3, activo: true },
                    { id: 'w', nombre: 'Dominio y hosting web', categoria: 'automatizaciones', moneda: 'ARS', monto: 25_000, ivaAplica: false, diaDelMes: 10, activo: true },
                    { id: 'f', nombre: 'Bot Francisco (servidor)', categoria: 'automatizaciones', moneda: 'USD', monto: 20, ivaAplica: true, diaDelMes: 5, activo: false },
                  ]
            }
          />
        </div>
      </div>
      <Toaster />
    </div>
  );
}
