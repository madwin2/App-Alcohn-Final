import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  extraLettersButtonLabel,
  extraLettersCount,
  type AbecedarioFormFields,
} from '@/lib/abecedario/abecedarioConfig';
import { AbecedarioQuantityStepper } from './AbecedarioQuantityStepper';
import { AbecedarioExtraLettersDialog } from './AbecedarioExtraLettersDialog';

interface AbecedarioFieldsProps {
  values: AbecedarioFormFields;
  onChange: (patch: Partial<AbecedarioFormFields>) => void;
  labeled?: boolean;
}

export function AbecedarioFields({ values, onChange, labeled = false }: AbecedarioFieldsProps) {
  const [extraOpen, setExtraOpen] = useState(false);
  const extras = extraLettersCount(values);

  const extraButton = (
    <Button
      type="button"
      variant="outline"
      className="w-full justify-start font-normal"
      onClick={() => setExtraOpen(true)}
    >
      <span className="truncate">{extraLettersButtonLabel(values)}</span>
      {labeled && extras > 0 ? (
        <span className="ml-auto text-xs text-muted-foreground">{extras}</span>
      ) : null}
    </Button>
  );

  return (
    <>
      <div className={labeled ? 'col-span-2 grid grid-cols-2 gap-4' : 'col-span-6 grid grid-cols-6 gap-4'}>
      {labeled ? (
        <>
          <div>
            <Label>Tipografía</Label>
            <Input
              value={values.abecedarioTipografia || ''}
              onChange={(e) => onChange({ abecedarioTipografia: e.target.value })}
            />
          </div>
          <div>
            <Label>Altura de letra (mm)</Label>
            <Input
              type="number"
              value={values.abecedarioAlturaMm || ''}
              onChange={(e) => onChange({ abecedarioAlturaMm: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Mayúscula</Label>
            <AbecedarioQuantityStepper
              ariaLabel="Juegos de mayúscula"
              value={values.abecedarioMayusculas ?? 0}
              onChange={(value) => onChange({ abecedarioMayusculas: value })}
            />
          </div>
          <div>
            <Label>Minúscula</Label>
            <AbecedarioQuantityStepper
              ariaLabel="Juegos de minúscula"
              value={values.abecedarioMinusculas ?? 0}
              onChange={(value) => onChange({ abecedarioMinusculas: value })}
            />
          </div>
          <div className="col-span-2">
            <Label>Letras extras</Label>
            {extraButton}
          </div>
        </>
      ) : (
        <>
          <div className="col-span-2">
            <Input
              type="number"
              placeholder="Altura de letra (mm)"
              value={values.abecedarioAlturaMm || ''}
              onChange={(e) => onChange({ abecedarioAlturaMm: Number(e.target.value) })}
            />
          </div>
          <div className="col-span-2">
            <AbecedarioQuantityStepper
              ariaLabel="Juegos de mayúscula"
              value={values.abecedarioMayusculas ?? 0}
              onChange={(value) => onChange({ abecedarioMayusculas: value })}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Mayúscula</p>
          </div>
          <div className="col-span-2">
            <AbecedarioQuantityStepper
              ariaLabel="Juegos de minúscula"
              value={values.abecedarioMinusculas ?? 0}
              onChange={(value) => onChange({ abecedarioMinusculas: value })}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Minúscula</p>
          </div>
          <div className="col-span-2">{extraButton}</div>
        </>
      )}
      </div>

      <AbecedarioExtraLettersDialog
        open={extraOpen}
        onOpenChange={setExtraOpen}
        values={values}
        onChange={onChange}
      />
    </>
  );
}
