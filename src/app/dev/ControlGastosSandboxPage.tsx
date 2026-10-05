/**
 * Vista previa (solo desarrollo) de «Mes en curso» y «Gastos automáticos» con datos de ejemplo.
 * Ruta: /dev/control-gastos
 */
import { useMemo, useState } from 'react';
import { MesEnCursoPanel } from '@/components/economia/MesEnCursoPanel';
import { Segmentado } from '@/components/economia/controlGastosUi';
import { GastosAutoCard } from '@/components/gastos/GastosAutoCard';
import { GastosRecurrentesCard } from '@/components/gastos/GastosRecurrentesCard';
import { Toaster } from '@/components/ui/toaster';
import { DEFAULT_CONTROL_GASTOS_CONFIG, valuarGastosPorMes, type GastoRegistro } from '@/lib/gastos/gastosAuto';
import type { GastosAutoData } from '@/lib/supabase/services/gastosAuto.service';

type Escenario = 'excedido' | 'bien' | 'sin-conectar';

const HOY = '2026-10-05';
const BLUE = 1545;

function registrosDemo(escala: number): GastoRegistro[] {
  const out: GastoRegistro[] = [];
  let id = 0;
  const dias = ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'];
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
      <div className="mx-auto mb-8 flex max-w-6xl items-center justify-between gap-4">
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

      <p className="mx-auto mb-3 max-w-6xl text-[13px] text-muted-foreground">Economía → Mes en curso</p>
      <MesEnCursoPanel
        mes="2026-10"
        etiquetaMes="Octubre 2026"
        hoy={HOY}
        row={row}
        fijosMesAnterior={8_700_000}
        fijosCargados={false}
        valuacion={oct}
        registros={registros}
        config={config}
        blueHoy={BLUE}
        loading={false}
      />

      <p className="mx-auto mb-3 mt-12 max-w-6xl text-[13px] text-muted-foreground">Gastos</p>
      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-5 lg:items-start">
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
