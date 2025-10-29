import { create } from 'zustand';
import { FabricationState, VectorizationState, ProgramType } from '../types/index';

export interface ProductionFilters {
  dateRange?: {
    from: string;
    to: string;
  };
  production?: FabricationState[];
  vectorization?: VectorizationState[];
  program?: ProgramType[];
}

export interface ProductionSortCriteria {
  field: 'fecha' | 'tarea' | 'tipo' | 'disenio' | 'medida' | 'fabricacion' | 'vectorizado' | 'programa';
  dir: 'asc' | 'desc';
}

export interface ProductionSortState {
  productionPriority: FabricationState[];
  criteria: ProductionSortCriteria[];
}

export interface ProductionColumnState {
  id: string;
  size: number;
  order: number;
}

interface ProductionStore {
  // Estado de UI
  sidebarExpanded: boolean;
  sidebarHovered: boolean;
  showPreviews: boolean;
  searchQuery: string;
  editingRowId: string | null;
  
  // Estado de columnas
  columns: ProductionColumnState[];
  
  // Filtros
  filters: ProductionFilters;
  
  // Ordenamiento
  sort: ProductionSortState;
  
  // Acciones de UI
  setSidebarExpanded: (expanded: boolean) => void;
  setSidebarHovered: (hovered: boolean) => void;
  setShowPreviews: (show: boolean) => void;
  setSearchQuery: (query: string) => void;
  setEditingRow: (id: string | null) => void;

  // Mutaciones de datos (mock)
  updateProductionItem: (itemId: string, patch: any) => void;
  deleteProductionItem: (itemId: string) => void;
  
  // Acciones de filtros
  setFilters: (filters: Partial<ProductionFilters>) => void;
  clearFilters: () => void;
  
  // Acciones de ordenamiento
  setSort: (sort: Partial<ProductionSortState>) => void;
  setProductionPriority: (priority: FabricationState[]) => void;
  addSortCriteria: (criteria: { field: string; dir: 'asc' | 'desc' }) => void;
  removeSortCriteria: (index: number) => void;
  updateSortCriteria: (index: number, criteria: { field: string; dir: 'asc' | 'desc' }) => void;
  
  // Acciones de columnas
  setColumnSize: (columnId: string, size: number) => void;
  reorderColumns: (columnIds: string[]) => void;
  resetColumns: () => void;
}

const initialFilters: ProductionFilters = {};

const initialSort: ProductionSortState = {
  productionPriority: ['SIN_HACER', 'HACIENDO', 'VERIFICAR', 'HECHO', 'REHACER', 'RETOCAR'],
  criteria: []
};

// Columnas iniciales para producción
const initialColumns: ProductionColumnState[] = [
  { id: 'tarea', size: 16, order: 0 },
  { id: 'fecha', size: 80, order: 1 },
  { id: 'fechaLimite', size: 80, order: 2 },
  { id: 'tipo', size: 50, order: 3 },
  { id: 'disenio', size: 150, order: 4 },
  { id: 'medida', size: 80, order: 5 },
  { id: 'notas', size: 100, order: 6 },
  { id: 'prioridad', size: 28, order: 7 },
  { id: 'fabricacion', size: 20, order: 8 },
  { id: 'vectorizado', size: 20, order: 9 },
  { id: 'programa', size: 20, order: 10 },
  { id: 'archivoBase', size: 60, order: 11 },
  { id: 'vector', size: 60, order: 12 }
];

export const useProductionStore = create<ProductionStore>((set, get) => ({
  // Estado inicial
  sidebarExpanded: false,
  sidebarHovered: false,
  showPreviews: true,
  searchQuery: '',
  editingRowId: null,
  columns: initialColumns,
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
  setProductionPriority: (priority) => set((state) => ({
    sort: { ...state.sort, productionPriority: priority }
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
  updateProductionItem: (_itemId, _patch) => {},
  deleteProductionItem: (_itemId) => {},
  
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
