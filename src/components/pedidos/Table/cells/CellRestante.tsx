import { useState, useEffect, useMemo } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { Order } from '@/lib/types/index';
import { getShippingCost } from '@/lib/supabase/services/orders.service';

interface CellRestanteProps {
  order: Order;
}

export function CellRestante({ order }: CellRestanteProps) {
  const [shippingCost, setShippingCost] = useState<number>(0);
  const hasMultipleItems = order.items.length > 1;

  // Obtener el costo de envío cuando cambia la empresa o tipo de servicio
  useEffect(() => {
    const fetchShippingCost = async () => {
      const cost = await getShippingCost(order.shipping?.carrier, order.shipping?.service);
      setShippingCost(cost);
    };
    
    fetchShippingCost();
  }, [order.shipping?.carrier, order.shipping?.service]);

  // Calcular el restante base (sin envío) para comparar con el valor de la BD
  const baseRestante = useMemo(() => {
    if (hasMultipleItems) {
      // Para múltiples items, calcular desde los items individuales
      return order.items.reduce((sum, item) => {
        return sum + ((item.itemValue || 0) - (item.depositValueItem || 0));
      }, 0);
    } else {
      // Para un solo item
      const item = order.items[0];
      return (item?.itemValue || 0) - (item?.depositValueItem || 0);
    }
  }, [order.items, hasMultipleItems]);

  // Verificar si el restante de la BD ya incluye el envío
  // Si la diferencia entre restPaidAmountOrder y baseRestante es igual al shippingCost,
  // entonces ya está incluido
  const restanteFromDB = order.restPaidAmountOrder || 0;
  const diferencia = Math.abs(restanteFromDB - baseRestante);
  const envioYaIncluido = shippingCost > 0 && Math.abs(diferencia - shippingCost) < 0.01;

  // Calcular el restante final
  const restanteFinal = envioYaIncluido 
    ? restanteFromDB 
    : baseRestante + shippingCost;
  
  // Si es la fila resumen (múltiples items)
  if (hasMultipleItems) {
    const isDebt = restanteFinal > 0;
    
    return (
      <div>
        <span className={`text-sm font-medium ${isDebt ? 'text-red-500' : 'text-green-500'}`}>
          {formatCurrency(restanteFinal)}
        </span>
        {shippingCost > 0 && !envioYaIncluido && (
          <span className="text-xs text-muted-foreground block">
            (+{formatCurrency(shippingCost)} envío)
          </span>
        )}
        {(!order.shipping?.carrier || order.shipping?.carrier === 'OTRO') && (
          <span className="text-xs text-yellow-600 block">
            (envío pendiente)
          </span>
        )}
      </div>
    );
  }
  
  // Si es un item individual
  const item = order.items[0];
  if (item) {
    const isDebt = restanteFinal > 0;
    
    return (
      <div>
        <span className={`text-sm font-medium ${isDebt ? 'text-red-500' : 'text-green-500'}`}>
          {formatCurrency(restanteFinal)}
        </span>
        {shippingCost > 0 && !envioYaIncluido && (
          <span className="text-xs text-muted-foreground block">
            (+{formatCurrency(shippingCost)} envío)
          </span>
        )}
        {(!order.shipping?.carrier || order.shipping?.carrier === 'OTRO') && (
          <span className="text-xs text-yellow-600 block">
            (envío pendiente)
          </span>
        )}
      </div>
    );
  }
  
  // Fallback
  const isDebt = restanteFinal > 0;
  
  return (
    <div>
      <span className={`text-sm font-medium ${isDebt ? 'text-red-500' : 'text-green-500'}`}>
        {formatCurrency(restanteFinal)}
      </span>
      {shippingCost > 0 && !envioYaIncluido && (
        <span className="text-xs text-muted-foreground block">
          (+{formatCurrency(shippingCost)} envío)
        </span>
      )}
      {(!order.shipping?.carrier || order.shipping?.carrier === 'OTRO') && (
        <span className="text-xs text-yellow-600 block">
          (envío pendiente)
        </span>
      )}
    </div>
  );
}
