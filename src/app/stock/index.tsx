import { useEffect, useMemo, useState } from 'react';
import { AppMain } from '@/components/layout/AppMain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/components/ui/use-toast';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PLANCHUELA_REF_ORDER } from '@/lib/bronce/planchuelaRef';
import { getApprovedUsers } from '@/lib/supabase/services/auth.service';
import {
  currentMonthRange,
  formatRangoFechas,
  getBronceConsumo,
  shiftMonthRange,
  type BronceConsumoResumen,
} from '@/lib/supabase/services/bronceConsumo.service';
import {
  getPendingShipmentStockDemand,
  getStockAssignments,
  getStockItems,
  setAssignmentForItem,
  setStockQuantity,
  StockItem,
  syncStockReplenishTasksForCurrentUser,
} from '@/lib/supabase/services/stock.service';

function formatCm(value: number): string {
  return value.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatPesos(value: number): string {
  return value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
}

export default function StockPage() {
  const { toast } = useToast();
  const [rango, setRango] = useState(currentMonthRange);
  const [bronce, setBronce] = useState<BronceConsumoResumen | null>(null);
  const [bronceLoading, setBronceLoading] = useState(true);
  const [items, setItems] = useState<StockItem[]>([]);
  const [pendingDemandByKey, setPendingDemandByKey] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [pendingQty, setPendingQty] = useState<Record<string, string>>({});

  const shortageItems = useMemo(() => {
    return items.filter((item) => {
      const needed = pendingDemandByKey[item.itemKey] ?? 0;
      if (needed <= 0) return false;
      return item.quantity < needed;
    });
  }, [items, pendingDemandByKey]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [stockItems, approvedUsers, assignmentMap, demand] = await Promise.all([
        getStockItems(),
        getApprovedUsers(),
        getStockAssignments(),
        getPendingShipmentStockDemand(),
      ]);
      setItems(stockItems);
      setUsers(approvedUsers);
      setAssignments(assignmentMap);
      setPendingDemandByKey(demand);
      setPendingQty(
        Object.fromEntries(stockItems.map((item) => [item.id, String(item.quantity)])),
      );
      await syncStockReplenishTasksForCurrentUser();
    } catch (error) {
      toast({
        title: 'Error cargando stock',
        description:
          error instanceof Error
            ? error.message
            : 'No se pudo cargar la configuración de stock.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadBronce = async () => {
      setBronceLoading(true);
      try {
        const resumen = await getBronceConsumo(rango.desde, rango.hasta);
        if (!cancelled) setBronce(resumen);
      } catch (error) {
        if (!cancelled) {
          toast({
            title: 'Error cargando consumo de bronce',
            description: error instanceof Error ? error.message : 'No se pudo cargar el resumen.',
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setBronceLoading(false);
      }
    };
    loadBronce();
    return () => {
      cancelled = true;
    };
  }, [rango.desde, rango.hasta, toast]);

  const shiftMes = (delta: number) => {
    setRango((prev) => shiftMonthRange(prev.desde, delta));
  };

  const rangoLabel = useMemo(
    () => formatRangoFechas(rango.desde, rango.hasta),
    [rango.desde, rango.hasta],
  );

  const planchuelasEnPeriodo = useMemo(
    () => (bronce?.rows.length ? bronce.rows.map((r) => r.tipoRef) : PLANCHUELA_REF_ORDER),
    [bronce?.rows],
  );

  const handleSaveStock = async (item: StockItem) => {
    try {
      await setStockQuantity(item.id, Number(pendingQty[item.id] ?? item.quantity));
      await loadData();
      toast({
        title: 'Stock actualizado',
        description: `Se guardaron los cambios de ${item.itemName}.`,
      });
    } catch (error) {
      toast({
        title: 'No se pudo guardar',
        description: error instanceof Error ? error.message : 'Error desconocido.',
        variant: 'destructive',
      });
    }
  };

  const handleToggleAssignee = async (item: StockItem, userId: string) => {
    const current = assignments[item.itemKey] ?? [];
    const next = current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId];

    try {
      await setAssignmentForItem(item.itemKey, next);
      setAssignments((prev) => ({ ...prev, [item.itemKey]: next }));
      toast({
        title: 'Responsables actualizados',
        description: `Se actualizó la asignación de ${item.itemName}.`,
      });
    } catch (error) {
      toast({
        title: 'Error al asignar responsables',
        description: error instanceof Error ? error.message : 'No se pudo guardar.',
        variant: 'destructive',
      });
    }
  };

  return (
    <AppMain className="flex flex-col">
        <div className="border-b bg-background p-6">
          <h1 className="text-2xl font-semibold">Stock</h1>
          <p className="text-sm text-muted-foreground mt-1">
            El mínimo necesario se calcula solo: suma lo que hace falta para los pedidos cuyo envío todavía
            no está en «Seguimiento enviado» (misma receta que al descontar al enviar).
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Consumo de bronce</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Se registra al marcar un sello como Hecho (largo + 0,8 cm de corte). Rehacer cuenta de nuevo.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="icon" variant="outline" onClick={() => shiftMes(-1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    Desde
                    <Input
                      type="date"
                      value={rango.desde}
                      onChange={(e) =>
                        setRango((prev) => ({ ...prev, desde: e.target.value }))
                      }
                      className="h-8 w-[10.5rem] text-sm"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    Hasta
                    <Input
                      type="date"
                      value={rango.hasta}
                      onChange={(e) =>
                        setRango((prev) => ({ ...prev, hasta: e.target.value }))
                      }
                      className="h-8 w-[10.5rem] text-sm"
                    />
                  </label>
                </div>
                <Button type="button" size="icon" variant="outline" onClick={() => shiftMes(1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="border-b bg-muted/10 px-4 py-2">
              <p className="text-xs text-muted-foreground">
                Período: <span className="font-medium text-foreground">{rangoLabel}</span>
              </p>
            </div>

            <div className="px-4 py-3 border-b">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Total del período
              </p>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/30">
                    <tr className="text-left">
                      <th className="px-4 py-3">Planchuela</th>
                      <th className="px-4 py-3">Cm usados</th>
                      <th className="px-4 py-3">Costo material</th>
                      <th className="px-4 py-3">Sellos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bronceLoading ? (
                      <tr>
                        <td className="px-4 py-6 text-muted-foreground" colSpan={4}>
                          Cargando consumo...
                        </td>
                      </tr>
                    ) : !bronce?.rows.length ? (
                      <tr>
                        <td className="px-4 py-6 text-muted-foreground" colSpan={4}>
                          Sin consumo registrado en este período.
                        </td>
                      </tr>
                    ) : (
                      <>
                        {bronce.rows.map((row) => (
                          <tr key={row.tipoRef} className="border-b last:border-b-0">
                            <td className="px-4 py-3">{row.label}</td>
                            <td className="px-4 py-3 tabular-nums">{formatCm(row.totalCm)} cm</td>
                            <td className="px-4 py-3 tabular-nums">{formatPesos(row.totalPesos)}</td>
                            <td className="px-4 py-3 tabular-nums text-muted-foreground">{row.sellosCount}</td>
                          </tr>
                        ))}
                        <tr className="bg-muted/20 font-medium">
                          <td className="px-4 py-3">Total</td>
                          <td className="px-4 py-3 tabular-nums">{formatCm(bronce.totalCm)} cm</td>
                          <td className="px-4 py-3 tabular-nums">{formatPesos(bronce.totalPesos)}</td>
                          <td className="px-4 py-3 tabular-nums text-muted-foreground">{bronce.totalSellos}</td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Día por día
              </p>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/30">
                    <tr className="text-left">
                      <th className="px-4 py-3 whitespace-nowrap">Día</th>
                      {planchuelasEnPeriodo.map((ref) => (
                        <th key={ref} className="px-4 py-3 whitespace-nowrap">
                          {bronce?.rows.find((r) => r.tipoRef === ref)?.label ?? `${ref} mm`}
                        </th>
                      ))}
                      <th className="px-4 py-3">Total cm</th>
                      <th className="px-4 py-3">Costo</th>
                      <th className="px-4 py-3">Sellos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bronceLoading ? (
                      <tr>
                        <td
                          className="px-4 py-6 text-muted-foreground"
                          colSpan={planchuelasEnPeriodo.length + 4}
                        >
                          Cargando detalle...
                        </td>
                      </tr>
                    ) : !bronce?.dailyRows.length ? (
                      <tr>
                        <td
                          className="px-4 py-6 text-muted-foreground"
                          colSpan={planchuelasEnPeriodo.length + 4}
                        >
                          Sin consumo por día en este período.
                        </td>
                      </tr>
                    ) : (
                      bronce.dailyRows.map((day) => (
                        <tr key={day.date} className="border-b last:border-b-0">
                          <td className="px-4 py-3 whitespace-nowrap">{day.label}</td>
                          {planchuelasEnPeriodo.map((ref) => {
                            const celda = day.porPlanchuela[ref];
                            return (
                              <td key={ref} className="px-4 py-3 tabular-nums text-muted-foreground">
                                {celda.sellos > 0 ? `${formatCm(celda.cm)} cm` : '—'}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 tabular-nums">{formatCm(day.totalCm)} cm</td>
                          <td className="px-4 py-3 tabular-nums">{formatPesos(day.totalPesos)}</td>
                          <td className="px-4 py-3 tabular-nums text-muted-foreground">{day.totalSellos}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm font-medium">Resumen rápido</p>
            <p className="text-sm text-muted-foreground mt-1">
              Ítems con stock por debajo de lo necesario para pendientes: {shortageItems.length}
            </p>
            {!!shortageItems.length && (
              <p className="text-xs text-muted-foreground mt-1">
                {shortageItems.map((item) => item.itemName).join(' | ')}
              </p>
            )}
          </div>

          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr className="text-left">
                    <th className="px-4 py-3">Ítem</th>
                    <th className="px-4 py-3">Stock actual</th>
                    <th className="px-4 py-3">Necesario (pendientes)</th>
                    <th className="px-4 py-3">Responsables por faltante</th>
                    <th className="px-4 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td className="px-4 py-6 text-muted-foreground" colSpan={5}>
                        Cargando stock...
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => {
                      const needed = pendingDemandByKey[item.itemKey] ?? 0;
                      const isShort = needed > 0 && item.quantity < needed;
                      const selectedUsers = assignments[item.itemKey] ?? [];
                      return (
                        <tr key={item.id} className="border-b last:border-b-0">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span>{item.itemName}</span>
                              {isShort ? (
                                <span className="text-xs rounded-full border border-red-400/40 text-red-500 px-2 py-0.5">
                                  Bajo
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3 w-44">
                            <Input
                              type="number"
                              min={0}
                              value={pendingQty[item.id] ?? ''}
                              onChange={(event) =>
                                setPendingQty((prev) => ({ ...prev, [item.id]: event.target.value }))
                              }
                            />
                          </td>
                          <td className="px-4 py-3 w-36 tabular-nums text-muted-foreground">
                            {needed}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              {users.map((user) => {
                                const active = selectedUsers.includes(user.id);
                                return (
                                  <Button
                                    key={`${item.id}-${user.id}`}
                                    type="button"
                                    size="sm"
                                    variant={active ? 'default' : 'outline'}
                                    onClick={() => handleToggleAssignee(item, user.id)}
                                  >
                                    {user.name}
                                  </Button>
                                );
                              })}
                              {!users.length && (
                                <span className="text-xs text-muted-foreground">
                                  Sin usuarios aprobados para asignar.
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Button size="sm" onClick={() => handleSaveStock(item)}>
                              Guardar
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      <Toaster />
    </AppMain>
  );
}
