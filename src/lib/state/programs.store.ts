import { create } from 'zustand';
import { Program, ProgramStatus, ProgramCategory } from '@/lib/types/index';

interface ProgramsState {
  // Estado de la UI
  searchQuery: string;
  selectedCategory: ProgramCategory | 'ALL';
  selectedStatus: ProgramStatus | 'ALL';
  viewMode: 'grid' | 'list';
  
  // Acciones
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (category: ProgramCategory | 'ALL') => void;
  setSelectedStatus: (status: ProgramStatus | 'ALL') => void;
  setViewMode: (mode: 'grid' | 'list') => void;
  resetFilters: () => void;
}

// Store de Zustand para manejar el estado de la página de Programas
export const useProgramsStore = create<ProgramsState>((set) => ({
  // Estado inicial
  searchQuery: '',
  selectedCategory: 'ALL',
  selectedStatus: 'ALL',
  viewMode: 'grid',
  
  // Acciones
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedCategory: (category) => set({ selectedCategory: category }),
  setSelectedStatus: (status) => set({ selectedStatus: status }),
  setViewMode: (mode) => set({ viewMode: mode }),
  resetFilters: () => set({
    searchQuery: '',
    selectedCategory: 'ALL',
    selectedStatus: 'ALL'
  }),
}));
