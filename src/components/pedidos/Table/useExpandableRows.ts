import { useState, useCallback } from 'react';

export function useExpandableRows() {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = useCallback((orderId: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  }, []);

  const isExpanded = useCallback((orderId: string) => {
    return expandedRows.has(orderId);
  }, [expandedRows]);

  const expandAll = useCallback((orderIds: string[]) => {
    setExpandedRows(new Set(orderIds));
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedRows(new Set());
  }, []);

  return {
    expandedRows,
    toggleRow,
    isExpanded,
    expandAll,
    collapseAll
  };
}
