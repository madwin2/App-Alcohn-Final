import React from 'react';
import { Order } from '@/lib/types';
import { formatCurrency } from '@/lib/utils/format';

interface CellSummaryProps {
  order: Order;
  columnId: string;
}

export function CellSummary({ order, columnId }: CellSummaryProps) {
  const totalItems = order.items.length;
  const totalValue = order.items.reduce((sum, item) => sum + (item.itemValue || 0), 0);
  const totalDeposit = order.items.reduce((sum, item) => sum + (item.depositValueItem || 0), 0);
  const totalRemaining = totalValue - totalDeposit;
  const hasPriority = order.items.some(item => item.isPriority);

  switch (columnId) {
    case 'fecha':
      return (
        <span className="text-xs text-muted-foreground">
          {new Date(order.orderDate).toLocaleDateString()}
        </span>
      );
    
    case 'cliente':
      return (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{order.customer.firstName} {order.customer.lastName}</span>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            {totalItems}
          </span>
        </div>
      );
    
    case 'contacto':
      return (
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">WhatsApp</span>
          <span className="text-xs text-muted-foreground">({order.customer.phoneE164?.slice(-4)})</span>
        </div>
      );
    
    case 'tipo':
      return (
        <span className="text-xs text-muted-foreground">
          {totalItems > 1 ? 'Múltiple' : order.items[0]?.stampType || '—'}
        </span>
      );
    
    case 'disenio':
      return (
        <div className="flex flex-col">
          <span className="text-xs font-medium truncate">
            {order.items[0]?.designName || '—'}
          </span>
          {totalItems > 1 && (
            <span className="text-[10px] text-muted-foreground">
              +{totalItems - 1} más
            </span>
          )}
        </div>
      );
    
    case 'empresa':
      return (
        <span className="text-xs text-muted-foreground">
          {order.shipping?.carrier || '—'}
        </span>
      );
    
    case 'sena':
      return (
        <span className="text-xs text-muted-foreground">
          {formatCurrency(totalDeposit)}
        </span>
      );
    
    case 'valor':
      return (
        <span className="text-xs text-muted-foreground">
          {formatCurrency(totalValue)}
        </span>
      );
    
    case 'restante':
      return (
        <span className={`text-xs font-medium ${totalRemaining > 0 ? 'text-red-500' : 'text-green-500'}`}>
          {formatCurrency(totalRemaining)}
        </span>
      );
    
    case 'prioridad':
      return hasPriority ? (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-600 text-white">
          PRIO
        </span>
      ) : (
        <span className="text-muted-foreground/60 text-xs">—</span>
      );
    
    case 'fabricacion':
      const fabricationStates = [...new Set(order.items.map(item => item.fabricationState))];
      return (
        <span className="text-xs text-muted-foreground">
          {fabricationStates.length > 1 ? 'Múltiple' : fabricationStates[0] || '—'}
        </span>
      );
    
    case 'venta':
      const saleStates = [...new Set(order.items.map(item => item.saleState))];
      return (
        <span className="text-xs text-muted-foreground">
          {saleStates.length > 1 ? 'Múltiple' : saleStates[0] || '—'}
        </span>
      );
    
    case 'envioEstado':
      const shippingStates = [...new Set(order.items.map(item => item.shippingState))];
      return (
        <span className="text-xs text-muted-foreground">
          {shippingStates.length > 1 ? 'Múltiple' : shippingStates[0] || '—'}
        </span>
      );
    
    case 'seguimiento':
      return (
        <span className="text-xs text-muted-foreground">
          {order.shipping?.trackingNumber || 'Sin asignar'}
        </span>
      );
    
    case 'base':
      const baseFiles = order.items.filter(item => item.files?.baseUrl).length;
      return (
        <span className="text-xs text-muted-foreground">
          {baseFiles}/{totalItems}
        </span>
      );
    
    case 'vector':
      const vectorFiles = order.items.filter(item => item.files?.vectorUrl).length;
      return (
        <span className="text-xs text-muted-foreground">
          {vectorFiles}/{totalItems}
        </span>
      );
    
    case 'foto':
      return (
        <div className="w-8 h-8 border-2 border-dashed border-muted-foreground/30 rounded flex items-center justify-center">
          <span className="text-xs text-muted-foreground/50">📷</span>
        </div>
      );
    
    default:
      return <span className="text-xs text-muted-foreground">—</span>;
  }
}
