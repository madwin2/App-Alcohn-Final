import { formatPhone, getChannelIcon } from '@/lib/utils/format';
import { Order } from '@/lib/types/index';
import { SvgIcon } from '@/components/ui/SvgIcon';
import { EditableInline } from './EditableInline';

interface CellContactoProps {
  order: Order;
  editingRowId?: string | null;
  onUpdate?: (orderId: string, updates: any) => void;
}

export function CellContacto({ order, editingRowId, onUpdate }: CellContactoProps) {
  const { customer } = order;
  const isEditing = editingRowId === order.id;
  
  if (isEditing) {
    return (
      <EditableInline 
        value={customer.phoneE164 || ''} 
        onCommit={(v) => onUpdate?.(order.id, { customer: { ...customer, phoneE164: v } })} 
        className="text-xs text-gray-400"
      />
    );
  }
  
  const contact = order.items[0]?.contact;
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
