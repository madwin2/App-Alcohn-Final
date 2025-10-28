import { create } from 'zustand';
import { Program, MachineType, FabricationState } from '@/lib/types/index';

interface ProgramsState {
  // Estado de la UI
  searchQuery: string;
  selectedMachine: MachineType | 'ALL';
  selectedFabricationState: FabricationState | 'ALL';
  viewMode: 'grid' | 'list';
  
  // Estado de diálogos
  showFilters: boolean;
  showSorter: boolean;
  
  // Filtros adicionales
  showVerifiedOnly: boolean;
  showUnverifiedOnly: boolean;
  
  // Filtros de fecha
  dateFilterType: 'ALL' | 'SPECIFIC' | 'MONTH';
  specificDate: string;
  selectedMonth: string;
  selectedYear: string;
  
  // Orden
  sortField: string;
  sortDirection: 'asc' | 'desc';
  
  // Acciones
  setSearchQuery: (query: string) => void;
  setSelectedMachine: (machine: MachineType | 'ALL') => void;
  setSelectedFabricationState: (state: FabricationState | 'ALL') => void;
  setViewMode: (mode: 'grid' | 'list') => void;
  setShowFilters: (show: boolean) => void;
  setShowSorter: (show: boolean) => void;
  setShowVerifiedOnly: (show: boolean) => void;
  setShowUnverifiedOnly: (show: boolean) => void;
  setDateFilterType: (type: 'ALL' | 'SPECIFIC' | 'MONTH') => void;
  setSpecificDate: (date: string) => void;
  setSelectedMonth: (month: string) => void;
  setSelectedYear: (year: string) => void;
  setSortField: (field: string) => void;
  setSortDirection: (direction: 'asc' | 'desc') => void;
  resetFilters: () => void;
  
  // Función para filtrar y ordenar programas
  getFilteredPrograms: (programs: Program[]) => Program[];
}

// Store de Zustand para manejar el estado de la página de Programas
export const useProgramsStore = create<ProgramsState>((set, get) => ({
  // Estado inicial
  searchQuery: '',
  selectedMachine: 'ALL',
  selectedFabricationState: 'ALL',
  viewMode: 'grid',
  showFilters: false,
  showSorter: false,
  showVerifiedOnly: false,
  showUnverifiedOnly: false,
  dateFilterType: 'ALL',
  specificDate: '',
  selectedMonth: '',
  selectedYear: '',
  sortField: 'name',
  sortDirection: 'asc',
  
  // Acciones
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedMachine: (machine) => set({ selectedMachine: machine }),
  setSelectedFabricationState: (state) => set({ selectedFabricationState: state }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setShowFilters: (show) => set({ showFilters: show }),
  setShowSorter: (show) => set({ showSorter: show }),
  setShowVerifiedOnly: (show) => set({ showVerifiedOnly: show }),
  setShowUnverifiedOnly: (show) => set({ showUnverifiedOnly: show }),
  setDateFilterType: (type) => set({ dateFilterType: type }),
  setSpecificDate: (date) => set({ specificDate: date }),
  setSelectedMonth: (month) => set({ selectedMonth: month }),
  setSelectedYear: (year) => set({ selectedYear: year }),
  setSortField: (field) => set({ sortField: field }),
  setSortDirection: (direction) => set({ sortDirection: direction }),
  resetFilters: () => set({
    searchQuery: '',
    selectedMachine: 'ALL',
    selectedFabricationState: 'ALL',
    showVerifiedOnly: false,
    showUnverifiedOnly: false,
    dateFilterType: 'ALL',
    specificDate: '',
    selectedMonth: '',
    selectedYear: ''
  }),
  
  // Función para filtrar y ordenar programas
  getFilteredPrograms: (programs) => {
    const state = get();
    let filtered = [...programs];
    
    // Aplicar filtro de búsqueda
    if (state.searchQuery) {
      filtered = filtered.filter(program => 
        program.name.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
        program.description.toLowerCase().includes(state.searchQuery.toLowerCase())
      );
    }
    
    // Aplicar filtro de máquina
    if (state.selectedMachine !== 'ALL') {
      filtered = filtered.filter(program => program.machine === state.selectedMachine);
    }
    
    // Aplicar filtro de estado de fabricación
    if (state.selectedFabricationState !== 'ALL') {
      filtered = filtered.filter(program => program.fabricationState === state.selectedFabricationState);
    }
    
    // Aplicar filtros de verificación
    if (state.showVerifiedOnly) {
      filtered = filtered.filter(program => program.isVerified);
    }
    
    if (state.showUnverifiedOnly) {
      filtered = filtered.filter(program => !program.isVerified);
    }
    
    // Aplicar filtros de fecha
    if (state.dateFilterType === 'SPECIFIC' && state.specificDate) {
      filtered = filtered.filter(program => {
        const programDate = new Date(program.productionDate);
        const filterDate = new Date(state.specificDate);
        return programDate.toDateString() === filterDate.toDateString();
      });
    }
    
    if (state.dateFilterType === 'MONTH' && state.selectedMonth && state.selectedYear) {
      filtered = filtered.filter(program => {
        const programDate = new Date(program.productionDate);
        const programMonth = programDate.getMonth() + 1; // getMonth() devuelve 0-11
        const programYear = programDate.getFullYear();
        return programMonth === parseInt(state.selectedMonth) && 
               programYear === parseInt(state.selectedYear);
      });
    }
    
    // Aplicar ordenamiento
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (state.sortField) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'date':
          aValue = new Date(a.productionDate);
          bValue = new Date(b.productionDate);
          break;
        case 'stampCount':
          aValue = a.stampCount;
          bValue = b.stampCount;
          break;
        case 'machine':
          aValue = a.machine;
          bValue = b.machine;
          break;
        case 'fabricationState':
          aValue = a.fabricationState;
          bValue = b.fabricationState;
          break;
        case 'verified':
          aValue = a.isVerified ? 1 : 0;
          bValue = b.isVerified ? 1 : 0;
          break;
        default:
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
      }
      
      if (aValue < bValue) return state.sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return state.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    
    return filtered;
  }
}));
