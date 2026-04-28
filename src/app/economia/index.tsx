import { useMemo, useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Sidebar } from '@/components/pedidos/Sidebar/Sidebar';
import { useAuth } from '@/lib/hooks/useAuth';
import { useOrders } from '@/lib/hooks/useOrders';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toaster } from '@/components/ui/toaster';
import type { Order, OrderItem } from '@/lib/types';

const ALLOWED_EMAIL = 'julian.475@hotmail.com';
const STORAGE_KEY_FIXED = 'economia_fixed_monthly_cost_ars';
const STORAGE_KEY_USD = 'economia_usd_rate';

type MonthlyRow = {
  key: string;
  label: string;
  ventasBrutas: number;
  costosFijos: number;
  costosVentas: number;
  sellos: number;
  soldadores: number;
  mangos: number;
  abecedarios: number;
  bases: number;
  unidades: number;
  transferido: number;
  pendiente: number;
  gananciaPesos: number;
  gananciaUsd: number;
  pedidos: number;
};

const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString('es-AR', { month: 'short', year: '2-digit' });
};

const formatArs = (value: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);

const formatUsd = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

const itemTypeLabel = (item: string) => {
  if (item === 'SELLO') return 'Sellos';
  if (item === 'SOLDADOR') return 'Soldadores';
  if (item === 'MANGO_GOLPE') return 'Mango de golpe';
  if (item === 'ABECEDARIO') return 'Abecedarios';
  if (item === 'BASE_REMACHADORA') return 'Base remachadora';
  return item;
};

const itemTypeOf = (item: OrderItem): 'SELLO' | 'ABECEDARIO' | 'SOLDADOR' | 'MANGO_GOLPE' | 'BASE_REMACHADORA' => {
  if (item.itemType) return item.itemType;
  if (item.stampType === 'ABC') return 'ABECEDARIO';
  return 'SELLO';
};

const orderMonthKey = (order: Order): string => {
  const d = order.orderDate ? new Date(order.orderDate) : new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  return `${y}-${m}`;
};

function TinyLineChart({ values }: { values: number[] }) {
  if (values.length === 0) return <div className="h-24 text-xs text-muted-foreground">Sin datos</div>;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const points = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * 100;
      const y = 100 - ((v - min) / span) * 100;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <div className="flex flex-col gap-2">
      <svg viewBox="0 0 100 100" className="h-24 w-full">
        <line x1="0" y1="100" x2="100" y2="100" stroke="currentColor" className="text-border" strokeWidth="1" />
        <line x1="0" y1="0" x2="100" y2="0" stroke="currentColor" className="text-border" strokeWidth="1" />
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.2" className="text-primary" />
      </svg>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Mín {min.toFixed(0)}</span>
        <span>Máx {max.toFixed(0)}</span>
      </div>
    </div>
  );
}

