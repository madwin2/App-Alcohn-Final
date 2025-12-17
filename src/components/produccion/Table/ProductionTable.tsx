import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  SortingState,
  ColumnFiltersState,
  getFilteredRowModel,
} from '@tanstack/react-table';
import { ProductionItem, ProductionState, VectorizationState, ProgramType, StampType, ProductionFabricacionAspireKey } from '@/lib/types/index';
import { createProductionColumns } from './columns';
import { useProductionStore } from '@/lib/state/production.store';
import { useToast } from '@/components/ui/use-toast';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu';
import { useProduction } from '@/lib/hooks/useProduction';
import { DndTableContainer } from './DndTableContainer';
import { ResizableHeader } from './ResizableHeader';
import { Checkbox } from '@/components/ui/checkbox';
import { createTask, updateTask, deleteTask } from '@/lib/supabase/services/orders.service';

interface ProductionTableProps {
  items: ProductionItem[];
  onUpdateItem?: (itemId: string, updates: Partial<ProductionItem>) => Promise<ProductionItem>;
  onRefreshItems?: () => Promise<void>;
}

export function ProductionTable({ items, onUpdateItem, onRefreshItems }: ProductionTableProps) {
  const { updateItem: defaultUpdateItem, fetchItems: defaultFetchItems } = useProduction();
  const updateItem = onUpdateItem || defaultUpdateItem;
  const fetchItems = onRefreshItems || defaultFetchItems;
  const { 
    searchQuery, 
    setEditingRow, 
    editingRowId, 
    columns, 
    setColumnSize, 
    reorderColumns,
    filters,
    sort,
    showPreviews
  } = useProductionStore();
  
  // Debug: verificar el estado
  useEffect(() => {
    console.log('ProductionTable - showPreviews cambió a:', showPreviews);
    console.log('ProductionTable - columns state:', columns.filter(c => c.id === 'archivoBase' || c.id === 'vector'));
  }, [showPreviews, columns]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState[]>([] as any);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
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
    let result = items;

    // Aplicar búsqueda por texto
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      result = result.filter(item =>
        item.designName.toLowerCase().includes(searchLower) ||
        item.notes?.toLowerCase().includes(searchLower)
      );
    }

    // Aplicar filtros del store
    // Nota: Por ahora no filtramos por fecha ya que ProductionItem no tiene campo date
    // Si se necesita, habría que agregarlo al mapeo desde la BD
    // if (filters.dateRange?.from || filters.dateRange?.to) {
    //   result = result.filter(item => {
    //     const itemDate = item.date ? new Date(item.date) : null;
    //     if (!itemDate) return false;
    //     
    //     if (filters.dateRange?.from) {
    //       const fromDate = new Date(filters.dateRange.from);
    //       fromDate.setHours(0, 0, 0, 0);
    //       if (itemDate < fromDate) return false;
    //     }
    //     if (filters.dateRange?.to) {
    //       const toDate = new Date(filters.dateRange.to);
    //       toDate.setHours(23, 59, 59, 999);
    //       if (itemDate > toDate) return false;
    //     }
    //     return true;
    //   });
    // }

    if (filters.production && filters.production.length > 0) {
      result = result.filter(item =>
        filters.production!.includes(item.productionState)
      );
    }

    if (filters.vectorization && filters.vectorization.length > 0) {
      result = result.filter(item =>
        filters.vectorization!.includes(item.vectorizationState)
      );
    }

    if (filters.program && filters.program.length > 0) {
      result = result.filter(item =>
        item.program && filters.program!.includes(item.program as any)
      );
    }

    // Mapeo de ProductionState a FabricationState para ordenamiento
    const productionToFabricationMap: Record<string, string> = {
      'PENDIENTE': 'SIN_HACER',
      'EN_PROGRESO': 'HACIENDO',
      'COMPLETADO': 'HECHO',
      'REVISAR': 'VERIFICAR',
      'REHACER': 'REHACER'
    };

    // Clave unificada: si hay Aspire, tiene prioridad y se ordena dentro de la misma columna
    const getFabricacionAspireKey = (item: ProductionItem): ProductionFabricacionAspireKey => {
      if (item.aspireState) {
        return `ASPIRE_${item.aspireState.replace(/\s+/g, '_')}` as ProductionFabricacionAspireKey;
      }
      return (productionToFabricationMap[item.productionState] || 'SIN_HACER') as ProductionFabricacionAspireKey;
    };

    // Crear mapa de prioridad de fabricación (si existe)
    const priorityMap = sort.productionPriority && sort.productionPriority.length > 0
      ? new Map(sort.productionPriority.map((state, index) => [state, index]))
      : null;

    // Aplicar ordenamiento (prioridad primero, luego criterios adicionales)
    result = [...result].sort((a, b) => {
      // Primero: Ordenamiento por prioridad de fabricación (si existe)
      if (priorityMap) {
        const aKey = getFabricacionAspireKey(a);
        const bKey = getFabricacionAspireKey(b);
        const aPriority = priorityMap.get(aKey as any) ?? Infinity;
        const bPriority = priorityMap.get(bKey as any) ?? Infinity;
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }
      }

      // Segundo: Aplicar criterios de ordenamiento adicionales
      if (sort.criteria && sort.criteria.length > 0) {
        for (const criteria of sort.criteria) {
          let comparison = 0;
          
          switch (criteria.field) {
            case 'fecha':
              // Por ahora, ordenar por ID ya que ProductionItem no tiene campo date
              // Si se necesita, habría que agregarlo al mapeo desde la BD
              comparison = a.id.localeCompare(b.id);
              break;
            case 'tarea':
              const aTask = a.tasks?.[0]?.title || '';
              const bTask = b.tasks?.[0]?.title || '';
              comparison = aTask.localeCompare(bTask);
              break;
            case 'tipo':
              comparison = (a.stampType || '').localeCompare(b.stampType || '');
              break;
            case 'disenio':
              comparison = (a.designName || '').localeCompare(b.designName || '');
              break;
            case 'medida':
              const aSize = (a.requestedWidthMm || 0) * (a.requestedHeightMm || 0);
              const bSize = (b.requestedWidthMm || 0) * (b.requestedHeightMm || 0);
              comparison = aSize - bSize;
              break;
            case 'fabricacion':
              // Usar el estado más prioritario si existe priorityMap
              if (priorityMap) {
                const aFab = priorityMap.get(getFabricacionAspireKey(a) as any) ?? Infinity;
                const bFab = priorityMap.get(getFabricacionAspireKey(b) as any) ?? Infinity;
                comparison = aFab - bFab;
              } else {
                comparison = (a.productionState || '').localeCompare(b.productionState || '');
              }
              break;
            case 'vectorizado':
              comparison = (a.vectorizationState || '').localeCompare(b.vectorizationState || '');
              break;
            case 'programa':
              comparison = (a.program || '').localeCompare(b.program || '');
              break;
            case 'aspire':
              const aAspire = (a.aspireState || '').toString();
              const bAspire = (b.aspireState || '').toString();
              comparison = aAspire.localeCompare(bAspire);
              break;
            case 'maquina':
              const aMaquina = (a.machine || '').toString();
              const bMaquina = (b.machine || '').toString();
              comparison = aMaquina.localeCompare(bMaquina);
              break;
          }
          
          if (comparison !== 0) {
            return criteria.dir === 'asc' ? comparison : -comparison;
          }
        }
      }

      // Si todo es igual, mantener orden original
      return 0;
    });

    return result;
  }, [items, searchQuery, filters, sort]);

  // Limpiar selección cuando cambian los items filtrados (para evitar selecciones de items que ya no están visibles)
  useEffect(() => {
    const filteredIds = new Set(filteredItems.map(item => item.id));
    const newSelected = new Set(Array.from(selectedRows).filter(id => filteredIds.has(id)));
    // Actualizar si hay diferencias
    const currentIds = Array.from(selectedRows).sort();
    const newIds = Array.from(newSelected).sort();
    if (currentIds.length !== newIds.length || 
        currentIds.some((id, i) => id !== newIds[i])) {
      setSelectedRows(newSelected);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredItems]);

  const onUpdate = (itemId: string, _patch: any) => {
    toast({ title: 'Item actualizado', description: `Se guardaron cambios en ${itemId}` });
  };

  const handleDelete = (itemId: string) => {
    toast({ title: 'Item eliminado', description: `Se eliminó el item ${itemId}` });
  };

  const handleTipoChange = (itemId: string, newTipo: StampType) => {
    toast({ title: 'Tipo actualizado', description: `Tipo cambiado a ${newTipo} para ${itemId}` });
  };
  const handleFabricacionChange = useCallback(async (itemId: string, newState: ProductionState) => {
    try {
      // Si hay filas seleccionadas, aplicar a todas las seleccionadas
      // Si no hay filas seleccionadas, aplicar solo a la fila clickeada
      const itemsToUpdate = selectedRows.size > 0
        ? Array.from(selectedRows)
        : [itemId];

      // Actualizar todas las filas seleccionadas
      await Promise.all(
        itemsToUpdate.map(id => updateItem(id, { productionState: newState }))
      );

      const count = itemsToUpdate.length;
      toast({ 
        title: 'Fabricación actualizada', 
        description: `Estado cambiado a ${newState} para ${count} item${count > 1 ? 's' : ''}` 
      });
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo actualizar el estado de fabricación', variant: 'destructive' });
    }
  }, [selectedRows, updateItem, toast]);
  const handleVectorizadoChange = useCallback(async (itemId: string, newState: VectorizationState) => {
    try {
      // Si hay filas seleccionadas, aplicar a todas las seleccionadas
      // Si no hay filas seleccionadas, aplicar solo a la fila clickeada
      const itemsToUpdate = selectedRows.size > 0
        ? Array.from(selectedRows)
        : [itemId];

      // Actualizar todas las filas seleccionadas
      await Promise.all(
        itemsToUpdate.map(id => updateItem(id, { vectorizationState: newState }))
      );

      const count = itemsToUpdate.length;
      toast({ 
        title: 'Vectorizado actualizado', 
        description: `Estado cambiado a ${newState} para ${count} item${count > 1 ? 's' : ''}` 
      });
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo actualizar el estado de vectorización', variant: 'destructive' });
    }
  }, [selectedRows, updateItem, toast]);

  const handleAspireChange = useCallback(async (itemId: string, newState: any) => {
    try {
      // Si hay filas seleccionadas, aplicar a todas las seleccionadas
      // Si no hay filas seleccionadas, aplicar solo a la fila clickeada
      const itemsToUpdate = selectedRows.size > 0
        ? Array.from(selectedRows)
        : [itemId];

      // Actualizar todas las filas seleccionadas
      await Promise.all(
        itemsToUpdate.map(id => updateItem(id, { aspireState: newState }))
      );

      const count = itemsToUpdate.length;
      toast({ 
        title: 'Estado Aspire actualizado', 
        description: `Estado Aspire cambiado para ${count} item${count > 1 ? 's' : ''}` 
      });
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo actualizar el estado Aspire', variant: 'destructive' });
    }
  }, [selectedRows, updateItem, toast]);

  const handleMaquinaChange = useCallback(async (itemId: string, newMachine: any) => {
    try {
      // Si hay filas seleccionadas, aplicar a todas las seleccionadas
      // Si no hay filas seleccionadas, aplicar solo a la fila clickeada
      const itemsToUpdate = selectedRows.size > 0
        ? Array.from(selectedRows)
        : [itemId];

      // Actualizar todas las filas seleccionadas
      await Promise.all(
        itemsToUpdate.map(id => updateItem(id, { machine: newMachine }))
      );

      const count = itemsToUpdate.length;
      toast({ 
        title: 'Máquina actualizada', 
        description: `Máquina cambiada para ${count} item${count > 1 ? 's' : ''}` 
      });
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo actualizar la máquina', variant: 'destructive' });
    }
  }, [selectedRows, updateItem, toast]);

  const handleDeadlineChange = useCallback(async (itemId: string, deadline: Date | null) => {
    try {
      // Si hay filas seleccionadas, aplicar a todas las seleccionadas
      // Si no hay filas seleccionadas, aplicar solo a la fila clickeada
      const itemsToUpdate = selectedRows.size > 0
        ? Array.from(selectedRows)
        : [itemId];

      // Actualizar todas las filas seleccionadas
      await Promise.all(
        itemsToUpdate.map(id => updateItem(id, { deadline: deadline ? deadline.toISOString() : null }))
      );

      const count = itemsToUpdate.length;
      toast({ 
        title: 'Fecha límite actualizada', 
        description: `Fecha límite ${deadline ? 'establecida' : 'eliminada'} para ${count} item${count > 1 ? 's' : ''}` 
      });
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo actualizar la fecha límite', variant: 'destructive' });
    }
  }, [selectedRows, updateItem, toast]);

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
  const handleProgramaChange = useCallback(async (itemId: string, newProgram: string) => {
    try {
      // Si hay filas seleccionadas, aplicar a todas las seleccionadas
      // Si no hay filas seleccionadas, aplicar solo a la fila clickeada
      const itemsToUpdate = selectedRows.size > 0
        ? Array.from(selectedRows)
        : [itemId];

      // Actualizar todas las filas seleccionadas
      await Promise.all(
        itemsToUpdate.map(id => updateItem(id, { program: newProgram }))
      );

      const count = itemsToUpdate.length;
      toast({ 
        title: 'Programa actualizado', 
        description: `Programa cambiado a "${newProgram}" para ${count} item${count > 1 ? 's' : ''}` 
      });
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo actualizar el programa', variant: 'destructive' });
    }
  }, [selectedRows, updateItem, toast]);

  const handleDateChange = (_itemId: string, newDate: Date) => {
    toast({ title: 'Fecha actualizada', description: `${newDate.toLocaleDateString('es-ES')}` });
  };

  const handleTaskCreate = async (itemId: string, title: string, description?: string, dueDate?: Date) => {
    try {
      // Encontrar el item para obtener su orderId
      const item = items.find(i => i.id === itemId);
      if (!item) {
        toast({ title: 'Error', description: 'Item no encontrado', variant: 'destructive' });
        return;
      }

      // Crear la tarea usando el orderId con contexto PRODUCCION
      await createTask(item.orderId, title, description, dueDate, 'PRODUCCION');
      
      // Actualizar solo el item específico para obtener las tareas actualizadas
      if (updateItem) {
        await updateItem(itemId, {});
      }
      
      const dueDateText = dueDate ? ` con fecha límite ${dueDate.toLocaleDateString('es-ES')}` : '';
      toast({ title: 'Tarea creada', description: `"${title}" agregada${dueDateText}` });
    } catch (error) {
      console.error('Error creating task:', error);
      toast({ 
        title: 'Error', 
        description: error instanceof Error ? error.message : 'No se pudo crear la tarea',
        variant: 'destructive' 
      });
    }
  };

  const handleTaskUpdate = async (taskId: string, updates: any) => {
    try {
      // Mapear ProductionState a estados de BD (Task.status)
      const statusMap: Record<string, 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'> = {
        'PENDIENTE': 'PENDING',
        'EN_PROGRESO': 'IN_PROGRESS',
        'COMPLETADO': 'COMPLETED',
        'REVISAR': 'IN_PROGRESS', // Mapear a IN_PROGRESS
        'REHACER': 'PENDING', // Mapear a PENDING
      };

      const taskUpdates: Partial<import('@/lib/types/index').Task> = { ...updates };
      if (updates.status) {
        taskUpdates.status = statusMap[updates.status] || 'PENDING';
        // Si el estado es COMPLETADO, establecer completedAt
        if (updates.status === 'COMPLETADO') {
          taskUpdates.completedAt = new Date().toISOString();
        } else if (updates.status !== 'COMPLETADO' && updates.completedAt === undefined) {
          // Si se cambia de COMPLETADO a otro estado, limpiar completedAt
          taskUpdates.completedAt = undefined;
        }
      }
      // Mapear completedAt si viene como string ISO (ya establecido arriba si es COMPLETADO)
      if (updates.completedAt && typeof updates.completedAt === 'string' && updates.status !== 'COMPLETADO') {
        taskUpdates.completedAt = updates.completedAt;
      }

      await updateTask(taskId, taskUpdates);
      
      // Encontrar el item que contiene esta tarea y actualizarlo
      const itemWithTask = items.find(item => item.tasks?.some(task => task.id === taskId));
      if (itemWithTask && updateItem) {
        await updateItem(itemWithTask.id, {});
      }
      
      toast({ title: 'Tarea actualizada', description: 'Los cambios se guardaron correctamente' });
    } catch (error) {
      console.error('Error updating task:', error);
      toast({ 
        title: 'Error', 
        description: error instanceof Error ? error.message : 'No se pudo actualizar la tarea',
        variant: 'destructive' 
      });
    }
  };

  const handleTaskDelete = async (taskId: string) => {
    try {
      await deleteTask(taskId);
      
      // Encontrar el item que contiene esta tarea y actualizarlo
      const itemWithTask = items.find(item => item.tasks?.some(task => task.id === taskId));
      if (itemWithTask && updateItem) {
        await updateItem(itemWithTask.id, {});
      }
      
      toast({ title: 'Tarea eliminada', description: 'La tarea se eliminó correctamente' });
    } catch (error) {
      console.error('Error deleting task:', error);
      toast({ 
        title: 'Error', 
        description: error instanceof Error ? error.message : 'No se pudo eliminar la tarea',
        variant: 'destructive' 
      });
    }
  };

  const tableColumns = useMemo(() => {
    return createProductionColumns({
      onTipoChange: handleTipoChange,
      onFabricacionChange: handleFabricacionChange,
      onVectorizadoChange: handleVectorizadoChange,
      onProgramaChange: handleProgramaChange,
      onAspireChange: handleAspireChange,
      onMaquinaChange: handleMaquinaChange,
      onDateChange: handleDateChange,
      onDeadlineChange: handleDeadlineChange,
      onTaskCreate: handleTaskCreate,
      onTaskUpdate: handleTaskUpdate,
      onTaskDelete: handleTaskDelete,
      editingRowId,
      onUpdate,
    });
  }, [editingRowId, handleFabricacionChange, handleVectorizadoChange, handleProgramaChange, handleAspireChange, handleMaquinaChange, handleDeadlineChange]);

  // Sistema unificado de columnas con redimensionamiento y reordenamiento
  const sortedColumns = useMemo(() => {
    console.log('=== ProductionTable sortedColumns ===');
    console.log('showPreviews:', showPreviews);
    console.log('columns del store:', columns.map(c => ({ id: c.id, hidden: c.hidden, order: c.order })));
    console.log('tableColumns disponibles:', tableColumns.map(c => c.id));
    
    // Crear una lista de columnas ajustada que siempre incluya archivoBase y vector cuando showPreviews es true
    const adjustedColumns = columns.map(col => {
      // Si showPreviews es true y la columna es archivoBase o vector, asegurarse de que no esté oculta
      if (showPreviews && (col.id === 'archivoBase' || col.id === 'vector')) {
        console.log(`Ajustando columna ${col.id}: hidden=false porque showPreviews=true`);
        return { ...col, hidden: false };
      }
      return col;
    });
    
    const filtered = adjustedColumns
      .sort((a, b) => a.order - b.order)
      .filter(col => {
        // Para las columnas de archivo base y vector, controlarlas con showPreviews
        if (col.id === 'archivoBase' || col.id === 'vector') {
          const shouldShow = showPreviews;
          console.log(`Filtrando columna ${col.id}: showPreviews=${showPreviews}, shouldShow=${shouldShow}`);
          return shouldShow;
        }
        // Para otras columnas, filtrar las ocultas normalmente
        if (col.hidden) {
          console.log(`Ocultando columna ${col.id} porque hidden=true`);
          return false;
        }
        return true;
      });
    
    console.log('Columnas después del filtro:', filtered.map(c => c.id));
    
    const mapped = filtered
      .map(col => {
        const tableCol = tableColumns.find(tc => tc.id === col.id);
        if (!tableCol) {
          console.warn(`⚠️ Columna ${col.id} no encontrada en tableColumns`);
        }
        return tableCol ? { ...tableCol, size: col.size } : null;
      })
      .filter((col): col is NonNullable<typeof col> => col !== null);
    
    console.log('Columnas finales mapeadas:', mapped.map(c => c.id));
    console.log('=== Fin sortedColumns ===');
    
    return mapped;
  }, [columns, tableColumns, showPreviews]);

  const columnIds = useMemo(() => {
    return columns
      .sort((a, b) => a.order - b.order)
      .filter(col => {
        // Filtrar columnas ocultas
        if (col.hidden) return false;
        // Para las columnas de archivo base y vector, solo mostrarlas si showPreviews es true
        if (col.id === 'archivoBase' || col.id === 'vector') {
          return showPreviews;
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
                  {/* Checkbox para seleccionar todas - solo visible cuando hay filas seleccionadas */}
                  <th className={`${selectedRows.size > 0 ? 'w-12 px-2' : 'w-0 p-0'} py-4 text-center transition-all`}>
                    {selectedRows.size > 0 && (
                      <Checkbox
                        checked={selectedRows.size > 0 && selectedRows.size === filteredItems.length && filteredItems.length > 0}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedRows(new Set(filteredItems.map(item => item.id)));
                          } else {
                            setSelectedRows(new Set());
                          }
                        }}
                        className="cursor-pointer"
                      />
                    )}
                  </th>
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
          <tbody className="divide-y divide-gray-400/20">
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <ContextMenu key={row.id}>
                  <ContextMenuTrigger asChild>
                    <tr 
                      data-row 
                      onDoubleClick={() => handleRowDoubleClick(row.original.id)} 
                      className={`hover:bg-muted/80 transition-colors ${editingRowId === row.original.id ? 'ring-1 ring-primary/40' : ''} ${selectedRows.has(row.original.id) ? 'bg-primary/10 ring-1 ring-primary/30' : ''}`}
                    >
                      {/* Checkbox para seleccionar la fila - solo visible cuando está seleccionada o hay otras seleccionadas */}
                      <td className={`${selectedRows.size > 0 ? 'w-12 px-2' : 'w-0 p-0'} py-3 text-center transition-all`} onClick={(e) => e.stopPropagation()}>
                        {selectedRows.size > 0 && (
                          <Checkbox
                            checked={selectedRows.has(row.original.id)}
                            onCheckedChange={(checked) => {
                              const newSelected = new Set(selectedRows);
                              if (checked) {
                                newSelected.add(row.original.id);
                              } else {
                                newSelected.delete(row.original.id);
                              }
                              setSelectedRows(newSelected);
                            }}
                            className="cursor-pointer"
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                      </td>
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
                    {selectedRows.has(row.original.id) ? (
                      <ContextMenuItem onSelect={() => {
                        const newSelected = new Set(selectedRows);
                        newSelected.delete(row.original.id);
                        setSelectedRows(newSelected);
                      }}>
                        Deseleccionar fila
                      </ContextMenuItem>
                    ) : (
                      <ContextMenuItem onSelect={() => {
                        const newSelected = new Set(selectedRows);
                        newSelected.add(row.original.id);
                        setSelectedRows(newSelected);
                      }}>
                        Seleccionar fila
                      </ContextMenuItem>
                    )}
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
                <td colSpan={columns.length + 1} className="h-24 text-center text-muted-foreground">No se encontraron items de producción.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </DndTableContainer>
    </div>
  );
}
