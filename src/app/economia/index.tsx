import { useMemo, useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Sidebar } from '@/components/pedidos/Sidebar/Sidebar';
import { useAuth } from '@/lib/hooks/useAuth';
import { useOrders } from '@/lib/hooks/useOrders';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  const points = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * 100;
      const y = 100 - (v / max) * 100;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg viewBox="0 0 100 100" className="w-full h-24">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400" />
    </svg>
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
      <div className="ml-20 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Economía</h1>
          <div className="flex gap-3">
            <label className="text-sm">Costos fijos mensuales</label>
            <input
              className="bg-background border rounded px-2 py-1 w-36"
              type="number"
              value={fixedMonthlyCost}
              onChange={(e) => setFixedMonthlyCost(Number(e.target.value || 0))}
            />
            <label className="text-sm">Dólar</label>
            <input className="bg-background border rounded px-2 py-1 w-24" type="number" value={usdRate} onChange={(e) => setUsdRate(Number(e.target.value || 1))} />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Registro por mes</CardTitle>
          </CardHeader>
          <CardContent className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th>Mes</th><th>Ventas Brutas</th><th>Costos Fijos</th><th>Costos Ventas</th><th>Sellos</th><th>Soldadores</th><th>Mangos</th><th>Abecedarios</th><th>Bases</th><th>Ganancia $</th><th>Ganancia USD</th><th>Transferido</th><th>Pendiente</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((r) => (
                  <tr key={r.key} className="border-b">
                    <td>{r.label}</td>
                    <td>{formatArs(r.ventasBrutas)}</td>
                    <td>{formatArs(r.costosFijos)}</td>
                    <td>{formatArs(r.costosVentas)}</td>
                    <td>{r.sellos}</td>
                    <td>{r.soldadores}</td>
                    <td>{r.mangos}</td>
                    <td>{r.abecedarios}</td>
                    <td>{r.bases}</td>
                    <td>{formatArs(r.gananciaPesos)}</td>
                    <td>{formatUsd(r.gananciaUsd)}</td>
                    <td>{formatArs(r.transferido)}</td>
                    <td>{formatArs(r.pendiente)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Ventas Totales</p><p className="text-xl font-semibold">{formatArs(totals.ventasBrutas)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Costos Totales</p><p className="text-xl font-semibold">{formatArs(totals.costosVentas + totals.costosFijos)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Ganancia Total</p><p className="text-xl font-semibold">{formatArs(totals.gananciaPesos)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Transferido</p><p className="text-xl font-semibold">{formatArs(totals.transferido)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Pendiente</p><p className="text-xl font-semibold">{formatArs(totals.pendiente)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Pedidos Totales</p><p className="text-xl font-semibold">{totals.pedidos}</p></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Desglose de ítems vendidos</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {itemBreakdown.map((row) => (
              <div key={row.item}>
                <div className="flex justify-between text-sm">
                  <span>{row.item}</span>
                  <span>{row.unidades} u. | {formatArs(row.ganancia)} ganancia</span>
                </div>
                <div className="h-2 bg-muted rounded">
                  <div className="h-2 bg-blue-400 rounded" style={{ width: `${row.pct}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Ticket Promedio</p><p className="text-3xl font-semibold">{formatArs(ticketPromedio)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Unidades promedio por pedido</p><p className="text-3xl font-semibold">{unidadesPromedio.toFixed(1)}</p></CardContent></Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Card><CardHeader><CardTitle className="text-base">Venta Bruta</CardTitle></CardHeader><CardContent><TinyLineChart values={monthly.map((m) => m.ventasBrutas)} /></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Ganancia USD</CardTitle></CardHeader><CardContent><TinyLineChart values={monthly.map((m) => m.gananciaUsd)} /></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Unidades vendidas</CardTitle></CardHeader><CardContent><TinyLineChart values={monthly.map((m) => m.unidades)} /></CardContent></Card>
        </div>
      </div>
      <Toaster />
    </div>
  );
}
