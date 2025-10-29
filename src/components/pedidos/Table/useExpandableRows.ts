import { useState, useCallback, useEffect } from 'react';

export function useExpandableRows() {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [collapsingRows, setCollapsingRows] = useState<Set<string>>(new Set());
  const [expandingRows, setExpandingRows] = useState<Set<string>>(new Set());

  const toggleRow = useCallback((orderId: string) => {
    if (expandedRows.has(orderId)) {
      // Iniciar animación de contracción
      setCollapsingRows(prev => new Set(prev).add(orderId));
      
      // Después de la animación, remover de expandedRows
      setTimeout(() => {
        setExpandedRows(prev => {
          const newSet = new Set(prev);
          newSet.delete(orderId);
          return newSet;
        });
        setCollapsingRows(prev => {
          const newSet = new Set(prev);
          newSet.delete(orderId);
          return newSet;
        });
      }, 250); // Duración de la transición súper rápida
    } else {
      // Iniciar animación de expansión
      setExpandingRows(prev => new Set(prev).add(orderId));
      
      // Después de la animación, agregar a expandedRows
      setTimeout(() => {
        setExpandedRows(prev => new Set(prev).add(orderId));
        setExpandingRows(prev => {
          const newSet = new Set(prev);
          newSet.delete(orderId);
          return newSet;
        });
      }, 150); // Duración del efecto de expansión
    }
  }, [expandedRows]);

  const isExpanded = useCallback((orderId: string) => {
    return expandedRows.has(orderId);
  }, [expandedRows]);

  const isCollapsing = useCallback((orderId: string) => {
    return collapsingRows.has(orderId);
  }, [collapsingRows]);

  const isExpanding = useCallback((orderId: string) => {
    return expandingRows.has(orderId);
  }, [expandingRows]);

  const expandAll = useCallback((orderIds: string[]) => {
    setExpandedRows(new Set(orderIds));
  }, []);

  const collapseAll = useCallback(() => {
    // Iniciar animación de contracción para todos
    setCollapsingRows(new Set(expandedRows));
    
    setTimeout(() => {
      setExpandedRows(new Set());
      setCollapsingRows(new Set());
    }, 250);
  }, [expandedRows]);

  return {
    expandedRows,
    collapsingRows,
    expandingRows,
    toggleRow,
    isExpanded,
    isCollapsing,
    isExpanding,
    expandAll,
    collapseAll
  };
}
