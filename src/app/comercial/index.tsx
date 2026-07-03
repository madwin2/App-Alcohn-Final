import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download,
  Globe,
  Loader2,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { AppMain } from '@/components/layout/AppMain';
import {
  FunnelChart,
  MaterialPanel,
  MockupToVentaKpi,
  PaymentPanel,
  TinyLineChart,
  TrendPanel,
} from '@/components/comercial/ComercialCharts';
import {
  ClientesWebTable,
  ContactosSinMuestraTable,
  MockupsSinCompraTable,
  OrdenesSeguimientoTable,
  SeguimientosClientesPanel,
  TrafficPanel,
} from '@/components/comercial/ComercialTables';
import { ClienteDetailDialog } from '@/components/comercial/ClienteDetailDialog';
import { ComercialConfirmPagoDialog } from '@/components/comercial/ComercialConfirmPagoDialog';
import { ComercialExcludeDialog } from '@/components/comercial/ComercialExcludeDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/components/ui/use-toast';
import type { ComercialDashboardData, ComercialOrigenFilter, OrdenSeguimientoRow } from '@/lib/comercial/types';
import {
  conversionRate,
  exportPotencialesCsv,
  formatShortDate,
  pctChange,
  presetRange,
} from '@/lib/comercial/utils';
import type { MockupSinCompraRow } from '@/lib/comercial/types';
import { sendComercialContactoWhatsApp } from '@/lib/supabase/services/comercialContacto.service';
import { enviarLoteSeguimientosClientes } from '@/lib/supabase/services/comercialSeguimientos.service';
import { fetchComercialDashboard, excludeFromComercialWeb } from '@/lib/supabase/services/comercialWeb.service';
import { confirmWebOrderPayment } from '@/lib/supabase/services/webOrderPayment.service';
import type { ComercialEntityType } from '@/lib/comercial/exclusions';
import { useAuth } from '@/lib/hooks/useAuth';

type PresetDays = '7' | '30' | '90' | 'custom';

