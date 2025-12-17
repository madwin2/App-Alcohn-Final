import { useState, useEffect } from 'react';
import { ProductionItem } from '../types/index';
import * as productionService from '../supabase/services/production.service';

export const useProduction = () => {
  const [items, setItems] = useState<ProductionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchItems = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await productionService.getProductionItems();
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Error al cargar items de producción'));
      console.error('Error fetching production items:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const updateItem = async (itemId: string, updates: Partial<ProductionItem>): Promise<ProductionItem> => {
    try {
      const updatedItem = await productionService.updateProductionItem(itemId, updates);
      
      // Actualizar el estado local inmediatamente sin recargar toda la lista
      setItems(prevItems => 
        prevItems.map(item => 
          item.id === itemId ? updatedItem : item
        )
      );
      
      return updatedItem;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Error al actualizar item');
      setError(error);
      throw error;
    }
  };

  return {
    items,
    loading,
    error,
    fetchItems,
    updateItem,
  };
};

