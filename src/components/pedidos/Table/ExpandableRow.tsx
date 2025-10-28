import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Order } from '@/lib/types';
import { Button } from '@/components/ui/button';

interface ExpandableRowProps {
  order: Order;
  children: React.ReactNode;
  summaryRow: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
}

export function ExpandableRow({ 
  order, 
  children, 
  summaryRow, 
  isExpanded, 
  onToggle 
}: ExpandableRowProps) {
  const hasMultipleItems = order.items.length > 1;

  if (!hasMultipleItems) {
    // Si solo tiene un item, mostrar la fila normal
    return <>{children}</>;
  }

  return (
    <>
      {/* Fila principal (resumen) */}
      <tr className="border-b hover:bg-muted/50">
        <td colSpan={100} className="p-0">
          <div className="flex items-center">
            {/* Botón de expansión */}
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              className="h-8 w-8 p-0 hover:bg-muted"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
            
            {/* Contenido de la fila resumen */}
            <div className="flex-1">
              {summaryRow}
            </div>
          </div>
        </td>
      </tr>
      
      {/* Filas expandidas (items individuales) */}
      {isExpanded && (
        <tr className="border-b bg-muted/20">
          <td colSpan={100} className="p-0">
            <div className="pl-8">
              {children}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
