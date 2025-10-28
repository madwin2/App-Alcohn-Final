import { create } from 'zustand';
import { Filters, SortState, FabricationState, SaleState, ShippingState } from '../types/index';
import { getColumnsForViewMode } from '../utils/columnConfig';

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
  
  // Estado de columnas
  columns: ColumnState[];
  
  // Filtros
  filters: Filters;
  
  // Ordenamiento
  sort: SortState;
  
  // Acciones de UI
  setSidebarExpanded: (expanded: boolean) => void;
  setSidebarHovered: (hovered: boolean) => void;
  setShowPreviews: (show: boolean) => void;
  setSearchQuery: (query: string) => void;
  setEditingRow: (id: string | null) => void;

  // Mutaciones de datos (mock)
  updateOrder: (orderId: string, patch: any) => void;
  deleteOrder: (orderId: string) => void;
  
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
  fabricationPriority: ['SIN_HACER', 'HACIENDO', 'VERIFICAR', 'HECHO', 'RETOCAR', 'REHACER'],
  criteria: []
};

// Función para crear columnas iniciales (solo vista items)
function createInitialColumns(): ColumnState[] {
  const columnConfigs = getColumnsForViewMode('items');
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
  columns: createInitialColumns(),
  filters: initialFilters,
  sort: initialSort,
  
  // Acciones de UI
  setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),
  setSidebarHovered: (hovered) => set({ sidebarHovered: hovered }),
  setShowPreviews: (show) => set({ showPreviews: show }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setEditingRow: (id) => set({ editingRowId: id }),
  
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

  // Mutaciones mock (sin persistencia, solo UI)
  updateOrder: (_orderId, _patch) => {},
  deleteOrder: (_orderId) => {},
  
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
  
  resetColumns: () => set({ columns: createInitialColumns() }),
}));
