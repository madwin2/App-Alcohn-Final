import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils/cn';

interface AbecedarioQuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  ariaLabel: string;
  compact?: boolean;
}

export function AbecedarioQuantityStepper({
  value,
  onChange,
  ariaLabel,
  compact = false,
}: AbecedarioQuantityStepperProps) {
  const setCount = (next: number) => {
    onChange(Number.isFinite(next) && next > 0 ? Math.floor(next) : 0);
  };

  return (
    <div className={cn('flex items-center gap-1', compact ? 'min-w-0' : 'w-full')}>
      <Input
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        aria-label={ariaLabel}
        value={value || ''}
        placeholder="0"
        onChange={(e) => setCount(Number(e.target.value))}
        className={cn(
          'text-center tabular-nums',
          compact ? 'h-8 w-14 px-1' : 'h-10 min-w-0 flex-1',
        )}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`Sumar 1 a ${ariaLabel}`}
        className={compact ? 'h-8 w-8 shrink-0' : 'h-10 w-10 shrink-0'}
        onClick={() => setCount((value || 0) + 1)}
      >
        <Plus className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      </Button>
    </div>
  );
}