function KpiCard({
  label,
  value,
  previousValue,
  funnelPreviousValue,
  stepLabel,
}: {
  label: string;
  value: number;
  previousValue: number;
  funnelPreviousValue?: number;
  stepLabel?: string;
}) {
  const delta = pctChange(value, previousValue);
  const conv =
    stepLabel && funnelPreviousValue != null
      ? conversionRate(value, funnelPreviousValue)
      : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value.toLocaleString('es-AR')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 text-xs text-muted-foreground">
        {delta != null ? (
          <span className={delta >= 0 ? 'text-green-600' : 'text-destructive'}>
            {delta >= 0 ? '+' : ''}
            {delta.toFixed(0)}% vs período anterior
          </span>
        ) : (
          <span>Sin comparación previa</span>
        )}
        {conv != null && stepLabel ? (
          <span>
            {conv.toFixed(1)}% {stepLabel}
          </span>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function ComercialPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [preset, setPreset] = useState<PresetDays>('30');
  const [range, setRange] = useState(() => presetRange(30));
  const [origen, setOrigen] = useState<ComercialOrigenFilter>('web');
  const [data, setData] = useState<ComercialDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('potenciales');
  const [detailClienteId, setDetailClienteId] = useState<string | null>(null);
  const [detailMeta, setDetailMeta] = useState<{ nombre?: string; telefono?: string | null } | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [excludeOpen, setExcludeOpen] = useState(false);
  const [excludeTarget, setExcludeTarget] = useState<{
    type: ComercialEntityType;
    id: string;
    label: string;
  } | null>(null);
  const [sendingContactoId, setSendingContactoId] = useState<string | null>(null);
  const [confirmPagoOpen, setConfirmPagoOpen] = useState(false);
  const [confirmPagoRow, setConfirmPagoRow] = useState<OrdenSeguimientoRow | null>(null);
  const [confirmingOrdenId, setConfirmingOrdenId] = useState<string | null>(null);
  const [sendingSeguimientos, setSendingSeguimientos] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const result = await fetchComercialDashboard(range, origen);
        setData(result);
      } catch (err: unknown) {
        toast({
          title: 'Error al cargar datos comerciales',
          description: err instanceof Error ? err.message : 'Error desconocido',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [range, origen, toast],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const handlePreset = (value: PresetDays) => {
    setPreset(value);
    if (value !== 'custom') {
      setRange(presetRange(Number(value)));
    }
  };

  const openCliente = (clienteId: string, meta?: { nombre?: string; telefono?: string | null }) => {
    setDetailClienteId(clienteId);
    setDetailMeta(meta ?? null);
    setDetailOpen(true);
  };

  const openExclude = (type: ComercialEntityType, id: string, label: string) => {
    setExcludeTarget({ type, id, label });
    setExcludeOpen(true);
  };

  const handleSendContacto = async (row: MockupSinCompraRow) => {
    const tel = (row.telefono ?? row.whatsapp ?? '').trim();
    if (!tel) {
      toast({
        title: 'Sin WhatsApp',
        description: 'Este cliente no tiene número para enviar el mensaje.',
        variant: 'destructive',
      });
      return;
    }

    setSendingContactoId(row.mockupId);
    try {
      const result = await sendComercialContactoWhatsApp({
        mockupId: row.mockupId,
        whatsapp: tel,
        nombre: row.nombre,
      });
      if (!result.ok) {
        toast({
          title: 'No se pudo enviar el mensaje',
          description: result.error ?? 'Error desconocido',
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: 'Mensaje enviado',
        description: `Se envió el contacto comercial a ${row.nombre}.`,
      });
      await load(true);
    } finally {
      setSendingContactoId(null);
    }
  };

  const handleConfirmExclude = async () => {
    if (!excludeTarget) return;
    try {
      await excludeFromComercialWeb({
        entityType: excludeTarget.type,
        entityId: excludeTarget.id,
        excluidoPor: user?.email ?? null,
      });
      toast({
        title: 'Registro excluido',
        description: 'Ya no aparece en Comercial Web ni en las métricas.',
      });
      setExcludeOpen(false);
      await load(true);
    } catch (err: unknown) {
      toast({
        title: 'No se pudo excluir',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
      throw err;
    }
  };

  const openConfirmPago = (row: OrdenSeguimientoRow) => {
    setConfirmPagoRow(row);
    setConfirmPagoOpen(true);
  };

  const handleConfirmPago = async ({ seniaMonto, disenoNombre }: { seniaMonto: number; disenoNombre: string }) => {
    if (!confirmPagoRow) return;
    setConfirmingOrdenId(confirmPagoRow.ordenId);
    try {
      await confirmWebOrderPayment({
        ordenId: confirmPagoRow.ordenId,
        validatedBy: user?.id ?? null,
        seniaMonto,
        disenoNombre,
      });
      toast({
        title: 'Pago confirmado',
        description: `${confirmPagoRow.nombre} ya es un pedido válido en Pedidos y Producción.`,
      });
      setConfirmPagoOpen(false);
      setConfirmPagoRow(null);
      await load(true);
    } catch (err: unknown) {
      toast({
        title: 'No se pudo confirmar el pago',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
      throw err;
    } finally {
      setConfirmingOrdenId(null);
    }
  };

  const handleEnviarLoteSeguimientos = async () => {
    setSendingSeguimientos(true);
    try {
      const enviados = await enviarLoteSeguimientosClientes(10);
      toast({
        title: enviados > 0 ? 'Seguimientos enviados' : 'Sin clientes elegibles',
        description:
          enviados > 0
            ? `Se envió el seguimiento a ${enviados} cliente${enviados === 1 ? '' : 's'}.`
            : 'No había clientes elegibles para este lote.',
      });
      await load(true);
    } catch (err: unknown) {
      toast({
        title: 'No se pudo enviar el lote',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setSendingSeguimientos(false);
    }
  };

  const detailCliente = useMemo(() => {
    if (!detailClienteId || !data) return null;
    return data.clientesWeb.find((c) => c.clienteId === detailClienteId) ?? null;
  }, [detailClienteId, data]);

  const muestrasCompletadas = useMemo(() => {
    if (!data) return 0;
    return data.mockupsSinCompra.length + (data.kpis.find((k) => k.key === 'ventas')?.value ?? 0);
  }, [data]);

  const alertCounts = useMemo(() => {
    if (!data) return { calientes: 0, mockupsViejos: 0 };
    return {
      calientes: data.ordenesSeguimiento.length + data.mockupsSinCompra.filter((m) => m.checkoutIniciado).length,
      mockupsViejos: data.mockupsSinCompra.filter((m) => m.diasSinCompra >= 7).length,
    };
  }, [data]);

  return (
    <AppMain className="pb-10">
      <Toaster />

      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 p-6 md:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Globe className="size-7 text-primary" />
              <h1 className="text-2xl font-semibold tracking-tight">Comercial Web</h1>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Embudo completo de la tienda: tráfico, contactos, mockups, checkouts y ventas. Listas accionables
              para remarketing por WhatsApp. Podés excluir pruebas con el ícono de papelera — dejan de contar en las
              métricas.
            </p>
            {data?.fetchedAt ? (
              <p className="text-xs text-muted-foreground">
                Actualizado: {formatShortDate(data.fetchedAt)}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={preset} onValueChange={(v) => handlePreset(v as PresetDays)}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 días</SelectItem>
                <SelectItem value="30">Últimos 30 días</SelectItem>
                <SelectItem value="90">Últimos 90 días</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>

            {preset === 'custom' ? (
              <>
                <DatePicker
                  date={range.from}
                  onDateChange={(d) => d && setRange((r) => ({ ...r, from: d }))}
                  placeholder="Desde"
                  className="rounded-md border px-2 py-1"
                />
                <DatePicker
                  date={range.to}
                  onDateChange={(d) => d && setRange((r) => ({ ...r, to: d }))}
                  placeholder="Hasta"
                  className="rounded-md border px-2 py-1"
                />
              </>
            ) : null}

            <Select value={origen} onValueChange={(v) => setOrigen(v as ComercialOrigenFilter)}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="web">Solo web</SelectItem>
                <SelectItem value="app">Solo app</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" size="icon" onClick={() => void load(true)} disabled={refreshing}>
              <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>

            <Button
              variant="outline"
              disabled={!data}
              onClick={() => {
                if (!data) return;
                exportPotencialesCsv(
                  data.mockupsSinCompra,
                  data.ordenesSeguimiento,
                  data.contactosSinMuestra,
                );
                toast({ title: 'CSV exportado', description: 'Lista de potenciales descargada.' });
              }}
            >
              <Download className="mr-2 size-4" />
              Exportar
            </Button>
          </div>
        </div>

        {!loading && data && !data.analytics.available ? (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="py-3 text-sm text-muted-foreground">
              Tráfico web: {data.analytics.unavailableReason ?? 'sin datos de analytics en el período.'}
            </CardContent>
          </Card>
        ) : null}

        {!loading && data && (alertCounts.calientes > 0 || alertCounts.mockupsViejos > 0) ? (
          <div className="flex flex-wrap gap-2">
            {alertCounts.calientes > 0 ? (
              <Badge variant="destructive">{alertCounts.calientes} oportunidades calientes</Badge>
            ) : null}
            {alertCounts.mockupsViejos > 0 ? (
              <Badge variant="secondary">{alertCounts.mockupsViejos} mockups +7 días sin compra</Badge>
            ) : null}
          </div>
        ) : null}

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
            <Loader2 className="size-8 animate-spin" />
            <p>Cargando métricas comerciales...</p>
          </div>
        ) : data ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
              {data.kpis.map((kpi) => (
                <KpiCard
                  key={kpi.key}
                  label={kpi.label}
                  value={kpi.value}
                  previousValue={kpi.previousValue}
                  funnelPreviousValue={kpi.funnelPreviousValue}
                  stepLabel={kpi.stepLabel}
                />
              ))}
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="flex h-auto flex-wrap gap-1">
                <TabsTrigger value="potenciales">Potenciales</TabsTrigger>
                <TabsTrigger value="resumen">Resumen</TabsTrigger>
                <TabsTrigger value="seguimientos">Seguimientos</TabsTrigger>
                <TabsTrigger value="trafico">Tráfico</TabsTrigger>
                <TabsTrigger value="clientes">Clientes</TabsTrigger>
              </TabsList>

              <TabsContent value="potenciales" className="mt-4 flex flex-col gap-4">
                <MockupsSinCompraTable
                  rows={data.mockupsSinCompra}
                  onOpenCliente={openCliente}
                  onExclude={(id, label) => openExclude('mockup', id, label)}
                  onSendContacto={handleSendContacto}
                  sendingContactoId={sendingContactoId}
                />
                <OrdenesSeguimientoTable
                  rows={data.ordenesSeguimiento}
                  onOpenCliente={openCliente}
                  onExclude={(id, label) => openExclude('orden', id, label)}
                  onConfirmPago={openConfirmPago}
                  confirmingOrdenId={confirmingOrdenId}
                />
                <ContactosSinMuestraTable
                  rows={data.contactosSinMuestra}
                  onOpenCliente={openCliente}
                  onExclude={(id, label) => openExclude('cliente', id, label)}
                />
              </TabsContent>

              <TabsContent value="resumen" className="mt-4 flex flex-col gap-4">
                <div className="grid gap-4 xl:grid-cols-3">
                  <Card className="xl:col-span-2">
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="size-4" />
                        <CardTitle className="text-base">Embudo de conversión</CardTitle>
                      </div>
                      <CardDescription>
                        Del tráfico anónimo a la venta pagada en el período seleccionado.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <FunnelChart steps={data.funnel} />
                    </CardContent>
                  </Card>
                  <MockupToVentaKpi
                    muestrasCompletadas={Math.max(muestrasCompletadas, data.kpis.find((k) => k.key === 'muestras')?.value ?? 0)}
                    ventas={data.kpis.find((k) => k.key === 'ventas')?.value ?? 0}
                  />
                </div>

                <TrendPanel dailyTrend={data.dailyTrend} />

                <div className="grid gap-4 lg:grid-cols-2">
                  <MaterialPanel data={data.materialBreakdown} />
                  <PaymentPanel data={data.paymentBreakdown} />
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Contactos vs ventas (tendencia)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TinyLineChart
                      values={data.dailyTrend.map((d) => d.contactos)}
                      className="max-w-xl"
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="seguimientos" className="mt-4">
                <SeguimientosClientesPanel
                  data={data.seguimientosClientes}
                  onRunBatch={handleEnviarLoteSeguimientos}
                  runningBatch={sendingSeguimientos}
                />
              </TabsContent>

              <TabsContent value="trafico" className="mt-4">
                <TrafficPanel analytics={data.analytics} />
              </TabsContent>

              <TabsContent value="clientes" className="mt-4">
                <ClientesWebTable
                  rows={data.clientesWeb}
                  onOpenCliente={openCliente}
                  onExclude={(id, label) => openExclude('cliente', id, label)}
                />
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No se pudieron cargar los datos. Probá actualizar o revisá la conexión con Supabase.
            </CardContent>
          </Card>
        )}
      </div>

      <ClienteDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        clienteId={detailClienteId}
        clienteNombre={detailCliente?.nombre ?? detailMeta?.nombre}
        clienteTelefono={detailCliente?.telefono ?? detailMeta?.telefono}
      />
      <ComercialExcludeDialog
        open={excludeOpen}
        onOpenChange={setExcludeOpen}
        entityType={excludeTarget?.type ?? null}
        entityLabel={excludeTarget?.label}
        onConfirm={handleConfirmExclude}
      />
      <ComercialConfirmPagoDialog
        open={confirmPagoOpen}
        onOpenChange={(open) => {
          setConfirmPagoOpen(open);
          if (!open) setConfirmPagoRow(null);
        }}
        row={confirmPagoRow}
        onConfirm={handleConfirmPago}
      />
    </AppMain>
  );
}
