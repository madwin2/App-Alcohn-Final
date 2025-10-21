import { create } from 'zustand';
import { Filters, SortState, FabricationState, SaleState, ShippingState } from '../types/index';
import { getColumnsForViewMode } from '../utils/columnConfig';
import { OrdersService, SellosService } from '../supabase/services';
import type { Orden, Sello } from '../supabase/types';

export interface ColumnState {
  id: string;
  size: number;
  order: number;
}

interface OrdersStore {
  // Estado de UI
  sidebarExpanded: boolean;
  sidebarHovered: boolean;
  showPreviews: boolean;
  searchQuery: string;
  editingRowId: string | null;
  viewMode: 'items' | 'orders';
  
  // Estado de columnas
  columns: ColumnState[];
  
  // Filtros
  filters: Filters;
  
  // Ordenamiento
  sort: SortState;
  
  // Estado de datos
  orders: Orden[];
  sellos: Sello[];
  loading: boolean;
  error: string | null;
  
  // Acciones de UI
  setSidebarExpanded: (expanded: boolean) => void;
  setSidebarHovered: (hovered: boolean) => void;
  setShowPreviews: (show: boolean) => void;
  setSearchQuery: (query: string) => void;
  setEditingRow: (id: string | null) => void;
  setViewMode: (mode: 'items' | 'orders') => void;

  // Acciones de datos
  fetchOrders: () => Promise<void>;
  fetchSellos: (ordenId?: string) => Promise<void>;
  createOrder: (order: any) => Promise<void>;
  updateOrder: (orderId: string, patch: any) => Promise<void>;
  deleteOrder: (orderId: string) => Promise<void>;
  createSello: (sello: any) => Promise<void>;
  updateSello: (selloId: string, patch: any) => Promise<void>;
  deleteSello: (selloId: string) => Promise<void>;
  
  // Acciones de filtros
  setFilters: (filters: Partial<Filters>) => void;
  clearFilters: () => void;
  
  // Acciones de ordenamiento
  setSort: (sort: Partial<SortState>) => void;
  setFabricationPriority: (priority: FabricationState[]) => void;
  addSortCriteria: (criteria: { field: string; dir: 'asc' | 'desc' }) => void;
  removeSortCriteria: (index: number) => void;
  updateSortCriteria: (index: number, criteria: { field: string; dir: 'asc' | 'desc' }) => void;
  
  // Acciones de columnas
  setColumnSize: (columnId: string, size: number) => void;
  reorderColumns: (columnIds: string[]) => void;
  resetColumns: () => void;
}

const initialFilters: Filters = {};

const initialSort: SortState = {
  fabricationPriority: ['PRIORIDAD', 'SIN_HACER', 'HACIENDO', 'VERIFICAR', 'HECHO', 'RETOCAR', 'REHACER'],
  criteria: []
};

// Función para crear columnas iniciales basadas en el modo de vista
function createInitialColumns(viewMode: 'items' | 'orders'): ColumnState[] {
  const columnConfigs = getColumnsForViewMode(viewMode);
  return columnConfigs.map((config, index) => ({
    id: config.id,
    size: config.size,
    order: index
  }));
}

