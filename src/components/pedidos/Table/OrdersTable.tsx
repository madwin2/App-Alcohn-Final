import { useMemo, useState, useEffect } from 'react';
import React from 'react';
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
import { useSound } from '@/lib/hooks/useSound';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu';
import { DndTableContainer } from './DndTableContainer';
import { ResizableHeader } from './ResizableHeader';
import { useExpandableRows } from './useExpandableRows';
import './expand-animations.css';
import { AddStampDialog } from '../AddStamp/AddStampDialog';

interface OrdersTableProps {
  orders: Order[];
  onUpdate?: (orderId: string, updates: Partial<Order>) => Promise<Order>;
  onDelete?: (orderId: string) => Promise<void>;
  onAddStamp?: (orderId: string, item: Partial<any>, files?: { base?: File; vector?: File; photo?: File }) => Promise<void>;
  onDeleteStamp?: (stampId: string) => Promise<void>;
}

export function OrdersTable({ orders, onUpdate, onDelete, onAddStamp, onDeleteStamp }: OrdersTableProps) {
  // Debug: verificar qué datos están llegando
  console.log('OrdersTable - Total orders:', orders.length);
  console.log('OrdersTable - Order 9:', orders.find(o => o.id === '9'));
  
  const { 
    searchQuery, 
    setEditingRow, 
    editingRowId, 
    columns, 
    setColumnSize, 
    reorderColumns,
    filters,
    sort
  } = useOrdersStore();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState[]>([] as any);
  const { toast } = useToast();
  const { playSound } = useSound();
  const { toggleRow, isExpanded, isCollapsing, isExpanding } = useExpandableRows();
  const [addStampDialogOpen, setAddStampDialogOpen] = useState(false);
  const [selectedOrderForStamp, setSelectedOrderForStamp] = useState<Order | null>(null);

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
    let result = orders;

    // Aplicar búsqueda por texto
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      result = result.filter(order =>
        order.customer.firstName.toLowerCase().includes(searchLower) ||
        order.customer.lastName.toLowerCase().includes(searchLower) ||
        order.customer.email?.toLowerCase().includes(searchLower) ||
        order.items.some(item => item.designName.toLowerCase().includes(searchLower))
      );
    }

    // Aplicar filtros del store
    if (filters.dateRange?.from || filters.dateRange?.to) {
      result = result.filter(order => {
        const orderDate = new Date(order.orderDate);
        if (filters.dateRange?.from) {
          const fromDate = new Date(filters.dateRange.from);
          fromDate.setHours(0, 0, 0, 0);
          if (orderDate < fromDate) return false;
        }
        if (filters.dateRange?.to) {
          const toDate = new Date(filters.dateRange.to);
          toDate.setHours(23, 59, 59, 999);
          if (orderDate > toDate) return false;
        }
        return true;
      });
    }

    if (filters.fabrication && filters.fabrication.length > 0) {
      result = result.filter(order =>
        order.items.some(item => filters.fabrication!.includes(item.fabricationState))
      );
    }

    if (filters.sale && filters.sale.length > 0) {
      result = result.filter(order =>
        order.items.some(item => filters.sale!.includes(item.saleState)) ||
        (order.saleStateOrder && filters.sale!.includes(order.saleStateOrder))
      );
    }

    if (filters.shipping && filters.shipping.length > 0) {
      result = result.filter(order =>
        order.items.some(item => filters.shipping!.includes(item.shippingState))
      );
    }

    if (filters.types && filters.types.length > 0) {
      result = result.filter(order =>
        order.items.some(item => filters.types!.includes(item.stampType))
      );
    }

    if (filters.channels && filters.channels.length > 0) {
      result = result.filter(order =>
        order.items.some(item => {
          const channel = item.contact.channel;
          // Filtrar 'OTRO' como si fuera un canal válido
          return filters.channels!.includes(channel as any);
        })
      );
    }

    if (filters.uploaders && filters.uploaders.length > 0) {
      result = result.filter(order => {
        // Filtrar por el nombre del usuario que subió el pedido
        const uploaderName = order.takenBy?.name;
        return uploaderName && filters.uploaders!.includes(uploaderName);
      });
    }

    // Crear mapa de prioridad de fabricación (si existe)
    const priorityMap = sort.fabricationPriority && sort.fabricationPriority.length > 0
      ? new Map(sort.fabricationPriority.map((state, index) => [state, index]))
      : null;

    // Aplicar ordenamiento por prioridad de fabricación
    if (priorityMap) {
      result = [...result].sort((a, b) => {
        // Obtener el estado de fabricación más prioritario de cada orden
        const getMinPriority = (order: Order) => {
          const priorities = order.items
            .map(item => priorityMap.get(item.fabricationState))
            .filter((p): p is number => p !== undefined);
          return priorities.length > 0 ? Math.min(...priorities) : Infinity;
        };
        return getMinPriority(a) - getMinPriority(b);
      });
    }

    // Aplicar criterios de ordenamiento adicionales
    if (sort.criteria && sort.criteria.length > 0) {
      result = [...result].sort((a, b) => {
        for (const criteria of sort.criteria) {
          let comparison = 0;
          
          switch (criteria.field) {
            case 'fecha':
              comparison = new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime();
              break;
            case 'cliente':
              const aName = `${a.customer.firstName} ${a.customer.lastName}`;
              const bName = `${b.customer.firstName} ${b.customer.lastName}`;
              comparison = aName.localeCompare(bName);
              break;
            case 'fabricacion':
              // Usar el estado más prioritario si existe priorityMap
              if (priorityMap) {
                const aFab = a.items.map(i => priorityMap.get(i.fabricationState) ?? Infinity);
                const bFab = b.items.map(i => priorityMap.get(i.fabricationState) ?? Infinity);
                comparison = Math.min(...aFab) - Math.min(...bFab);
              } else {
                // Si no hay priorityMap, comparar por nombre del estado
                const aFab = a.items[0]?.fabricationState || '';
                const bFab = b.items[0]?.fabricationState || '';
                comparison = aFab.localeCompare(bFab);
              }
              break;
            case 'venta':
              const aSale = a.items[0]?.saleState || a.saleStateOrder || '';
              const bSale = b.items[0]?.saleState || b.saleStateOrder || '';
              comparison = aSale.localeCompare(bSale);
              break;
            case 'envio':
              const aShip = a.items[0]?.shippingState || '';
              const bShip = b.items[0]?.shippingState || '';
              comparison = aShip.localeCompare(bShip);
              break;
            case 'valor':
              comparison = (a.totalValue || 0) - (b.totalValue || 0);
              break;
            case 'restante':
              const aRest = a.items.reduce((sum, item) => sum + ((item.itemValue || 0) - (item.depositValueItem || 0)), 0);
              const bRest = b.items.reduce((sum, item) => sum + ((item.itemValue || 0) - (item.depositValueItem || 0)), 0);
              comparison = aRest - bRest;
              break;
          }
          
          if (comparison !== 0) {
            return criteria.dir === 'asc' ? comparison : -comparison;
          }
        }
        return 0;
      });
    }

    return result;
  }, [orders, searchQuery, filters, sort]);

  const handleUpdate = async (orderId: string, patch: Partial<Order>) => {
    if (!onUpdate) {
      toast({ title: 'Error', description: 'Función de actualización no disponible', variant: 'destructive' });
      return;
    }
    
    try {
      await onUpdate(orderId, patch);
      toast({ title: 'Pedido actualizado', description: 'Los cambios se guardaron correctamente' });
    } catch (error) {
      console.error('Error updating order:', error);
      toast({ 
        title: 'Error al actualizar', 
        description: error instanceof Error ? error.message : 'No se pudo guardar los cambios',
        variant: 'destructive' 
      });
    }
  };

  const handleDelete = async (orderId: string) => {
    if (!onDelete) {
      toast({ title: 'Error', description: 'Función de eliminación no disponible', variant: 'destructive' });
      return;
    }
    
    try {
      await onDelete(orderId);
      toast({ title: 'Pedido eliminado', description: 'El pedido se eliminó correctamente' });
    } catch (error) {
      console.error('Error deleting order:', error);
      toast({ 
        title: 'Error al eliminar', 
        description: error instanceof Error ? error.message : 'No se pudo eliminar el pedido',
        variant: 'destructive' 
      });
    }
  };

  const handleTipoChange = async (orderId: string, newTipo: StampType, itemId?: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    // Si se especifica un itemId, solo actualizar ese item
    if (itemId) {
      const item = order.items.find(i => i.id === itemId);
      if (item) {
        await handleUpdate(orderId, { items: [{ id: itemId, stampType: newTipo }] as any });
      }
    } else {
      // Si no se especifica itemId, actualizar todos los items (comportamiento anterior)
      const updatedItems = order.items.map(item => ({ id: item.id, stampType: newTipo }));
      await handleUpdate(orderId, { items: updatedItems as any });
    }
  };

  const handleFabricacionChange = async (orderId: string, newState: FabricationState, itemId?: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    // Si se especifica un itemId, solo actualizar ese item específico
    if (itemId) {
      const item = order.items.find(i => i.id === itemId);
      if (item) {
        // Solo actualizar el sello específico, no todos los sellos
        await handleUpdate(orderId, { items: [{ id: itemId, fabricationState: newState }] as any });
      }
    } else {
      // Si no se especifica itemId (cambio desde la fila resumen), actualizar todos los items
      const updatedItems = order.items.map(item => ({ id: item.id, fabricationState: newState }));
      await handleUpdate(orderId, { items: updatedItems as any });
    }
  };

  const handleVentaChange = async (orderId: string, newState: SaleState, itemId?: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    // Reproducir sonido satisfactorio cuando se marca como "Transferido"
    if (newState === 'TRANSFERIDO') {
      playSound('transfer');
    }
    
    // Si se especifica un itemId, solo actualizar ese item
    if (itemId) {
      const item = order.items.find(i => i.id === itemId);
      if (item) {
        await handleUpdate(orderId, { items: [{ id: itemId, saleState: newState }] as any });
      }
    } else {
      // Si no se especifica itemId, actualizar TODOS los sellos del pedido
      const updatedItems = order.items.map(item => ({ id: item.id, saleState: newState }));
      await handleUpdate(orderId, { items: updatedItems as any });
    }
  };

  const handleEnvioEstadoChange = async (orderId: string, newState: ShippingState, itemId?: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    // Si se especifica un itemId, solo actualizar ese item
    if (itemId) {
      const item = order.items.find(i => i.id === itemId);
      if (item) {
        await handleUpdate(orderId, { items: [{ id: itemId, shippingState: newState }] as any });
      }
    } else {
      // Si no se especifica itemId, actualizar todos los items (comportamiento anterior)
      const updatedItems = order.items.map(item => ({ id: item.id, shippingState: newState }));
      await handleUpdate(orderId, { items: updatedItems as any });
    }
  };
  const handleDateChange = async (orderId: string, newDate: Date) => {
    await handleUpdate(orderId, { orderDate: newDate.toISOString() });
  };

  const handleDeadlineChange = async (orderId: string, deadline: Date | null) => {
    try {
      await handleUpdate(orderId, { 
        deadlineAt: deadline ? deadline.toISOString() : null
      });
      toast({ title: 'Fecha límite actualizada', description: deadline ? `Fecha límite establecida para el pedido` : 'Fecha límite eliminada' });
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo actualizar la fecha límite', variant: 'destructive' });
    }
  };

  const handleTaskCreate = async (orderId: string, title: string, description?: string, dueDate?: Date) => {
    try {
      const { createTask } = await import('@/lib/supabase/services/orders.service');
      await createTask(orderId, title, description, dueDate);
      
      // Refrescar la orden para obtener las tareas actualizadas
      if (onUpdate) {
        await onUpdate(orderId, {});
      }
      
      const dueDateText = dueDate ? ` con fecha límite ${dueDate.toLocaleDateString('es-ES')}` : '';
      toast({ title: 'Tarea creada', description: `"${title}" agregada al pedido${dueDateText}` });
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo crear la tarea', variant: 'destructive' });
    }
  };

  const handleTaskUpdate = async (taskId: string, updates: any) => {
    try {
      const { updateTask } = await import('@/lib/supabase/services/orders.service');
      await updateTask(taskId, updates);
      
      // Encontrar la orden que contiene esta tarea y refrescarla
      const orderWithTask = orders.find(order => order.tasks?.some(task => task.id === taskId));
      if (orderWithTask && onUpdate) {
        await onUpdate(orderWithTask.id, {});
      }
      
      toast({ title: 'Tarea actualizada', description: 'Tarea modificada correctamente' });
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo actualizar la tarea', variant: 'destructive' });
    }
  };

  const handleTaskDelete = async (taskId: string) => {
    try {
      const { deleteTask } = await import('@/lib/supabase/services/orders.service');
      await deleteTask(taskId);
      
      // Encontrar la orden que contiene esta tarea y refrescarla
      const orderWithTask = orders.find(order => order.tasks?.some(task => task.id === taskId));
      if (orderWithTask && onUpdate) {
        await onUpdate(orderWithTask.id, {});
      }
      
      toast({ title: 'Tarea eliminada', description: 'Tarea removida correctamente' });
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo eliminar la tarea', variant: 'destructive' });
    }
  };

  const handleEnvioChange = async (orderId: string, newCarrier: any, newService?: any) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    await handleUpdate(orderId, { 
      shipping: { 
        ...order.shipping, 
        carrier: newCarrier,
        service: newService !== undefined ? newService : order.shipping.service
      } 
    });
  };


  const tableColumns = useMemo(() => {
    return createUnifiedColumns({
      onTipoChange: handleTipoChange,
      onFabricacionChange: handleFabricacionChange,
      onVentaChange: handleVentaChange,
      onEnvioEstadoChange: handleEnvioEstadoChange,
      onEnvioChange: handleEnvioChange,
      onDateChange: handleDateChange,
      onDeadlineChange: handleDeadlineChange,
      onTaskCreate: handleTaskCreate,
      onTaskUpdate: handleTaskUpdate,
      onTaskDelete: handleTaskDelete,
      editingRowId,
      onUpdate: handleUpdate,
      onExpand: toggleRow,
      isSubitem: false
    });
  }, [editingRowId, toggleRow, orders, onUpdate]);

  const subitemColumns = useMemo(() => {
    return createUnifiedColumns({
      onTipoChange: handleTipoChange,
      onFabricacionChange: handleFabricacionChange,
      onVentaChange: handleVentaChange,
      onEnvioEstadoChange: handleEnvioEstadoChange,
      onEnvioChange: handleEnvioChange,
      onDateChange: handleDateChange,
      onDeadlineChange: handleDeadlineChange,
      onTaskCreate: handleTaskCreate,
      onTaskUpdate: handleTaskUpdate,
      onTaskDelete: handleTaskDelete,
      editingRowId,
      onUpdate: handleUpdate,
      onExpand: toggleRow,
      isSubitem: true
    });
  }, [editingRowId, toggleRow, orders, onUpdate]);

  // Sistema unificado de columnas con redimensionamiento y reordenamiento
  const sortedColumns = useMemo(() => {
    return columns
      .sort((a, b) => a.order - b.order)
      .filter(col => !col.hidden) // Filtrar columnas ocultas
      .map(col => {
        const tableCol = tableColumns.find(tc => tc.id === col.id);
        return tableCol ? { ...tableCol, size: col.size } : null;
      })
      .filter((col): col is NonNullable<typeof col> => col !== null);
  }, [columns, tableColumns]);

  const sortedSubitemColumns = useMemo(() => {
    return columns
      .sort((a, b) => a.order - b.order)
      .filter(col => !col.hidden) // Filtrar columnas ocultas
      .map(col => {
        const tableCol = subitemColumns.find(tc => tc.id === col.id);
        return tableCol ? { ...tableCol, size: col.size } : null;
      })
      .filter((col): col is NonNullable<typeof col> => col !== null);
  }, [columns, subitemColumns]);

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
            {filteredOrders.map((order) => {
              const hasMultipleItems = order.items.length > 1;
              const isExpandedState = isExpanded(order.id);
              
              if (!hasMultipleItems) {
                // Si solo tiene un item, mostrar la fila normal
                return (
                  <ContextMenu key={order.id}>
                  <ContextMenuTrigger asChild>
                      <tr 
                        data-row 
                        onDoubleClick={() => handleRowDoubleClick(order.id)} 
                        className={`hover:bg-muted/50 transition-colors ${editingRowId === order.id ? 'ring-1 ring-primary/40' : ''}`}
                      >
                        {sortedColumns.map((column) => {
                          if (!column.id) return null;
                          const columnState = columns.find(col => col.id === column.id);
                          const align = (column.meta as any)?.align || 'left';
                          const isContacto = column.id === 'contacto';
                          const isRestante = column.id === 'restante';
                          const isStateColumn = ['fabricacion', 'venta', 'envioEstado'].includes(column.id);
                          const isTextColumn = ['cliente', 'contacto'].includes(column.id);
                          const isDisenioColumn = column.id === 'disenio';
                          const paddingClass = isStateColumn ? 'px-0' : 'px-2';
                          const textOverflowClass = isTextColumn ? 'overflow-hidden' : isDisenioColumn ? 'overflow-hidden' : 'overflow-hidden text-ellipsis whitespace-nowrap';
                          
                          // Crear un objeto row mock para compatibilidad con las celdas existentes
                          const mockRow = {
                            original: order, // Pasar el pedido completo con todos los items
                            id: `${order.id}-${order.items[0].id}`,
                            getVisibleCells: () => [],
                            cell: {} as any,
                            column: {} as any,
                            getValue: () => null,
                            renderValue: () => null,
                            table: {} as any,
                          } as any;
                        
                        return (
                            <td 
                              key={`${order.id}-${order.items[0].id}-${column.id}`} 
                              className={`${paddingClass} py-2 h-14 align-middle ${textOverflowClass} text-sm relative ${isContacto ? 'border-r border-border/30' : ''} ${isRestante ? 'border-r border-border/30' : ''} ${align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'}`} 
                              style={{ width: `${columnState?.size || 100}px` }}
                            >
                              {typeof column.cell === 'function' 
                                ? column.cell({ row: mockRow } as any) 
                                : column.cell ? React.createElement(column.cell as any, { row: mockRow } as any) : null}
                          </td>
                        );
                      })}
                    </tr>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                      <ContextMenuItem onSelect={() => setEditingRow(order.id)}>Editar pedido</ContextMenuItem>
                      {onAddStamp && (
                        <ContextMenuItem onSelect={() => {
                          setSelectedOrderForStamp(order);
                          setAddStampDialogOpen(true);
                        }}>
                          Agregar sello
                        </ContextMenuItem>
                      )}
                    <ContextMenuSeparator />
                      <ContextMenuItem className="text-red-500" onSelect={() => handleDelete(order.id)}>Eliminar pedido</ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
                );
              }
              
              // Si tiene múltiples items, mostrar fila expandible
              return (
                <React.Fragment key={order.id}>
                  {/* Fila resumen con animación mejorada */}
                  <tr className={`border-b hover:bg-gradient-to-r hover:from-primary/5 hover:to-primary/10 transition-all duration-200 ease-out cursor-pointer group ${isExpandedState ? 'summary-row-expanded' : ''} ${isCollapsing(order.id) ? 'summary-row-collapsing' : ''} ${isExpanding(order.id) ? 'summary-row-expanding' : ''}`}>
                    {sortedColumns.map((column) => {
                      if (!column.id) return null;
                      const columnState = columns.find(col => col.id === column.id);
                      const align = (column.meta as any)?.align || 'left';
                      const isContacto = column.id === 'contacto';
                      const isRestante = column.id === 'restante';
                      const isStateColumn = ['fabricacion', 'venta', 'envioEstado'].includes(column.id);
                      const isTextColumn = ['cliente', 'contacto'].includes(column.id);
                      const isDisenioColumn = column.id === 'disenio';
                      const paddingClass = isStateColumn ? 'px-0' : 'px-2';
                      const textOverflowClass = isTextColumn ? 'overflow-hidden' : isDisenioColumn ? 'overflow-hidden' : 'overflow-hidden text-ellipsis whitespace-nowrap';
                      
                      // Para la fila resumen, usar el pedido completo sin modificar
                      // Las celdas individuales se encargan de calcular los totales correctamente
                      const mockRow = {
                        original: order, // Usar el pedido completo
                        id: `${order.id}-summary`,
                        getVisibleCells: () => [],
                        cell: {} as any,
                        column: {} as any,
                        getValue: () => null,
                        renderValue: () => null,
                        table: {} as any,
                      } as any;
                      
                      return (
                        <td 
                          key={`${order.id}-summary-${column.id}`} 
                          className={`${paddingClass} py-3 h-12 align-middle ${textOverflowClass} text-sm relative ${isContacto ? 'border-r border-border/30' : ''} ${isRestante ? 'border-r border-border/30' : ''} ${align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'}`} 
                          style={{ width: `${columnState?.size || 100}px` }}
                        >
                          {/* Usar el mismo componente de celda que las filas individuales */}
                          {typeof column.cell === 'function' 
                            ? column.cell({ row: mockRow } as any) 
                            : column.cell ? React.createElement(column.cell as any, { row: mockRow } as any) : null}
                        </td>
                      );
                    })}
                  </tr>
                  
                  {/* Filas expandidas */}
                  {isExpandedState && order.items.map((item, index) => (
                    <ContextMenu key={`${order.id}-${item.id}`}>
                      <ContextMenuTrigger asChild>
                         <tr 
                           data-row 
                           onDoubleClick={() => handleRowDoubleClick(order.id)} 
                           className={`hover:bg-muted/30 transition-all duration-300 ease-in-out bg-gradient-to-r from-muted/10 to-muted/5 shadow-sm animate-in slide-in-from-top-2 fade-in relative ${editingRowId === order.id ? 'ring-1 ring-primary/40' : ''} ${isCollapsing(order.id) ? 'expandable-item-exit' : 'expandable-item-enter'}`}
                           style={{
                             animationDelay: `${index * 100}ms`,
                             marginBottom: index < order.items.length - 1 ? '2px' : '0px',
                             borderLeft: '2px solid #d1d5db',
                           }}
                         >
                          {sortedSubitemColumns.map((column) => {
                            if (!column.id) return null;
                            
                            // Columnas que deben estar vacías en las filas expandidas
                            const columnsToHideInExpandedView = ['fecha', 'cliente', 'contacto', 'envio', 'envioEstado', 'seguimiento'];
                            const shouldHideColumn = columnsToHideInExpandedView.includes(column.id);
                            const columnState = columns.find(col => col.id === column.id);
                            const align = (column.meta as any)?.align || 'left';
                            const isContacto = column.id === 'contacto';
                            const isRestante = column.id === 'restante';
                            const isStateColumn = ['fabricacion', 'venta', 'envioEstado'].includes(column.id);
                            const isTextColumn = ['cliente', 'contacto'].includes(column.id);
                            const isDisenioColumn = column.id === 'disenio';
                            const paddingClass = isStateColumn ? 'px-0' : 'px-2';
                            const textOverflowClass = isTextColumn ? 'overflow-hidden' : isDisenioColumn ? 'overflow-hidden' : 'overflow-hidden text-ellipsis whitespace-nowrap';
                            
                            // Crear un objeto row mock para compatibilidad con las celdas existentes
                            const mockRow = {
                              original: { ...order, items: [item] }, // Solo el item actual para filas expandidas
                              id: `${order.id}-${item.id}`,
                              getVisibleCells: () => [],
                              cell: {} as any,
                              column: {} as any,
                              getValue: () => null,
                              renderValue: () => null,
                              table: {} as any,
                            } as any;
                            
                            return (
                              <td 
                                key={`${order.id}-${item.id}-${column.id}`} 
                                className={`${paddingClass} py-2 h-14 align-middle ${textOverflowClass} text-sm relative ${isContacto ? 'border-r border-border/30' : ''} ${isRestante ? 'border-r border-border/30' : ''} ${align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'}`} 
                                style={{ width: `${columnState?.size || 100}px` }}
                              >
                                {shouldHideColumn ? (
                                  // Mostrar celda vacía para columnas ocultas en filas expandidas
                                  <span className="text-muted-foreground/60 text-xs">—</span>
                                ) : (
                                  // Mostrar contenido normal para otras columnas
                                  typeof column.cell === 'function' 
                                    ? column.cell({ row: mockRow } as any) 
                                    : column.cell ? React.createElement(column.cell as any, { row: mockRow } as any) : null
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem onSelect={() => setEditingRow(order.id)}>Editar pedido</ContextMenuItem>
                        {onAddStamp && (
                          <ContextMenuItem onSelect={() => {
                            setSelectedOrderForStamp(order);
                            setAddStampDialogOpen(true);
                          }}>
                            Agregar sello
                          </ContextMenuItem>
                        )}
                        {onDeleteStamp && order.items.length > 1 && (
                          <>
                            <ContextMenuSeparator />
                            <ContextMenuItem 
                              className="text-red-500" 
                              onSelect={async () => {
                                if (item.id && onDeleteStamp) {
                                  try {
                                    await onDeleteStamp(item.id);
                                    toast({ title: 'Sello eliminado', description: `Sello "${item.designName}" eliminado del pedido` });
                                  } catch (error) {
                                    toast({ title: 'Error', description: 'No se pudo eliminar el sello', variant: 'destructive' });
                                  }
                                }
                              }}
                            >
                              Eliminar sello
                            </ContextMenuItem>
                          </>
                        )}
                        <ContextMenuSeparator />
                        <ContextMenuItem className="text-red-500" onSelect={() => handleDelete(order.id)}>Eliminar pedido</ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      </DndTableContainer>
      
      {/* Diálogo para agregar sello */}
      {selectedOrderForStamp && onAddStamp && (
        <AddStampDialog
          open={addStampDialogOpen}
          onOpenChange={setAddStampDialogOpen}
          order={selectedOrderForStamp}
          onAddStamp={async (orderId, item, files) => {
            await onAddStamp(orderId, item, files);
            setAddStampDialogOpen(false);
            setSelectedOrderForStamp(null);
          }}
        />
      )}
    </div>
  );
}