export default function EconomiaPage() {
  const { user, loading: authLoading } = useAuth();
  const { orders, loading } = useOrders();
  const [fixedMonthlyCost, setFixedMonthlyCost] = useState(0);
  const [usdRate, setUsdRate] = useState(1200);

  useEffect(() => {
    const fixedRaw = localStorage.getItem(STORAGE_KEY_FIXED);
    const usdRaw = localStorage.getItem(STORAGE_KEY_USD);
    if (fixedRaw) setFixedMonthlyCost(Number(fixedRaw) || 0);
    if (usdRaw) setUsdRate(Number(usdRaw) || 1200);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_FIXED, String(fixedMonthlyCost));
  }, [fixedMonthlyCost]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_USD, String(usdRate));
  }, [usdRate]);

  const isAllowed = user?.email?.toLowerCase() === ALLOWED_EMAIL;

  const monthly = useMemo<MonthlyRow[]>(() => {
    const byMonth = new Map<string, MonthlyRow>();

    for (const order of orders) {
      const key = orderMonthKey(order);
      const row =
        byMonth.get(key) ||
        {
          key,
          label: monthLabel(key),
          ventasBrutas: 0,
          costosFijos: fixedMonthlyCost,
          costosVentas: 0,
          sellos: 0,
          soldadores: 0,
          mangos: 0,
          abecedarios: 0,
          bases: 0,
          unidades: 0,
          transferido: 0,
          pendiente: 0,
          gananciaPesos: 0,
          gananciaUsd: 0,
          pedidos: 0,
        };

      row.pedidos += 1;
      row.ventasBrutas += Number(order.totalValue || 0);
      row.costosVentas += Number(order.fabricationCostTotal || 0);

      for (const item of order.items) {
        row.unidades += 1;
        const t = itemTypeOf(item);
        if (t === 'SELLO') row.sellos += 1;
        if (t === 'SOLDADOR') row.soldadores += 1;
        if (t === 'MANGO_GOLPE') row.mangos += 1;
        if (t === 'ABECEDARIO') row.abecedarios += 1;
        if (t === 'BASE_REMACHADORA') row.bases += 1;

        const value = Number(item.itemValue || 0);
        if (item.saleState === 'TRANSFERIDO') {
          row.transferido += value;
        }
      }

      row.pendiente = row.ventasBrutas - row.transferido;
      row.gananciaPesos = row.ventasBrutas - row.costosVentas - row.costosFijos;
      row.gananciaUsd = usdRate > 0 ? row.gananciaPesos / usdRate : 0;

      byMonth.set(key, row);
    }

    return Array.from(byMonth.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [orders, fixedMonthlyCost, usdRate]);

  const totals = useMemo(() => {
    return monthly.reduce(
      (acc, r) => {
        acc.ventasBrutas += r.ventasBrutas;
        acc.costosFijos += r.costosFijos;
        acc.costosVentas += r.costosVentas;
        acc.gananciaPesos += r.gananciaPesos;
        acc.gananciaUsd += r.gananciaUsd;
        acc.transferido += r.transferido;
        acc.pendiente += r.pendiente;
        acc.unidades += r.unidades;
        acc.pedidos += r.pedidos;
        acc.sellos += r.sellos;
        acc.soldadores += r.soldadores;
        acc.mangos += r.mangos;
        acc.abecedarios += r.abecedarios;
        acc.bases += r.bases;
        return acc;
      },
      {
        ventasBrutas: 0,
        costosFijos: 0,
        costosVentas: 0,
        gananciaPesos: 0,
        gananciaUsd: 0,
        transferido: 0,
        pendiente: 0,
        unidades: 0,
        pedidos: 0,
        sellos: 0,
        soldadores: 0,
        mangos: 0,
        abecedarios: 0,
        bases: 0,
      },
    );
  }, [monthly]);

  const itemBreakdown = useMemo(() => {
    const map = new Map<string, { unidades: number; ventas: number; costos: number; ganancia: number }>();
    for (const order of orders) {
      for (const item of order.items) {
        const t = itemTypeOf(item);
        const current = map.get(t) || { unidades: 0, ventas: 0, costos: 0, ganancia: 0 };
        current.unidades += 1;
        current.ventas += Number(item.itemValue || 0);
        current.costos += Number(item.fabricationCostItem || 0);
        current.ganancia += Number(item.fabricationMarginItem || 0);
        map.set(t, current);
      }
    }
    return Array.from(map.entries()).map(([item, v]) => ({
      item,
      ...v,
      pct: totals.unidades > 0 ? (v.unidades / totals.unidades) * 100 : 0,
    }));
  }, [orders, totals.unidades]);

  const ticketPromedio = totals.pedidos > 0 ? totals.ventasBrutas / totals.pedidos : 0;
  const unidadesPromedio = totals.pedidos > 0 ? totals.unidades / totals.pedidos : 0;

  if (authLoading || loading) {
    return <div className="min-h-screen flex items-center justify-center">Cargando...</div>;
  }

  if (!isAllowed) {
    return <Navigate to="/pedidos" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="ml-20 p-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
          <Card>
            <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <CardTitle>Economía</CardTitle>
                  <Badge variant="secondary">Panel ejecutivo</Badge>
                </div>
                <CardDescription>Vista consolidada de ventas, costos, márgenes y tendencias.</CardDescription>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="fixed-cost">Costos fijos mensuales</Label>
                  <Input
                    id="fixed-cost"
                    type="number"
                    value={fixedMonthlyCost}
                    onChange={(e) => setFixedMonthlyCost(Number(e.target.value || 0))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="usd-rate">Dólar referencia</Label>
                  <Input
                    id="usd-rate"
                    type="number"
                    value={usdRate}
                    onChange={(e) => setUsdRate(Number(e.target.value || 1))}
                  />
                </div>
              </div>
            </CardHeader>
          </Card>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader>
                <CardDescription>Ventas brutas</CardDescription>
                <CardTitle className="text-2xl">{formatArs(totals.ventasBrutas)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Ganancia total</CardDescription>
                <CardTitle className="text-2xl">{formatArs(totals.gananciaPesos)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Ganancia en USD</CardDescription>
                <CardTitle className="text-2xl">{formatUsd(totals.gananciaUsd)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Pendiente de cobro</CardDescription>
                <CardTitle className="text-2xl">{formatArs(totals.pendiente)}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Tabs defaultValue="mensual">
            <TabsList>
              <TabsTrigger value="mensual">Mensual</TabsTrigger>
              <TabsTrigger value="mix">Mix de ítems</TabsTrigger>
              <TabsTrigger value="tendencias">Tendencias</TabsTrigger>
            </TabsList>

            <TabsContent value="mensual">
              <Card>
                <CardHeader>
                  <CardTitle>Registro por mes</CardTitle>
                  <CardDescription>Evolución mensual de ventas, costos y resultado.</CardDescription>
                </CardHeader>
                <CardContent className="overflow-auto">
                  <table className="w-full min-w-[980px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-3">Mes</th>
                        <th className="py-2 pr-3 text-right">Ventas Brutas</th>
                        <th className="py-2 pr-3 text-right">Costos Fijos</th>
                        <th className="py-2 pr-3 text-right">Costos Ventas</th>
                        <th className="py-2 pr-3 text-center">Sellos</th>
                        <th className="py-2 pr-3 text-center">Soldadores</th>
                        <th className="py-2 pr-3 text-center">Mangos</th>
                        <th className="py-2 pr-3 text-center">Abecedarios</th>
                        <th className="py-2 pr-3 text-center">Bases</th>
                        <th className="py-2 pr-3 text-right">Ganancia $</th>
                        <th className="py-2 pr-3 text-right">Ganancia USD</th>
                        <th className="py-2 pr-3 text-right">Transferido</th>
                        <th className="py-2 text-right">Pendiente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthly.map((r) => (
                        <tr key={r.key} className="border-b last:border-0">
                          <td className="py-2 pr-3">
                            <Badge variant="outline">{r.label}</Badge>
                          </td>
                          <td className="py-2 pr-3 text-right">{formatArs(r.ventasBrutas)}</td>
                          <td className="py-2 pr-3 text-right">{formatArs(r.costosFijos)}</td>
                          <td className="py-2 pr-3 text-right">{formatArs(r.costosVentas)}</td>
                          <td className="py-2 pr-3 text-center">{r.sellos}</td>
                          <td className="py-2 pr-3 text-center">{r.soldadores}</td>
                          <td className="py-2 pr-3 text-center">{r.mangos}</td>
                          <td className="py-2 pr-3 text-center">{r.abecedarios}</td>
                          <td className="py-2 pr-3 text-center">{r.bases}</td>
                          <td className="py-2 pr-3 text-right font-medium">{formatArs(r.gananciaPesos)}</td>
                          <td className="py-2 pr-3 text-right">{formatUsd(r.gananciaUsd)}</td>
                          <td className="py-2 pr-3 text-right">{formatArs(r.transferido)}</td>
                          <td className="py-2 text-right">{formatArs(r.pendiente)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="mix">
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                <Card className="xl:col-span-2">
                  <CardHeader>
                    <CardTitle>Desglose de ítems vendidos</CardTitle>
                    <CardDescription>Participación en unidades y ganancia por categoría.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    {itemBreakdown.map((row) => (
                      <div key={row.item} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{itemTypeLabel(row.item)}</Badge>
                            <span className="text-muted-foreground">{row.unidades} u.</span>
                          </div>
                          <span className="font-medium">{formatArs(row.ganancia)}</span>
                        </div>
                        <div className="h-2 rounded bg-muted">
                          <div className="h-2 rounded bg-primary" style={{ width: `${row.pct}%` }} />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <div className="flex flex-col gap-3">
                  <Card>
                    <CardHeader>
                      <CardDescription>Ticket promedio</CardDescription>
                      <CardTitle>{formatArs(ticketPromedio)}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardDescription>Unidades por pedido</CardDescription>
                      <CardTitle>{unidadesPromedio.toFixed(1)}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardDescription>Pedidos totales</CardDescription>
                      <CardTitle>{totals.pedidos}</CardTitle>
                    </CardHeader>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="tendencias">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Venta bruta</CardTitle>
                    <CardDescription>{formatArs(totals.ventasBrutas)} acumulado</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <TinyLineChart values={monthly.map((m) => m.ventasBrutas)} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Ganancia USD</CardTitle>
                    <CardDescription>{formatUsd(totals.gananciaUsd)} acumulado</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <TinyLineChart values={monthly.map((m) => m.gananciaUsd)} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Unidades vendidas</CardTitle>
                    <CardDescription>{totals.unidades} unidades</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <TinyLineChart values={monthly.map((m) => m.unidades)} />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
      <Toaster />
    </div>
  );
}
