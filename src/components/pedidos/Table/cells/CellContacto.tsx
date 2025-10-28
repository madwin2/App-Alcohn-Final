import { formatPhone, getChannelIcon } from '@/lib/utils/format';
import { Order } from '@/lib/types/index';
import { SvgIcon } from '@/components/ui/SvgIcon';

interface CellContactoProps {
  order: Order;
}

export function CellContacto({ order }: CellContactoProps) {
  const { customer, items } = order;
  const contact = items[0]?.contact; // Asumiendo que todos los items tienen el mismo contacto
  
  if (!contact) return null;

  return (
    <div className="flex items-center gap-2 min-w-0">
      <SvgIcon 
        name={getChannelIcon(contact.channel)} 
        size={20}
        className="flex-shrink-0"
        title={contact.channel}
      />
      <span className="text-xs text-gray-400 truncate">
        {formatPhone(contact.phoneE164)}
      </span>
    </div>
  );
}
