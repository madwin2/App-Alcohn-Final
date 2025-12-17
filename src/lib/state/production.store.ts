import { create } from 'zustand';
import { VectorizationState, ProgramType, ProductionFabricacionAspireKey, ProductionState } from '../types/index';

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
  field: 'fecha' | 'tarea' | 'tipo' | 'disenio' | 'medida' | 'fabricacion' | 'vectorizado' | 'programa' | 'aspire' | 'maquina';
  dir: 'asc' | 'desc';
}

export interface ProductionSortState {
  productionPriority: ProductionFabricacionAspireKey[];
  criteria: ProductionSortCriteria[];
}

export interface ProductionColumnState {
  id: string;
  size: number;
  order: number;
  hidden?: boolean;
}

interface ProductionStore {
  // Estado de UI
  sidebarExpanded: boolean;
  sidebarHovered: boolean;
  showPreviews: boolean;
  searchQuery: string;
  editingRowId: string | null;
  configLoaded: boolean;
  
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
  setConfigLoaded: (loaded: boolean) => void;
  loadConfig: (config: { columns?: ProductionColumnState[]; filters?: ProductionFilters; sort?: Partial<ProductionSortState>; showPreviews?: boolean }) => void;

  // Mutaciones de datos (mock)
  updateProductionItem: (itemId: string, patch: any) => void;
  deleteProductionItem: (itemId: string) => void;
  
  // Acciones de filtros
  setFilters: (filters: Partial<ProductionFilters>) => void;
  clearFilters: () => void;
  
  // Acciones de ordenamiento
  setSort: (sort: Partial<ProductionSortState>) => void;
  setProductionPriority: (priority: ProductionFabricacionAspireKey[]) => void;
  addSortCriteria: (criteria: ProductionSortCriteria) => void;
  removeSortCriteria: (index: number) => void;
  updateSortCriteria: (index: number, criteria: ProductionSortCriteria) => void;
  
  // Acciones de columnas
  setColumnSize: (columnId: string, size: number) => void;
  reorderColumns: (columnIds: string[]) => void;
  toggleColumnVisibility: (columnId: string) => void;
  resetColumns: () => void;
  
  // Obtener configuración para guardar
  getConfigForSave: () => { columns: ProductionColumnState[]; filters: ProductionFilters; sort: ProductionSortState; showPreviews: boolean };
}

const initialFilters: ProductionFilters = {};

const initialSort: ProductionSortState = {
  // Mantener el mismo orden que el dropdown de la columna Fabricación/Aspire
  productionPriority: [
    'SIN_HACER',
    'ASPIRE_Aspire_G',
    'ASPIRE_Aspire_G_Check',
    'ASPIRE_Aspire_C',
    'ASPIRE_Aspire_C_Check',
    'ASPIRE_Aspire_XL',
    'HACIENDO',
    'REHACER',
    'RETOCAR',
    'VERIFICAR',
    'HECHO',
    'PROGRAMADO',
  ],
  criteria: []
};

// Columnas iniciales para producción
const initialColumns: ProductionColumnState[] = [
  { id: 'tarea', size: 16, order: 0 },
  { id: 'uploader', size: 20, order: 1 },
  { id: 'fecha', size: 80, order: 2 },
  { id: 'fechaLimite', size: 80, order: 3 },
  { id: 'tipo', size: 50, order: 4 },
  { id: 'disenio', size: 150, order: 5 },
  { id: 'medida', size: 80, order: 6 },
  { id: 'notas', size: 100, order: 7 },
  { id: 'prioridad', size: 28, order: 8 },
  { id: 'fabricacion', size: 20, order: 9 },
  { id: 'vectorizado', size: 20, order: 10 },
  { id: 'programa', size: 20, order: 11 },
  { id: 'aspire', size: 120, order: 12 },
  { id: 'maquina', size: 80, order: 13 },
  { id: 'archivoBase', size: 60, order: 14 },
  { id: 'vector', size: 60, order: 15 }
];

