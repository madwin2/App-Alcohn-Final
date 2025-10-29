import { Order } from '@/lib/types';
import { CellCliente } from './cells/CellCliente';
import { CellContacto } from './cells/CellContacto';
import { CellEnvio } from './cells/CellEnvio';
import { CellSena } from './cells/CellSena';
import { CellValor } from './cells/CellValor';
import { CellRestante } from './cells/CellRestante';
import { CellPrioridad } from './cells/CellPrioridad';
import { CellSeguimiento } from './cells/CellSeguimiento';
import { CellFoto } from './cells/CellFoto';

interface OrderSummaryRowProps {
  order: Order;
}

export function OrderSummaryRow({ order }: OrderSummaryRowProps) {
  const totalItems = order.items.length;
  const totalValue = order.items.reduce((sum, item) => sum + (item.itemValue || 0), 0);
  const totalDeposit = order.items.reduce((sum, item) => sum + (item.depositValueItem || 0), 0);
  const totalRemaining = totalValue - totalDeposit;
  
  // Verificar si algún item es prioritario
  const hasPriority = order.items.some(item => item.isPriority);

  return (
    <div className="flex items-center w-full">
      {/* Indicadores */}
      <div className="w-4 flex justify-center">
        {/* Aquí irían los indicadores de tareas y deadline */}
      </div>
      
      {/* Fecha */}
      <div className="w-20 px-2">
        <span className="text-xs text-muted-foreground">
          {new Date(order.orderDate).toLocaleDateString()}
        </span>
      </div>
      
      {/* Cliente */}
      <div className="w-30 px-2">
        <CellCliente order={order} />
      </div>
      
      {/* Contacto */}
      <div className="w-20 px-2">
        <CellContacto order={order} />
      </div>
      
      {/* Tipo - Mostrar cantidad de items */}
      <div className="w-12 px-2 text-center">
        <span className="text-xs font-medium bg-blue-100 text-blue-800 px-2 py-1 rounded">
          {totalItems}
        </span>
      </div>
      
      {/* Diseño - Mostrar resumen */}
      <div className="w-55 px-2">
        <div className="text-xs">
          <div className="font-medium truncate">
            {order.items[0]?.designName || 'Sin nombre'}
          </div>
          <div className="text-muted-foreground">
            {totalItems > 1 ? `+${totalItems - 1} más` : ''}
          </div>
        </div>
      </div>
      
      {/* Empresa */}
      <div className="w-20 px-2">
        <CellEnvio order={order} />
      </div>
      
      {/* Seña */}
      <div className="w-17 px-2">
        <span className="text-xs font-medium">
          ${totalDeposit.toLocaleString()}
        </span>
      </div>
      
      {/* Valor */}
      <div className="w-17 px-2">
        <span className="text-xs font-medium">
          ${totalValue.toLocaleString()}
        </span>
      </div>
      
      {/* Restante */}
      <div className="w-25 px-2">
        <span className={`text-xs font-medium ${totalRemaining > 0 ? 'text-red-600' : 'text-green-600'}`}>
          ${totalRemaining.toLocaleString()}
        </span>
      </div>
      
      {/* Prioridad */}
      <div className="w-7 px-2 text-center">
        {hasPriority && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-red-600 text-white border border-red-500">
            Prioridad
          </span>
        )}
      </div>
      
      {/* Estados - Mostrar resumen */}
      <div className="w-20 px-2 text-center">
        <span className="text-xs text-muted-foreground">
          Ver items
        </span>
      </div>
      
      {/* Seguimiento */}
      <div className="w-30 px-2">
        <CellSeguimiento order={order} />
      </div>
      
      {/* Archivos - Mostrar resumen */}
      <div className="w-15 px-2 text-center">
        <span className="text-xs text-muted-foreground">
          {order.items.filter(item => item.files?.baseUrl).length}/{totalItems}
        </span>
      </div>
      
      <div className="w-15 px-2 text-center">
        <span className="text-xs text-muted-foreground">
          {order.items.filter(item => item.files?.vectorUrl).length}/{totalItems}
        </span>
      </div>
      
      {/* Foto */}
      <div className="w-15 px-2">
        <CellFoto order={order} />
      </div>
    </div>
  );
}
