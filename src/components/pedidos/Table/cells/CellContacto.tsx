import { formatPhone, getChannelIcon } from '@/lib/utils/format';
import { SvgIcon } from '@/components/ui/SvgIcon';
import type { Orden } from '@/lib/supabase/types';

interface CellContactoProps {
  order: Orden;
}

export function CellContacto({ order }: CellContactoProps) {
  // Acceder a los datos del cliente desde la relación de Supabase
  const cliente = (order as any).clientes;
  
  if (!cliente) return null;

  return (
    <div className="flex items-center gap-2 min-w-0">
      <SvgIcon 
        name={getChannelIcon(cliente.medio_contacto || 'WHATSAPP')} 
        size={20}
        className="flex-shrink-0"
        title={cliente.medio_contacto}
      />
      <span className="text-xs text-gray-400 truncate">
        {formatPhone(cliente.telefono)}
      </span>
    </div>
  );
}
