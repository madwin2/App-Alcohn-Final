import type { Orden } from '@/lib/supabase/types';

interface CellClienteProps {
  order: Orden;
}

export function CellCliente({ order }: CellClienteProps) {
  // Acceder a los datos del cliente desde la relación de Supabase
  const cliente = (order as any).clientes;
  
  if (!cliente) {
    return (
      <div className="min-w-0">
        <p className="text-sm font-medium truncate text-gray-400">
          Sin cliente
        </p>
      </div>
    );
  }
  
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium truncate">
        {cliente.nombre}
      </p>
      <p className="text-xs text-muted-foreground truncate">
        {cliente.apellido}
      </p>
    </div>
  );
}