export const useOrdersStore = create<OrdersStore>((set, get) => ({
  // Estado inicial
  sidebarExpanded: false,
  sidebarHovered: false,
  showPreviews: true,
  searchQuery: '',
  editingRowId: null,
  viewMode: 'items' as const,
  columns: createInitialColumns('items'),
  filters: initialFilters,
  sort: initialSort,
  orders: [],
  sellos: [],
  loading: false,
  error: null,
  
  // Acciones de UI
  setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),
  setSidebarHovered: (hovered) => set({ sidebarHovered: hovered }),
  setShowPreviews: (show) => set({ showPreviews: show }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setEditingRow: (id) => set({ editingRowId: id }),
  setViewMode: (mode) => set((state) => {
    // Actualizar columnas cuando cambie el modo de vista
    const newColumns = createInitialColumns(mode);
    return { 
      viewMode: mode, 
      columns: newColumns 
    };
  }),
  
  // Acciones de filtros
  setFilters: (newFilters) => set((state) => ({
    filters: { ...state.filters, ...newFilters }
  })),
  clearFilters: () => set({ filters: initialFilters }),
  
  // Acciones de ordenamiento
  setSort: (newSort) => set((state) => ({
    sort: { ...state.sort, ...newSort }
  })),
  setFabricationPriority: (priority) => set((state) => ({
    sort: { ...state.sort, fabricationPriority: priority }
  })),
  addSortCriteria: (criteria) => set((state) => ({
    sort: {
      ...state.sort,
      criteria: [...state.sort.criteria, criteria]
    }
  })),
  removeSortCriteria: (index) => set((state) => ({
    sort: {
      ...state.sort,
      criteria: state.sort.criteria.filter((_, i) => i !== index)
    }
  })),
  updateSortCriteria: (index, criteria) => set((state) => ({
    sort: {
      ...state.sort,
      criteria: state.sort.criteria.map((c, i) => i === index ? criteria : c)
    }
  })),

  // Acciones de datos
  fetchOrders: async () => {
    set({ loading: true, error: null });
    try {
      const orders = await OrdersService.getAll();
      set({ orders, loading: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Error al cargar órdenes', loading: false });
    }
  },
  
  fetchSellos: async (ordenId?: string) => {
    set({ loading: true, error: null });
    try {
      const sellos = ordenId 
        ? await SellosService.getByOrdenId(ordenId)
        : await SellosService.getByEstadoFabricacion('Sin Hacer');
      set({ sellos, loading: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Error al cargar sellos', loading: false });
    }
  },
  
  createOrder: async (order) => {
    set({ loading: true, error: null });
    try {
      const newOrder = await OrdersService.create(order);
      set((state) => ({ 
        orders: [newOrder, ...state.orders], 
        loading: false 
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Error al crear orden', loading: false });
    }
  },
  
  updateOrder: async (orderId, patch) => {
    set({ loading: true, error: null });
    try {
      const updatedOrder = await OrdersService.update(orderId, patch);
      set((state) => ({
        orders: state.orders.map(order => 
          order.id === orderId ? updatedOrder : order
        ),
        loading: false
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Error al actualizar orden', loading: false });
    }
  },
  
  deleteOrder: async (orderId) => {
    set({ loading: true, error: null });
    try {
      await OrdersService.delete(orderId);
      set((state) => ({
        orders: state.orders.filter(order => order.id !== orderId),
        loading: false
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Error al eliminar orden', loading: false });
    }
  },
  
  createSello: async (sello) => {
    set({ loading: true, error: null });
    try {
      const newSello = await SellosService.create(sello);
      set((state) => ({ 
        sellos: [newSello, ...state.sellos], 
        loading: false 
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Error al crear sello', loading: false });
    }
  },
  
  updateSello: async (selloId, patch) => {
    set({ loading: true, error: null });
    try {
      const updatedSello = await SellosService.update(selloId, patch);
      set((state) => ({
        sellos: state.sellos.map(sello => 
          sello.id === selloId ? updatedSello : sello
        ),
        loading: false
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Error al actualizar sello', loading: false });
    }
  },
  
  deleteSello: async (selloId) => {
    set({ loading: true, error: null });
    try {
      await SellosService.delete(selloId);
      set((state) => ({
        sellos: state.sellos.filter(sello => sello.id !== selloId),
        loading: false
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Error al eliminar sello', loading: false });
    }
  },
  
  // Acciones de columnas
  setColumnSize: (columnId, size) => set((state) => ({
    columns: state.columns.map(col => 
      col.id === columnId ? { ...col, size } : col
    )
  })),
  
  reorderColumns: (columnIds) => set((state) => ({
    columns: columnIds.map((id, index) => {
      const column = state.columns.find(col => col.id === id);
      return column ? { ...column, order: index } : { id, size: 100, order: index };
    })
  })),
  
  resetColumns: () => set({ columns: initialColumns }),
}));
