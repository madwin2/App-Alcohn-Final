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
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu';
import { DndTableContainer } from './DndTableContainer';
import { ResizableHeader } from './ResizableHeader';
import { useExpandableRows } from './useExpandableRows';
import { OrderSummaryRow } from './OrderSummaryRow';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { CellSummary } from './cells/CellSummary';

interface OrdersTableProps {
  orders: Order[];
}

export function OrdersTable({ orders }: OrdersTableProps) {
  // Debug: verificar qué datos están llegando
  console.log('OrdersTable - Total orders:', orders.length);
  console.log('OrdersTable - Order 9:', orders.find(o => o.id === '9'));
  
  const { 
    searchQuery, 
    setEditingRow, 
    editingRowId, 
    columns, 
    setColumnSize, 
    reorderColumns
  } = useOrdersStore();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState[]>([] as any);
  const { toast } = useToast();
  const { toggleRow, isExpanded } = useExpandableRows();

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

  const handleEnvioChange = (orderId: string, newCarrier: any) => {
    toast({ title: 'Envío', description: `Carrier cambiado a ${newCarrier} para ${orderId}` });
  };

  const handleProgressChange = (orderId: string, newStep: any) => {
    toast({ title: 'Progreso', description: `Estado cambiado a ${newStep} para ${orderId}` });
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
      onUpdate,
      onExpand: toggleRow
    });
  }, [editingRowId, toggleRow]);

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
                        {tableColumns.map((column) => {
                          if (!column.id) return null;
                          const columnState = columns.find(col => col.id === column.id);
                          const align = (column.meta as any)?.align || 'left';
                          const isContacto = column.id === 'contacto';
                          const isRestante = column.id === 'restante';
                          const isStateColumn = ['fabricacion', 'venta', 'envioEstado'].includes(column.id);
                        const paddingClass = isStateColumn ? 'px-0' : 'px-2';
                          
                          // Crear un objeto row mock para compatibilidad con las celdas existentes
                          const mockRow = {
                            original: order, // Pasar el pedido completo con todos los items
                            id: `${order.id}-${order.items[0].id}`,
                            getVisibleCells: () => []
                          } as any;
                        
                        return (
                            <td 
                              key={`${order.id}-${order.items[0].id}-${column.id}`} 
                              className={`${paddingClass} py-3 h-12 align-middle whitespace-nowrap overflow-hidden text-ellipsis text-sm relative ${isContacto ? 'border-r border-border/30' : ''} ${isRestante ? 'border-r border-border/30' : ''} ${align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'}`} 
                              style={{ width: `${columnState?.size || 100}px` }}
                            >
                              {typeof column.cell === 'function' 
                                ? column.cell({ row: mockRow }) 
                                : column.cell ? React.createElement(column.cell as any, { row: mockRow }) : null}
                          </td>
                        );
                      })}
                    </tr>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                      <ContextMenuItem onSelect={() => setEditingRow(order.id)}>Editar pedido</ContextMenuItem>
                    <ContextMenuSeparator />
                      <ContextMenuItem className="text-red-500" onSelect={() => handleDelete(order.id)}>Eliminar pedido</ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
                );
              }
              
              // Si tiene múltiples items, mostrar fila expandible
              return (
                <React.Fragment key={order.id}>
                  {/* Fila resumen */}
                  <tr className="border-b hover:bg-gradient-to-r hover:from-primary/5 hover:to-primary/10 transition-all duration-300 ease-in-out cursor-pointer group">
                    {tableColumns.map((column, index) => {
                      if (!column.id) return null;
                      const columnState = columns.find(col => col.id === column.id);
                      const align = (column.meta as any)?.align || 'left';
                      const isContacto = column.id === 'contacto';
                      const isRestante = column.id === 'restante';
                      const isStateColumn = ['fabricacion', 'venta', 'envioEstado'].includes(column.id);
                      const paddingClass = isStateColumn ? 'px-0' : 'px-2';
                      
                      // Crear un objeto row mock que contenga datos resumidos para cada columna
                      // IMPORTANTE: Mantener el array de items completo para que CellDisenio pueda detectar múltiples items
                      const summaryOrder = {
                        ...order,
                        items: order.items.map((item, idx) => idx === 0 ? {
                          ...item, // Usar el primer item como base
                          // No modificar designName aquí, CellDisenio se encarga de eso
                          itemValue: order.items.reduce((sum, item) => sum + (item.itemValue || 0), 0),
                          depositValueItem: order.items.reduce((sum, item) => sum + (item.depositValueItem || 0), 0),
                          restPaidAmountItem: order.items.reduce((sum, item) => sum + (item.restPaidAmountItem || 0), 0),
                          // Determinar el estado más representativo para cada tipo
                          fabricationState: (() => {
                            const states = [...new Set(order.items.map(item => item.fabricationState))];
                            if (states.length === 1) return states[0];
                            // Si hay múltiples estados, usar el más avanzado o el más común
                            const priorityOrder = ['HECHO', 'VERIFICAR', 'HACIENDO', 'RETOCAR', 'REHACER', 'SIN_HACER'];
                            return priorityOrder.find(state => states.includes(state)) || states[0];
                          })(),
                          saleState: (() => {
                            const states = [...new Set(order.items.map(item => item.saleState))];
                            if (states.length === 1) return states[0];
                            // Si hay múltiples estados, usar el más avanzado
                            const priorityOrder = ['TRANSFERIDO', 'FOTO_ENVIADA', 'SEÑADO', 'DEUDOR'];
                            return priorityOrder.find(state => states.includes(state)) || states[0];
                          })(),
                          shippingState: (() => {
                            const states = [...new Set(order.items.map(item => item.shippingState))];
                            if (states.length === 1) return states[0];
                            // Si hay múltiples estados, usar el más avanzado
                            const priorityOrder = ['SEGUIMIENTO_ENVIADO', 'DESPACHADO', 'ETIQUETA_LISTA', 'HACER_ETIQUETA', 'SIN_ENVIO'];
                            return priorityOrder.find(state => states.includes(state)) || states[0];
                          })(),
                          // Para la fila resumen, no usar isPriority para evitar efectos visuales incorrectos
                          isPriority: false,
                          files: {
                            baseUrl: order.items.filter(item => item.files?.baseUrl).length > 0 ? 'summary' : undefined,
                            vectorUrl: order.items.filter(item => item.files?.vectorUrl).length > 0 ? 'summary' : undefined,
                            photoUrl: order.items.filter(item => item.files?.photoUrl).length > 0 ? 'summary' : undefined
                          }
                        } : item) // Mantener los demás items sin modificar
                      };
                      
                      const mockRow = {
                        original: summaryOrder,
                        id: `${order.id}-summary`,
                        getVisibleCells: () => []
                      } as any;
                      
                      return (
                        <td 
                          key={`${order.id}-summary-${column.id}`} 
                          className={`${paddingClass} py-3 h-12 align-middle whitespace-nowrap overflow-hidden text-ellipsis text-sm relative ${isContacto ? 'border-r border-border/30' : ''} ${isRestante ? 'border-r border-border/30' : ''} ${align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'}`} 
                          style={{ width: `${columnState?.size || 100}px` }}
                        >
                          {/* Usar el mismo componente de celda que las filas individuales */}
                          {typeof column.cell === 'function' 
                            ? column.cell({ row: mockRow }) 
                            : column.cell ? React.createElement(column.cell as any, { row: mockRow }) : null}
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
                           className={`hover:bg-muted/30 transition-all duration-300 ease-in-out bg-gradient-to-r from-muted/10 to-muted/5 shadow-sm animate-in slide-in-from-top-2 fade-in relative ${editingRowId === order.id ? 'ring-1 ring-primary/40' : ''}`}
                           style={{
                             animationDelay: `${index * 100}ms`,
                             marginBottom: index < order.items.length - 1 ? '2px' : '0px',
                             borderLeft: '2px solid #d1d5db',
                           }}
                         >
                          {tableColumns.map((column) => {
                            if (!column.id) return null;
                            
                            // Columnas que deben estar vacías en las filas expandidas
                            const columnsToHideInExpandedView = ['fecha', 'cliente', 'contacto', 'envio', 'seguimiento'];
                            const shouldHideColumn = columnsToHideInExpandedView.includes(column.id);
                            const columnState = columns.find(col => col.id === column.id);
                            const align = (column.meta as any)?.align || 'left';
                            const isContacto = column.id === 'contacto';
                            const isRestante = column.id === 'restante';
                            const isStateColumn = ['fabricacion', 'venta', 'envioEstado'].includes(column.id);
                            const paddingClass = isStateColumn ? 'px-0' : 'px-2';
                            
                            // Crear un objeto row mock para compatibilidad con las celdas existentes
                            const mockRow = {
                              original: { ...order, items: [item] }, // Solo el item actual para filas expandidas
                              id: `${order.id}-${item.id}`,
                              getVisibleCells: () => []
                            } as any;
                            
                            return (
                              <td 
                                key={`${order.id}-${item.id}-${column.id}`} 
                                className={`${paddingClass} py-3 h-12 align-middle whitespace-nowrap overflow-hidden text-ellipsis text-sm relative ${isContacto ? 'border-r border-border/30' : ''} ${isRestante ? 'border-r border-border/30' : ''} ${align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'}`} 
                                style={{ width: `${columnState?.size || 100}px` }}
                              >
                                {shouldHideColumn ? (
                                  // Mostrar celda vacía para columnas ocultas en filas expandidas
                                  <span className="text-muted-foreground/60 text-xs">—</span>
                                ) : (
                                  // Mostrar contenido normal para otras columnas
                                  typeof column.cell === 'function' 
                                    ? column.cell({ row: mockRow }) 
                                    : column.cell ? React.createElement(column.cell as any, { row: mockRow }) : null
                                )}
                              </td>
                            );
                          })}
              </tr>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem onSelect={() => setEditingRow(order.id)}>Editar pedido</ContextMenuItem>
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
    </div>
  );
}
