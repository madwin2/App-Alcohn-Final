import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Order, StampType } from '@/lib/types/index';
import { getStampTypeIcon } from '@/lib/utils/format';
import { SvgIcon } from '@/components/ui/SvgIcon';
import { useState } from 'react';
import { MecanizadoPersonalizadoDialog } from '@/components/pedidos/MecanizadoPersonalizadoDialog';
import { describeMecanizado, MecanizadoPersonalizado, readMecanizado } from '@/lib/pedidos/mecanizadoPersonalizado';

interface CellTipoProps {
  order: Order;
  onTipoChange?: (orderId: string, newTipo: StampType) => void;
  /** Pasa a Personalizado (o edita) los sellos de la fila con esa configuración. */
  onMecanizadoChange?: (orderId: string, itemIds: string[], mecanizado: MecanizadoPersonalizado) => Promise<void> | void;
}

const EDIT_MECANIZADO = '__editar_mecanizado__';

const tipoOptions: { value: StampType; iconName: string; label: string }[] = [
  { value: '3MM', iconName: '3mm', label: '3MM' },
  { value: 'ALIMENTO', iconName: 'Hamburguesa', label: 'Alimento' },
  { value: 'CLASICO', iconName: 'CLASICO', label: 'Clásico' },
  { value: 'ABC', iconName: 'ABC', label: 'ABC' },
  { value: 'LACRE', iconName: 'LACRE', label: 'Lacre' },
  { value: 'PERSONALIZADO', iconName: 'PERSONALIZADO', label: 'Personalizado' }
];

export function CellTipo({ order, onTipoChange, onMecanizadoChange }: CellTipoProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const item = order.items[0];
  
  if (!item) return null;

  const handleValueChange = (value: string) => {
    // Personalizado pide la configuración antes de guardar el tipo.
    if ((value === 'PERSONALIZADO' || value === EDIT_MECANIZADO) && onMecanizadoChange) {
      setDialogOpen(true);
      return;
    }
    onTipoChange?.(order.id, value as StampType);
  };

  const saveMecanizado = async (mecanizado: MecanizadoPersonalizado) => {
    // Igual que el cambio de tipo: la fila resumen aplica a todos sus sellos; la expandida, a uno.
    await onMecanizadoChange?.(order.id, order.items.filter((i) => !i.itemType || i.itemType === 'SELLO').map((i) => i.id), mecanizado);
    setDialogOpen(false);
  };
  const isPersonalizado = item.stampType === 'PERSONALIZADO';
  const mecanizado = isPersonalizado ? readMecanizado(item.itemConfig?.mecanizado) : undefined;

  if (item.itemType && item.itemType !== 'SELLO') {
    return (
      <span className="text-xs text-muted-foreground">
        {item.itemType === 'ABECEDARIO'
          ? 'Abecedario'
          : item.itemType === 'SOLDADOR'
          ? 'Soldador'
          : item.itemType === 'MANGO_GOLPE'
          ? 'Mango de Golpe'
          : 'Base Remachadora'}
      </span>
    );
  }

  return (
    <>
    <Select value={item.stampType} onValueChange={handleValueChange}>
        <SelectTrigger title={mecanizado ? describeMecanizado(mecanizado) : undefined} className="w-full h-8 text-xs [&>svg]:hidden border-none bg-transparent hover:bg-gray-200/10 rounded-lg transition-colors">
          <SelectValue>
            <span className="flex items-center justify-center">
              {item.stampType !== 'CLASICO' && (
                <SvgIcon 
                  name={getStampTypeIcon(item.stampType)} 
                  size={20}
                  className="flex-shrink-0"
                />
              )}
            </span>
          </SelectValue>
        </SelectTrigger>
      <SelectContent>
        {tipoOptions.map((option) => (
          <SelectItem key={option.value} value={option.value} className="text-xs">
            <span className="flex items-center gap-2">
              <SvgIcon 
                name={option.iconName} 
                size={16}
                className="flex-shrink-0"
              />
              <span>{option.label}</span>
            </span>
          </SelectItem>
        ))}
        {isPersonalizado && onMecanizadoChange && (
          <SelectItem value={EDIT_MECANIZADO} className="text-xs">Editar personalización…</SelectItem>
        )}
      </SelectContent>
    </Select>
    <MecanizadoPersonalizadoDialog
      open={dialogOpen}
      value={mecanizado}
      designName={item.designName}
      onCancel={() => setDialogOpen(false)}
      onSave={saveMecanizado}
    />
    </>
  );
}
