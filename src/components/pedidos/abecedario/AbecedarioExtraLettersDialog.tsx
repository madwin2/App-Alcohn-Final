import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ABECEDARIO_LETTERS,
  compactExtraLetterCounts,
  extraLettersCount,
  type AbecedarioFormFields,
} from '@/lib/abecedario/abecedarioConfig';
import { AbecedarioQuantityStepper } from './AbecedarioQuantityStepper';

interface AbecedarioExtraLettersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  values: AbecedarioFormFields;
  onChange: (patch: Partial<AbecedarioFormFields>) => void;
}

export function AbecedarioExtraLettersDialog({
  open,
  onOpenChange,
  values,
  onChange,
}: AbecedarioExtraLettersDialogProps) {
  const counts = compactExtraLetterCounts(values.abecedarioExtraLetterCounts);
  const selected = extraLettersCount(values);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Letras extras</DialogTitle>
          <DialogDescription>
            Sumá las letras sueltas que van además de los juegos. {selected > 0 ? `${selected} extra${selected === 1 ? '' : 's'} cargada${selected === 1 ? '' : 's'}.` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ABECEDARIO_LETTERS.map((letter) => (
            <div
              key={letter}
              className="flex items-center justify-between gap-2 rounded-md border border-border/70 px-2 py-1.5"
            >
              <span className="w-6 text-sm font-medium tabular-nums">{letter}</span>
              <AbecedarioQuantityStepper
                compact
                ariaLabel={`Letras extra ${letter}`}
                value={counts[letter] ?? 0}
                onChange={(value) =>
                  onChange({
                    abecedarioExtraLetterCounts: {
                      ...counts,
                      [letter]: value,
                    },
                  })
                }
              />
            </div>
          ))}
        </div>

        <div className="space-y-2 rounded-md border border-border/70 p-3">
          <Label>Caracteres especiales</Label>
          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-2 items-center">
            <AbecedarioQuantityStepper
              compact
              ariaLabel="Caracteres especiales"
              value={values.abecedarioSpecialCharsCount ?? 0}
              onChange={(value) => onChange({ abecedarioSpecialCharsCount: value })}
            />
            <Input
              placeholder="Cuáles son (ej. ñ, ü, @)"
              value={values.abecedarioSpecialCharsDescription ?? ''}
              onChange={(e) => onChange({ abecedarioSpecialCharsDescription: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Listo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
