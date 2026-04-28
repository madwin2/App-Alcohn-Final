import { useEffect, useMemo, useState } from 'react';
import { Sidebar } from '@/components/pedidos/Sidebar/Sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/components/ui/use-toast';
import { getApprovedUsers } from '@/lib/supabase/services/auth.service';
import {
  getPendingShipmentStockDemand,
  getStockAssignments,
  getStockItems,
  setAssignmentForItem,
  setStockQuantity,
  StockItem,
  syncStockReplenishTasksForCurrentUser,
} from '@/lib/supabase/services/stock.service';

export default function StockPage() {
  const { toast } = useToast();
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
    <div className="min-h-screen bg-background">
      <Sidebar />

      <div className="flex-1 flex flex-col ml-20">
        <div className="border-b bg-background p-6">
          <h1 className="text-2xl font-semibold">Stock</h1>
          <p className="text-sm text-muted-foreground mt-1">
            El mínimo necesario se calcula solo: suma lo que hace falta para los pedidos cuyo envío todavía
            no está en «Seguimiento enviado» (misma receta que al descontar al enviar).
          </p>
        </div>

        <div className="p-6 space-y-4">
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
      </div>
      <Toaster />
    </div>
  );
}
