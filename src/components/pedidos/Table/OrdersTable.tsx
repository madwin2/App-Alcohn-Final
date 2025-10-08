import { useMemo, useState, useEffect } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  SortingState,
  ColumnFiltersState,
  getFilteredRowModel,
} from '@tanstack/react-table';
import { Order, FabricationState, SaleState, ShippingState, StampType } from '@/lib/types/index';
import { createUnifiedColumns } from './UnifiedColumns';
import { useOrdersStore } from '@/lib/state/orders.store';
import { useToast } from '@/components/ui/use-toast';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu';
import { DndTableContainer } from './DndTableContainer';
import { ResizableHeader } from './ResizableHeader';

interface OrdersTableProps {
  orders: Order[];
}

export function OrdersTable({ orders }: OrdersTableProps) {
  const { 
    searchQuery, 
    setEditingRow, 
    editingRowId, 
    columns, 
    setColumnSize, 
    reorderColumns,
    viewMode 
  } = useOrdersStore();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState[]>([] as any);
  const { toast } = useToast();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditingRow(null);
    };
    const onDblClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('tr[data-row]')) setEditingRow(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('dblclick', onDblClickOutside);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('dblclick', onDblClickOutside);
    };
  }, [setEditingRow]);

  const filteredOrders = useMemo(() => {
    if (!searchQuery) return orders;
    const searchLower = searchQuery.toLowerCase();
    return orders.filter(order =>
      order.customer.firstName.toLowerCase().includes(searchLower) ||
      order.customer.lastName.toLowerCase().includes(searchLower) ||
      order.customer.email?.toLowerCase().includes(searchLower) ||
      order.items.some(item => item.designName.toLowerCase().includes(searchLower))
    );
  }, [orders, searchQuery]);

  const onUpdate = (orderId: string, _patch: any) => {
    toast({ title: 'Pedido actualizado', description: `Se guardaron cambios en ${orderId}` });
  };

  const handleDelete = (orderId: string) => {
    toast({ title: 'Pedido eliminado', description: `Se eliminó el pedido ${orderId}` });
  };

  const handleTipoChange = (orderId: string, newTipo: StampType) => {
    toast({ title: 'Tipo actualizado', description: `Tipo cambiado a ${newTipo} para ${orderId}` });
  };
  const handleFabricacionChange = (orderId: string, newState: FabricationState) => {
    toast({ title: 'Fabricación', description: `Estado cambiado a ${newState} para ${orderId}` });
  };
  const handleVentaChange = (orderId: string, newState: SaleState) => {
    toast({ title: 'Venta', description: `Estado cambiado a ${newState} para ${orderId}` });
  };
  const handleEnvioEstadoChange = (orderId: string, newState: ShippingState) => {
    toast({ title: 'Envío', description: `Estado cambiado a ${newState} para ${orderId}` });
  };
  const handleDateChange = (_orderId: string, newDate: Date) => {
    toast({ title: 'Fecha actualizada', description: `${newDate.toLocaleDateString('es-ES')}` });
  };

  const handleDeadlineChange = (_orderId: string, deadline: Date | null) => {
    if (deadline) {
      toast({ title: 'Fecha límite establecida', description: `${deadline.toLocaleDateString('es-ES')}` });
    } else {
      toast({ title: 'Fecha límite eliminada', description: 'Se removió la fecha límite' });
    }
  };

  const handleTaskCreate = (orderId: string, title: string, _description?: string, dueDate?: Date) => {
    const dueDateText = dueDate ? ` con fecha límite ${dueDate.toLocaleDateString('es-ES')}` : '';
    toast({ title: 'Tarea creada', description: `"${title}" agregada al pedido ${orderId}${dueDateText}` });
  };

  const handleTaskUpdate = (taskId: string, _updates: any) => {
    toast({ title: 'Tarea actualizada', description: `Tarea ${taskId} modificada` });
  };

  const handleTaskDelete = (taskId: string) => {
    toast({ title: 'Tarea eliminada', description: `Tarea ${taskId} removida` });
  };

  // Funciones específicas para vista de órdenes
  const handleOrderTipoChange = (orderId: string, newTipo: any) => {
    toast({ title: 'Tipo actualizado', description: `Tipo cambiado a ${newTipo} para ${orderId}` });
  };
  const handleOrderFabricacionChange = (orderId: string, newState: any) => {
    toast({ title: 'Fabricación', description: `Estado cambiado a ${newState} para ${orderId}` });
  };
  const handleOrderVentaChange = (orderId: string, newState: any) => {
    toast({ title: 'Venta', description: `Estado cambiado a ${newState} para ${orderId}` });
  };
  const handleOrderEnvioEstadoChange = (orderId: string, newState: any) => {
    toast({ title: 'Envío', description: `Estado cambiado a ${newState} para ${orderId}` });
  };

  const handleProgressChange = (orderId: string, newStep: any) => {
    toast({ title: 'Progreso', description: `Estado cambiado a ${newStep} para ${orderId}` });
  };

  const tableColumns = useMemo(() => {
    return createUnifiedColumns({
      onTipoChange: viewMode === 'orders' ? handleOrderTipoChange : handleTipoChange,
      onFabricacionChange: viewMode === 'orders' ? handleOrderFabricacionChange : handleFabricacionChange,
      onVentaChange: viewMode === 'orders' ? handleOrderVentaChange : handleVentaChange,
      onEnvioEstadoChange: viewMode === 'orders' ? handleOrderEnvioEstadoChange : handleEnvioEstadoChange,
      onEnvioChange: undefined,
      onDateChange: handleDateChange,
      onDeadlineChange: handleDeadlineChange,
      onTaskCreate: handleTaskCreate,
      onTaskUpdate: handleTaskUpdate,
      onTaskDelete: handleTaskDelete,
      onProgressChange: handleProgressChange,
      editingRowId,
      onUpdate,
      viewMode,
    });
  }, [editingRowId, viewMode]);

  // Sistema unificado de columnas con redimensionamiento y reordenamiento
  const sortedColumns = useMemo(() => {
    return columns
      .sort((a, b) => a.order - b.order)
      .map(col => {
        const tableCol = tableColumns.find(tc => tc.id === col.id);
        return tableCol ? { ...tableCol, size: col.size } : null;
      })
      .filter((col): col is NonNullable<typeof col> => col !== null);
  }, [columns, tableColumns]);

  const columnIds = columns.map(col => col.id);

  const table = useReactTable({
    data: filteredOrders,
    columns: sortedColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters as any,
    state: {
      sorting,
      columnFilters: columnFilters as any,
    },
    enableColumnResizing: false, // Deshabilitar redimensionamiento de TanStack
    enableHiding: false, // Deshabilitar ocultar columnas
  });

  const handleRowDoubleClick = (orderId: string) => setEditingRow(orderId);

  return (
    <div className="rounded-md border bg-card">
      <DndTableContainer 
        columnIds={columnIds} 
        onReorder={reorderColumns}
      >
            <div className="overflow-x-auto">
              <table className="w-full">
            <thead className="border-b bg-card">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const columnState = columns.find(col => col.id === header.column.id);
                    const align = (header.column.columnDef.meta as any)?.align || 'left';
                    const isContacto = header.id === 'contacto';
                    const isRestante = header.id === 'restante';
                    const isStateColumn = ['fabricacion', 'venta', 'envioEstado'].includes(header.id);
                    const paddingClass = isStateColumn ? 'px-0' : 'px-2';
                    
                    return (
                      <ResizableHeader
                        key={header.id}
                        id={header.column.id}
                        header=""
                        size={columnState?.size || 100}
                        onResize={setColumnSize}
                        className={`${paddingClass} py-4 text-xs font-medium text-muted-foreground uppercase tracking-wider relative ${isContacto ? 'border-r border-border/30' : ''} ${isRestante ? 'border-r border-border/30' : ''} ${align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'}`}
                      >
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </ResizableHeader>
                    );
                  })}
                </tr>
              ))}
            </thead>
          <tbody className="divide-y divide-border">
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <ContextMenu key={row.id}>
                  <ContextMenuTrigger asChild>
                    <tr data-row onDoubleClick={() => handleRowDoubleClick(row.original.id)} className={`hover:bg-muted/50 transition-colors ${editingRowId === row.original.id ? 'ring-1 ring-primary/40' : ''}`}>
                      {row.getVisibleCells().map((cell) => {
                            const columnState = columns.find(col => col.id === cell.column.id);
                            const align = (cell.column.columnDef.meta as any)?.align || 'left';
                        const isContacto = cell.column.id === 'contacto';
                        const isRestante = cell.column.id === 'restante';
                        const isStateColumn = ['fabricacion', 'venta', 'envioEstado'].includes(cell.column.id);
                        const paddingClass = isStateColumn ? 'px-0' : 'px-2';
                        
                        return (
                          <td key={cell.id} className={`${paddingClass} py-3 h-12 align-middle whitespace-nowrap overflow-hidden text-ellipsis text-sm relative ${isContacto ? 'border-r border-border/30' : ''} ${isRestante ? 'border-r border-border/30' : ''} ${align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'}`} style={{ width: `${columnState?.size || 100}px` }}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      })}
                    </tr>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onSelect={() => setEditingRow(row.original.id)}>Editar pedido</ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem className="text-red-500" onSelect={() => handleDelete(row.original.id)}>Eliminar pedido</ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="h-24 text-center text-muted-foreground">No se encontraron pedidos.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </DndTableContainer>
    </div>
  );
}
