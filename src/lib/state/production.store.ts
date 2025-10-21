import { create } from 'zustand';
import { ProductionState, VectorizationState, ProgramType } from '../types/index';
import { ProductionService } from '../supabase/services';
import type { Programa, Sello } from '../supabase/types';

export interface ProductionFilters {
  dateRange?: {
    from: string;
    to: string;
  };
  production?: ProductionState[];
  vectorization?: VectorizationState[];
  program?: ProgramType[];
}

export interface ProductionSortCriteria {
  field: 'fecha' | 'tarea' | 'tipo' | 'disenio' | 'medida' | 'fabricacion' | 'vectorizado' | 'programa';
  dir: 'asc' | 'desc';
}

export interface ProductionSortState {
  productionPriority: ProductionState[];
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
  
  // Estado de datos
  programas: Programa[];
  sellos: Sello[];
  loading: boolean;
  error: string | null;
  
  // Acciones de UI
  setSidebarExpanded: (expanded: boolean) => void;
  setSidebarHovered: (hovered: boolean) => void;
  setShowPreviews: (show: boolean) => void;
  setSearchQuery: (query: string) => void;
  setEditingRow: (id: string | null) => void;

  // Acciones de datos
  fetchProgramas: () => Promise<void>;
  fetchSellos: (programaId?: string) => Promise<void>;
  createPrograma: (programa: any) => Promise<void>;
  updatePrograma: (programaId: string, patch: any) => Promise<void>;
  deletePrograma: (programaId: string) => Promise<void>;
  asignarSelloAPrograma: (selloId: string, programaId: string) => Promise<void>;
  removerSelloDePrograma: (selloId: string) => Promise<void>;
  
  // Acciones de filtros
  setFilters: (filters: Partial<ProductionFilters>) => void;
  clearFilters: () => void;
  
  // Acciones de ordenamiento
  setSort: (sort: Partial<ProductionSortState>) => void;
  setProductionPriority: (priority: ProductionState[]) => void;
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
  productionPriority: ['PENDIENTE', 'EN_PROGRESO', 'REVISAR', 'COMPLETADO', 'REHACER'],
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
  { id: 'fabricacion', size: 20, order: 7 },
  { id: 'vectorizado', size: 20, order: 8 },
  { id: 'programa', size: 20, order: 9 },
  { id: 'archivoBase', size: 60, order: 10 },
  { id: 'vector', size: 60, order: 11 }
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
  programas: [],
  sellos: [],
  loading: false,
  error: null,
  
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

  // Acciones de datos
  fetchProgramas: async () => {
    set({ loading: true, error: null });
    try {
      const programas = await ProductionService.getAll();
      set({ programas, loading: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Error al cargar programas', loading: false });
    }
  },
  
  fetchSellos: async (programaId?: string) => {
    set({ loading: true, error: null });
    try {
      const sellos = programaId 
        ? await ProductionService.getSellosByPrograma(programaId)
        : await ProductionService.getSellosByPrograma('');
      set({ sellos, loading: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Error al cargar sellos', loading: false });
    }
  },
  
  createPrograma: async (programa) => {
    set({ loading: true, error: null });
    try {
      const newPrograma = await ProductionService.create(programa);
      set((state) => ({ 
        programas: [newPrograma, ...state.programas], 
        loading: false 
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Error al crear programa', loading: false });
    }
  },
  
  updatePrograma: async (programaId, patch) => {
    set({ loading: true, error: null });
    try {
      const updatedPrograma = await ProductionService.update(programaId, patch);
      set((state) => ({
        programas: state.programas.map(programa => 
          programa.id === programaId ? updatedPrograma : programa
        ),
        loading: false
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Error al actualizar programa', loading: false });
    }
  },
  
  deletePrograma: async (programaId) => {
    set({ loading: true, error: null });
    try {
      await ProductionService.delete(programaId);
      set((state) => ({
        programas: state.programas.filter(programa => programa.id !== programaId),
        loading: false
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Error al eliminar programa', loading: false });
    }
  },
  
  asignarSelloAPrograma: async (selloId, programaId) => {
    set({ loading: true, error: null });
    try {
      await ProductionService.asignarSelloAPrograma(selloId, programaId);
      set({ loading: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Error al asignar sello al programa', loading: false });
    }
  },
  
  removerSelloDePrograma: async (selloId) => {
    set({ loading: true, error: null });
    try {
      await ProductionService.removerSelloDePrograma(selloId);
      set({ loading: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Error al remover sello del programa', loading: false });
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
