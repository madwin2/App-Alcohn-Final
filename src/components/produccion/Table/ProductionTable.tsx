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
import { ProductionItem, ProductionState, VectorizationState, ProgramType, StampType } from '@/lib/types/index';
import { createProductionColumns } from './columns';
import { useProductionStore } from '@/lib/state/production.store';
import { useToast } from '@/components/ui/use-toast';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu';
import { DndTableContainer } from './DndTableContainer';
import { ResizableHeader } from './ResizableHeader';

interface ProductionTableProps {
  items: ProductionItem[];
}

export function ProductionTable({ items }: ProductionTableProps) {
  const { 
    searchQuery, 
    setEditingRow, 
    editingRowId, 
    columns, 
    setColumnSize, 
    reorderColumns,
    filters,
    showPreviews
  } = useProductionStore();
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

  const filteredItems = useMemo(() => {
    if (!searchQuery) return items;
    const searchLower = searchQuery.toLowerCase();
    return items.filter(item =>
      item.designName.toLowerCase().includes(searchLower) ||
      item.notes?.toLowerCase().includes(searchLower)
    );
  }, [items, searchQuery]);

  const onUpdate = (itemId: string, _patch: any) => {
    toast({ title: 'Item actualizado', description: `Se guardaron cambios en ${itemId}` });
  };

  const handleDelete = (itemId: string) => {
    toast({ title: 'Item eliminado', description: `Se eliminó el item ${itemId}` });
  };

  const handleTipoChange = (itemId: string, newTipo: StampType) => {
    toast({ title: 'Tipo actualizado', description: `Tipo cambiado a ${newTipo} para ${itemId}` });
  };
  const handleFabricacionChange = (itemId: string, newState: ProductionState) => {
    toast({ title: 'Fabricación', description: `Estado cambiado a ${newState} para ${itemId}` });
  };
  const handleVectorizadoChange = (itemId: string, newState: VectorizationState) => {
    toast({ title: 'Vectorizado', description: `Estado cambiado a ${newState} para ${itemId}` });
  };

  const handleDownloadBase = (item: ProductionItem) => {
    if (item.files?.baseUrl) {
      // Crear un enlace temporal para descargar el archivo
      const link = document.createElement('a');
      link.href = item.files.baseUrl;
      link.download = `${item.designName}_archivo_base`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: 'Descarga iniciada', description: 'Archivo base descargándose...' });
    }
  };

  const handleDownloadVector = (item: ProductionItem) => {
    if (item.files?.vectorUrl) {
      // Crear un enlace temporal para descargar el archivo
      const link = document.createElement('a');
      link.href = item.files.vectorUrl;
      link.download = `${item.designName}_vector`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: 'Descarga iniciada', description: 'Vector descargándose...' });
    }
  };
  const handleProgramaChange = (itemId: string, newProgram: ProgramType) => {
    toast({ title: 'Programa', description: `Programa cambiado a ${newProgram} para ${itemId}` });
  };
  const handleDateChange = (_itemId: string, newDate: Date) => {
    toast({ title: 'Fecha actualizada', description: `${newDate.toLocaleDateString('es-ES')}` });
  };

  const handleTaskCreate = (itemId: string, title: string, _description?: string, dueDate?: Date) => {
    const dueDateText = dueDate ? ` con fecha límite ${dueDate.toLocaleDateString('es-ES')}` : '';
    toast({ title: 'Tarea creada', description: `"${title}" agregada al item ${itemId}${dueDateText}` });
  };

  const handleTaskUpdate = (taskId: string, _updates: any) => {
    toast({ title: 'Tarea actualizada', description: `Tarea ${taskId} modificada` });
  };

  const handleTaskDelete = (taskId: string) => {
    toast({ title: 'Tarea eliminada', description: `Tarea ${taskId} removida` });
  };

  const tableColumns = useMemo(() => {
    return createProductionColumns({
      onTipoChange: handleTipoChange,
      onFabricacionChange: handleFabricacionChange,
      onVectorizadoChange: handleVectorizadoChange,
      onProgramaChange: handleProgramaChange,
      onDateChange: handleDateChange,
      onTaskCreate: handleTaskCreate,
      onTaskUpdate: handleTaskUpdate,
      onTaskDelete: handleTaskDelete,
      editingRowId,
      onUpdate,
    });
  }, [editingRowId]);

  // Sistema unificado de columnas con redimensionamiento y reordenamiento
  const sortedColumns = useMemo(() => {
    return columns
      .sort((a, b) => a.order - b.order)
      .filter(col => {
        // Si las previsualizaciones están ocultas, excluir las columnas de archivo base y vector
        if (!showPreviews && (col.id === 'archivoBase' || col.id === 'vector')) {
          return false;
        }
        return true;
      })
      .map(col => {
        const tableCol = tableColumns.find(tc => tc.id === col.id);
        return tableCol ? { ...tableCol, size: col.size } : null;
      })
      .filter((col): col is NonNullable<typeof col> => col !== null);
  }, [columns, tableColumns, showPreviews]);

  const columnIds = useMemo(() => {
    return columns
      .sort((a, b) => a.order - b.order)
      .filter(col => {
        // Si las previsualizaciones están ocultas, excluir las columnas de archivo base y vector
        if (!showPreviews && (col.id === 'archivoBase' || col.id === 'vector')) {
          return false;
        }
        return true;
      })
      .map(col => col.id);
  }, [columns, showPreviews]);

  const table = useReactTable({
    data: filteredItems,
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

  const handleRowDoubleClick = (itemId: string) => setEditingRow(itemId);

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
                    const isStateColumn = ['fabricacion', 'vectorizado', 'programa'].includes(header.id);
                    const paddingClass = isStateColumn ? 'px-0' : 'px-2';
                    
                    return (
                      <ResizableHeader
                        key={header.id}
                        id={header.column.id}
                        header=""
                        size={columnState?.size || 100}
                        onResize={setColumnSize}
                        className={`${paddingClass} py-4 text-xs font-medium text-muted-foreground uppercase tracking-wider relative ${align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'}`}
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
                        const isStateColumn = ['fabricacion', 'vectorizado', 'programa'].includes(cell.column.id);
                        const paddingClass = isStateColumn ? 'px-0' : 'px-2';
                        
                        return (
                          <td key={cell.id} className={`${paddingClass} ${showPreviews ? 'py-3 h-12' : 'py-0 h-3'} align-middle whitespace-nowrap overflow-hidden text-ellipsis ${showPreviews ? 'text-sm' : 'text-base'} relative ${align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'}`} style={{ width: `${columnState?.size || 100}px` }}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      })}
                    </tr>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onSelect={() => setEditingRow(row.original.id)}>Editar item</ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem 
                      onSelect={() => handleDownloadBase(row.original)}
                      disabled={!row.original.files?.baseUrl}
                      className={!row.original.files?.baseUrl ? 'text-muted-foreground' : ''}
                    >
                      Descargar archivo base
                    </ContextMenuItem>
                    <ContextMenuItem 
                      onSelect={() => handleDownloadVector(row.original)}
                      disabled={!row.original.files?.vectorUrl}
                      className={!row.original.files?.vectorUrl ? 'text-muted-foreground' : ''}
                    >
                      Descargar vector
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem className="text-red-500" onSelect={() => handleDelete(row.original.id)}>Eliminar item</ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="h-24 text-center text-muted-foreground">No se encontraron items de producción.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </DndTableContainer>
    </div>
  );
}