export const useProductionStore = create<ProductionStore>((set, get) => ({
  // Estado inicial
  sidebarExpanded: false,
  sidebarHovered: false,
  showPreviews: true,
  searchQuery: '',
  editingRowId: null,
  configLoaded: false,
  columns: initialColumns,
  filters: initialFilters,
  sort: initialSort,
  
  // Acciones de UI
  setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),
  setSidebarHovered: (hovered) => set({ sidebarHovered: hovered }),
  setShowPreviews: (show) => set((state) => {
    // Asegurar que archivoBase y vector siempre estén en las columnas cuando se cambia showPreviews
    const updatedColumns = [...state.columns];
    const hasArchivoBase = updatedColumns.some(col => col.id === 'archivoBase');
    const hasVector = updatedColumns.some(col => col.id === 'vector');
    
    // Si faltan, agregarlas desde initialColumns
    if (!hasArchivoBase) {
      const archivoBaseCol = initialColumns.find(col => col.id === 'archivoBase');
      if (archivoBaseCol) {
        updatedColumns.push(archivoBaseCol);
      }
    }
    if (!hasVector) {
      const vectorCol = initialColumns.find(col => col.id === 'vector');
      if (vectorCol) {
        updatedColumns.push(vectorCol);
      }
    }
    
    return { 
      showPreviews: show,
      columns: updatedColumns
    };
  }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setEditingRow: (id) => set({ editingRowId: id }),
  setConfigLoaded: (loaded) => set({ configLoaded: loaded }),
  
  loadConfig: (config) => {
    if (config.columns) {
      // Asegurar que archivoBase y vector siempre estén en las columnas
      const loadedColumns = [...config.columns];
      const hasArchivoBase = loadedColumns.some(col => col.id === 'archivoBase');
      const hasVector = loadedColumns.some(col => col.id === 'vector');
      
      // Si faltan, agregarlas desde initialColumns
      if (!hasArchivoBase) {
        const archivoBaseCol = initialColumns.find(col => col.id === 'archivoBase');
        if (archivoBaseCol) {
          loadedColumns.push(archivoBaseCol);
        }
      }
      if (!hasVector) {
        const vectorCol = initialColumns.find(col => col.id === 'vector');
        if (vectorCol) {
          loadedColumns.push(vectorCol);
        }
      }
      
      set({ columns: loadedColumns });
    }
    if (config.filters) {
      set({ filters: config.filters });
    }
    if (config.sort) {
      set((state) => ({
        sort: {
          ...state.sort,
          ...config.sort,
          // Asegurar que los arrays se reemplacen completamente si vienen en config
          productionPriority: config.sort?.productionPriority || state.sort.productionPriority,
          criteria: config.sort?.criteria !== undefined ? config.sort.criteria : state.sort.criteria,
        }
      }));
    }
    if (config.showPreviews !== undefined) {
      set({ showPreviews: config.showPreviews });
    }
    set({ configLoaded: true });
  },
  
  // Acciones de filtros
  setFilters: (newFilters) => set((state) => ({
    filters: { ...state.filters, ...newFilters }
  })),
  clearFilters: () => set({ filters: initialFilters }),
  
  // Acciones de ordenamiento
  setSort: (newSort) => set((state) => ({
    sort: {
      ...state.sort,
      ...newSort,
      // Asegurar que los arrays se reemplacen completamente si vienen en newSort
      productionPriority: newSort.productionPriority !== undefined ? newSort.productionPriority : state.sort.productionPriority,
      criteria: newSort.criteria !== undefined ? newSort.criteria : state.sort.criteria,
    }
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
  
  toggleColumnVisibility: (columnId) => set((state) => ({
    columns: state.columns.map(col =>
      col.id === columnId ? { ...col, hidden: !col.hidden } : col
    )
  })),
  
  resetColumns: () => set({ columns: initialColumns }),
  
  getConfigForSave: () => {
    const state = get();
    // Asegurar que archivoBase y vector siempre estén en las columnas guardadas
    const columnsToSave = [...state.columns];
    const hasArchivoBase = columnsToSave.some(col => col.id === 'archivoBase');
    const hasVector = columnsToSave.some(col => col.id === 'vector');
    
    // Si faltan, agregarlas desde initialColumns
    if (!hasArchivoBase) {
      const archivoBaseCol = initialColumns.find(col => col.id === 'archivoBase');
      if (archivoBaseCol) {
        columnsToSave.push(archivoBaseCol);
      }
    }
    if (!hasVector) {
      const vectorCol = initialColumns.find(col => col.id === 'vector');
      if (vectorCol) {
        columnsToSave.push(vectorCol);
      }
    }
    
    return {
      columns: columnsToSave,
      filters: state.filters,
      sort: state.sort,
      showPreviews: state.showPreviews,
    };
  },
}));
