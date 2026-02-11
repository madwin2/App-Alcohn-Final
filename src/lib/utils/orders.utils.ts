import { Order, FabricationState, Filters, SortState } from '../types/index';
import { parseOrderDateLocal } from './format';

// Función para obtener contadores por estado de fabricación
export const getFabricationCounts = (orders: Order[]) => {
  const counts: Record<FabricationState, number> = {
    SIN_HACER: 0,
    HACIENDO: 0,
    VERIFICAR: 0,
    HECHO: 0,
    REHACER: 0,
    RETOCAR: 0,
    PROGRAMADO: 0
  };

  orders.forEach(order => {
    order.items.forEach(item => {
      counts[item.fabricationState]++;
    });
  });

  return counts;
};

// Función para filtrar pedidos según los filtros aplicados
export const filterOrders = (
  orders: Order[],
  searchQuery: string,
  filters: Filters,
  sort?: SortState
): Order[] => {
  let result = orders;

  // Aplicar búsqueda por texto
  if (searchQuery) {
    const searchLower = searchQuery.toLowerCase();
    result = result.filter(order =>
      order.customer.firstName.toLowerCase().includes(searchLower) ||
      order.customer.lastName.toLowerCase().includes(searchLower) ||
      order.customer.email?.toLowerCase().includes(searchLower) ||
      order.items.some(item => item.designName.toLowerCase().includes(searchLower))
    );
  }

  // Aplicar filtros del store
  if (filters.dateRange?.from || filters.dateRange?.to) {
    const fromStr = filters.dateRange?.from;
    const toStr = filters.dateRange?.to;
    const fromDate = fromStr ? new Date(fromStr + 'T00:00:00') : null;
    const toDate = toStr ? new Date(toStr + 'T23:59:59.999') : null;
    const fromValid = fromDate && !isNaN(fromDate.getTime());
    const toValid = toDate && !isNaN(toDate.getTime());
    if (fromValid || toValid) {
      result = result.filter(order => {
        const orderDate = parseOrderDateLocal(order.orderDate);
        if (isNaN(orderDate.getTime())) return false;
        if (fromValid && orderDate < fromDate!) return false;
        if (toValid && orderDate > toDate!) return false;
        return true;
      });
    }
  }

  if (filters.fabrication && filters.fabrication.length > 0) {
    result = result.filter(order =>
      order.items.some(item => filters.fabrication!.includes(item.fabricationState))
    );
  }

  if (filters.sale && filters.sale.length > 0) {
    result = result.filter(order =>
      order.items.some(item => filters.sale!.includes(item.saleState)) ||
      (order.saleStateOrder && filters.sale!.includes(order.saleStateOrder))
    );
  }

  if (filters.shipping && filters.shipping.length > 0) {
    result = result.filter(order =>
      order.items.some(item => filters.shipping!.includes(item.shippingState))
    );
  }

  if (filters.types && filters.types.length > 0) {
    result = result.filter(order =>
      order.items.some(item => filters.types!.includes(item.stampType))
    );
  }

  if (filters.channels && filters.channels.length > 0) {
    result = result.filter(order =>
      order.items.some(item => {
        const channel = item.contact.channel;
        return filters.channels!.includes(channel as any);
      })
    );
  }

  if (filters.uploaders && filters.uploaders.length > 0) {
    result = result.filter(order => {
      const uploaderName = order.takenBy?.name;
      return uploaderName && filters.uploaders!.includes(uploaderName);
    });
  }

  // El ordenamiento no afecta el conteo, pero lo incluimos por completitud
  // (aunque normalmente no se aplica aquí ya que solo necesitamos el conteo)
  if (sort) {
    const priorityMap = sort.fabricationPriority && sort.fabricationPriority.length > 0
      ? new Map(sort.fabricationPriority.map((state, index) => [state, index]))
      : null;

    if (priorityMap) {
      result = [...result].sort((a, b) => {
        const getMinPriority = (order: Order) => {
          const priorities = order.items
            .map(item => priorityMap.get(item.fabricationState))
            .filter((p): p is number => p !== undefined);
          return priorities.length > 0 ? Math.min(...priorities) : Infinity;
        };
        return getMinPriority(a) - getMinPriority(b);
      });
    }

    if (sort.criteria && sort.criteria.length > 0) {
      result = [...result].sort((a, b) => {
        for (const criteria of sort.criteria) {
          let comparison = 0;
          
          switch (criteria.field) {
            case 'fecha':
              comparison = parseOrderDateLocal(a.orderDate).getTime() - parseOrderDateLocal(b.orderDate).getTime();
              break;
            case 'cliente':
              const aName = `${a.customer.firstName} ${a.customer.lastName}`;
              const bName = `${b.customer.firstName} ${b.customer.lastName}`;
              comparison = aName.localeCompare(bName);
              break;
            case 'fabricacion':
              if (priorityMap) {
                const aFab = a.items.map(i => priorityMap.get(i.fabricationState) ?? Infinity);
                const bFab = b.items.map(i => priorityMap.get(i.fabricationState) ?? Infinity);
                comparison = Math.min(...aFab) - Math.min(...bFab);
              } else {
                const aFab = a.items[0]?.fabricationState || '';
                const bFab = b.items[0]?.fabricationState || '';
                comparison = aFab.localeCompare(bFab);
              }
              break;
            case 'venta':
              const aSale = a.items[0]?.saleState || a.saleStateOrder || '';
              const bSale = b.items[0]?.saleState || b.saleStateOrder || '';
              comparison = aSale.localeCompare(bSale);
              break;
            case 'envio':
              const aShip = a.items[0]?.shippingState || '';
              const bShip = b.items[0]?.shippingState || '';
              comparison = aShip.localeCompare(bShip);
              break;
            case 'valor':
              comparison = (a.totalValue || 0) - (b.totalValue || 0);
              break;
            case 'restante':
              const aRest = a.items.reduce((sum, item) => sum + ((item.itemValue || 0) - (item.depositValueItem || 0)), 0);
              const bRest = b.items.reduce((sum, item) => sum + ((item.itemValue || 0) - (item.depositValueItem || 0)), 0);
              comparison = aRest - bRest;
              break;
          }
          
          if (comparison !== 0) {
            return criteria.dir === 'asc' ? comparison : -comparison;
          }
        }
        return 0;
      });
    }
  }

  return result;
};








