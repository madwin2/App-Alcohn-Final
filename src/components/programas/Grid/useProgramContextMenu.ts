import { useState, useCallback, useEffect, useRef } from 'react';

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  programId: string | null;
}

// Hook para manejar el menú contextual de programas
export function useProgramContextMenu() {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    programId: null
  });
  
  const menuRef = useRef<HTMLDivElement>(null);

  const openContextMenu = useCallback((event: React.MouseEvent, programId: string) => {
    event.preventDefault();
    event.stopPropagation();
    
    setContextMenu({
      isOpen: true,
      x: 0,
      y: 0,
      programId
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu({
      isOpen: false,
      x: 0,
      y: 0,
      programId: null
    });
  }, []);

  const handleDelete = useCallback((programId: string) => {
    console.log('Eliminar programa:', programId);
    // Aquí iría la lógica para eliminar el programa
    closeContextMenu();
  }, [closeContextMenu]);

  const handleAddStamps = useCallback((programId: string) => {
    console.log('Agregar sellos al programa:', programId);
    // Aquí iría la lógica para agregar sellos
    closeContextMenu();
  }, [closeContextMenu]);

  const handleDownload = useCallback((programId: string) => {
    console.log('Descargar programa:', programId);
    // Aquí iría la lógica para descargar el programa
    closeContextMenu();
  }, [closeContextMenu]);

  // Cerrar menú contextual al hacer click fuera
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.isOpen) {
        closeContextMenu();
      }
    };

    if (contextMenu.isOpen) {
      // Pequeño delay para evitar que se cierre inmediatamente
      const timeoutId = setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 100);
      
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [contextMenu.isOpen, closeContextMenu]);

  return {
    contextMenu,
    menuRef,
    openContextMenu,
    closeContextMenu,
    handleDelete,
    handleAddStamps,
    handleDownload
  };
}
