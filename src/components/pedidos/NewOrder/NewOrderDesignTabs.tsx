import { cn } from '@/lib/utils/cn';
import { getDesignTabLabel, type SavedDesignData } from './newOrderDesignUtils';

interface NewOrderDesignTabsProps {
  savedDesigns: SavedDesignData[];
  activeSlot: number | 'new';
  onSelectDesign: (index: number) => void;
  onSelectNew: () => void;
  className?: string;
}

export function NewOrderDesignTabs({
  savedDesigns,
  activeSlot,
  onSelectDesign,
  onSelectNew,
  className,
}: NewOrderDesignTabsProps) {
  if (savedDesigns.length === 0) return null;

  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-sm text-muted-foreground">
        {savedDesigns.length} diseño{savedDesigns.length > 1 ? 's' : ''} guardado
        {savedDesigns.length > 1 ? 's' : ''}. Tocá uno para revisar o editar antes de finalizar.
      </p>
      <div className="flex flex-wrap gap-2">
        {savedDesigns.map((design, index) => {
          const isActive = activeSlot === index;
          return (
            <button
              key={index}
              type="button"
              onClick={() => onSelectDesign(index)}
              className={cn(
                'rounded-md border px-3 py-1.5 text-sm transition-colors',
                isActive
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-white/15 bg-white/[0.03] text-muted-foreground hover:border-white/25 hover:text-foreground',
              )}
            >
              <span className="font-medium">{index + 1}.</span>{' '}
              {getDesignTabLabel(design, index)}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onSelectNew}
          className={cn(
            'rounded-md border border-dashed px-3 py-1.5 text-sm transition-colors',
            activeSlot === 'new'
              ? 'border-primary bg-primary/10 text-foreground'
              : 'border-white/15 text-muted-foreground hover:border-white/25 hover:text-foreground',
          )}
        >
          + Nuevo diseño
        </button>
      </div>
    </div>
  );
}
