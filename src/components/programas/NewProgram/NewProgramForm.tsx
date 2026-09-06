import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { Program, ProgramMachineType, ProgramStamp } from '@/lib/types/index';
import { StampsSelectionDialog } from '../StampsSelection/StampsSelectionDialog';
import { Plus } from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';
import { ProgramServiceError } from '@/lib/supabase/services/programs.service';
import { generateProgramName } from '@/lib/programas/programName';
import { formatLengthByPlanchuela, accumulateLengthByPlanchuela, DEFAULT_PERDIDA_CORTE_CM } from '@/lib/programas/material';

const programSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  description: z.string().optional(),
  machine: z.enum(['C', 'G', 'XL', 'ABC']),
  productionDate: z.date({
    required_error: 'La fecha de producción es requerida',
  }),
});

type ProgramFormData = z.infer<typeof programSchema>;

interface NewProgramFormProps {
  onSuccess: () => void;
  onCancel?: () => void;
  createProgram: (program: Partial<Program>) => Promise<Program>;
}

const generateName = (
  date: Date,
  machine: ProgramMachineType | undefined,
  stampCount: number,
): string => {
  if (!date || !machine) return '';
  return generateProgramName({ date, machine, stampCount });
};

export function NewProgramForm({ onSuccess, onCancel, createProgram }: NewProgramFormProps) {
  const [showStampsDialog, setShowStampsDialog] = useState(false);
  const [selectedStamps, setSelectedStamps] = useState<ProgramStamp[]>([]);
  const [isNameManuallyEdited, setIsNameManuallyEdited] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProgramFormData>({
    resolver: zodResolver(programSchema),
    defaultValues: {
      productionDate: new Date(),
      description: '',
    },
  });

  const productionDate = watch('productionDate');
  const machine = watch('machine');
  const name = watch('name');

  useEffect(() => {
    if (!isNameManuallyEdited && productionDate && machine) {
      const generatedName = generateName(productionDate, machine, selectedStamps.length);
      if (generatedName && generatedName !== name) {
        setValue('name', generatedName, { shouldValidate: false });
      }
    }
  }, [productionDate, machine, selectedStamps.length, isNameManuallyEdited, name, setValue]);

  const materialPreview = formatLengthByPlanchuela(
    accumulateLengthByPlanchuela(
      selectedStamps.map((s) => ({
        anchoRealCm: s.anchoRealCm,
        largoRealCm: s.largoRealCm,
        tipoPlanchuela: s.tipoPlanchuela,
      })),
      DEFAULT_PERDIDA_CORTE_CM,
    ),
  );

  const handleAddStamps = (stamps: ProgramStamp[]) => {
    setSelectedStamps((prev) => {
      const ids = new Set(prev.map((s) => s.id));
      return [...prev, ...stamps.filter((s) => !ids.has(s.id))];
    });
    setShowStampsDialog(false);
  };

  const onSubmit = async (data: ProgramFormData) => {
    try {
      await createProgram({
        name: data.name,
        description: data.description || '',
        machine: data.machine,
        productionDate: format(data.productionDate, 'yyyy-MM-dd'),
        stamps: selectedStamps,
        stampCount: selectedStamps.length,
      });

      toast({
        title: 'Programa creado',
        description: 'El programa se ha creado exitosamente.',
      });

      onSuccess();
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof ProgramServiceError || error instanceof Error
            ? error.message
            : 'No se pudo crear el programa. Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="productionDate">Fecha de Producción</Label>
          <div className="relative">
            <div className="flex items-center h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <DatePicker
                date={productionDate}
                onDateChange={(date) => {
                  if (date) setValue('productionDate', date, { shouldValidate: true });
                }}
                placeholder="Selecciona la fecha"
                className="w-full justify-start"
              />
            </div>
          </div>
          {errors.productionDate && (
            <p className="text-sm text-destructive">{errors.productionDate.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="machine">Máquina</Label>
          <Select
            value={watch('machine')}
            onValueChange={(value) => setValue('machine', value as ProgramMachineType, { shouldValidate: true })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecciona la máquina" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="C">Máquina Chica (C)</SelectItem>
              <SelectItem value="G">Máquina Grande (G)</SelectItem>
              <SelectItem value="XL">Máquina XL</SelectItem>
              <SelectItem value="ABC">Máquina ABC (sin paquete ZIP)</SelectItem>
            </SelectContent>
          </Select>
          {errors.machine && <p className="text-sm text-destructive">{errors.machine.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">Nombre del Programa</Label>
          <Input
            id="name"
            {...register('name')}
            placeholder="Se generará automáticamente"
            onChange={(e) => {
              setIsNameManuallyEdited(true);
              register('name').onChange(e);
            }}
          />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Descripción (opcional)</Label>
          <Textarea
            id="description"
            {...register('description')}
            placeholder="Notas del programa"
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label>Sellos</Label>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!machine) {
                toast({
                  title: 'Elegí una máquina',
                  description: 'Primero seleccioná la máquina del programa.',
                  variant: 'destructive',
                });
                return;
              }
              setShowStampsDialog(true);
            }}
            className="w-full justify-start"
            disabled={!machine}
          >
            <Plus className="h-4 w-4 mr-2" />
            {selectedStamps.length > 0
              ? `${selectedStamps.length} sello${selectedStamps.length !== 1 ? 's' : ''} seleccionado${selectedStamps.length !== 1 ? 's' : ''}`
              : 'Agregar sellos al programa'}
          </Button>
          {selectedStamps.length > 0 && (
            <button
              type="button"
              className="text-xs text-muted-foreground underline"
              onClick={() => setSelectedStamps([])}
            >
              Limpiar selección
            </button>
          )}
          {materialPreview.length > 0 && (
            <div className="text-xs text-muted-foreground space-y-0.5 pt-1">
              <div className="font-medium text-foreground">Largo estimado:</div>
              {materialPreview.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creando...' : 'Crear Programa'}
        </Button>
      </div>

      {machine && (
        <StampsSelectionDialog
          isOpen={showStampsDialog}
          onClose={() => setShowStampsDialog(false)}
          onAddStamps={handleAddStamps}
          programId="new"
          machine={machine}
          excludeStampIds={selectedStamps.map((s) => s.id)}
        />
      )}
    </form>
  );
}
