import { formatPhone, getChannelIcon } from '@/lib/utils/format';
import { normalizePhoneDigits } from '@/lib/utils/shippingNormalization';
import { Order } from '@/lib/types/index';
import { SvgIcon } from '@/components/ui/SvgIcon';
import { useToast } from '@/components/ui/use-toast';
import { EditableInline } from './EditableInline';

interface CellContactoProps {
  order: Order;
  editingRowId?: string | null;
  onUpdate?: (orderId: string, updates: any) => void;
}

export function CellContacto({ order, editingRowId, onUpdate }: CellContactoProps) {
  const { toast } = useToast();
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

  const digitsToCopy = normalizePhoneDigits(contact.phoneE164 || '');

  return (
    <div className="flex items-center gap-2 min-w-0">
      <SvgIcon 
        name={getChannelIcon(contact.channel)} 
        size={20}
        className="flex-shrink-0"
        title={contact.channel}
      />
      <button
        type="button"
        title={digitsToCopy ? 'Clic para copiar el número' : 'Sin número para copiar'}
        disabled={!digitsToCopy}
        onClick={(e) => {
          e.stopPropagation();
          if (!digitsToCopy) return;
          void navigator.clipboard.writeText(digitsToCopy).then(
            () => {
              toast({
                title: 'Teléfono copiado',
                description: digitsToCopy,
              });
            },
            () => {
              toast({
                title: 'No se pudo copiar',
                description: 'Permisos del portapapeles o HTTPS requerido.',
                variant: 'destructive',
              });
            },
          );
        }}
        className="text-xs text-gray-400 truncate min-w-0 text-left font-normal bg-transparent border-0 p-0 cursor-pointer hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50"
      >
        {formatPhone(contact.phoneE164)}
      </button>
    </div>
  );
}
