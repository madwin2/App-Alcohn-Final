import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { MachineType, ProgramStamp } from '@/lib/types/index';
import { StampsSelectionDialog } from '../StampsSelection/StampsSelectionDialog';
import { Plus } from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';

const programSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  description: z.string().min(1, 'La descripción es requerida'),
  machine: z.enum(['C', 'G', 'XL', 'ABC']),
  productionDate: z.date({
    required_error: 'La fecha de producción es requerida',
  }),
});

type ProgramFormData = z.infer<typeof programSchema>;

interface NewProgramFormProps {
  onSuccess: () => void;
}

// Función para generar el nombre del programa automáticamente
// Formato: "DD MMM x(CANTIDAD) y(MÁQUINA)" - Ejemplo: "15 ENE x12 yC"
const generateProgramName = (date: Date, machine: MachineType | undefined, stampCount: number): string => {
  if (!date || !machine) return '';
  
  const day = format(date, 'd', { locale: es }); // Día sin cero inicial si es < 10
  const month = format(date, 'MMM', { locale: es }).toUpperCase(); // Mes abreviado en mayúsculas
  const machineLabel = machine === 'XL' ? 'XL' : machine;
  
  return `${day} ${month} x${stampCount} y${machineLabel}`;
};

// Formulario para crear un nuevo programa con validación
export function NewProgramForm({ onSuccess }: NewProgramFormProps) {
  const [showStampsDialog, setShowStampsDialog] = useState(false);
  const [selectedStamps, setSelectedStamps] = useState<ProgramStamp[]>([]);
  const [isNameManuallyEdited, setIsNameManuallyEdited] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<ProgramFormData>({
    resolver: zodResolver(programSchema),
    defaultValues: {
      productionDate: new Date()
    }
  });

  const productionDate = watch('productionDate');
  const machine = watch('machine');
  const name = watch('name');

  // Generar nombre automáticamente cuando cambien fecha, máquina o cantidad de sellos
  useEffect(() => {
    if (!isNameManuallyEdited && productionDate && machine) {
      const generatedName = generateProgramName(productionDate, machine, selectedStamps.length);
      if (generatedName && generatedName !== name) {
        setValue('name', generatedName, { shouldValidate: false });
      }
    }
  }, [productionDate, machine, selectedStamps.length, isNameManuallyEdited, name, setValue]);

  const handleAddStamps = (stamps: ProgramStamp[]) => {
    setSelectedStamps(prev => [...prev, ...stamps]);
    setShowStampsDialog(false);
  };

  const onSubmit = async (data: ProgramFormData) => {
    try {
      // Aquí iría la lógica para crear el programa
      const programData = {
        ...data,
        productionDate: format(data.productionDate, 'yyyy-MM-dd'),
        stampCount: selectedStamps.length,
        stamps: selectedStamps
      };
      
      console.log('Creando programa:', programData);
      
      toast({
        title: "Programa creado",
        description: "El programa se ha creado exitosamente.",
      });
      
      onSuccess();
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo crear el programa. Inténtalo de nuevo.",
        variant: "destructive",
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="productionDate">Fecha de Producción</Label>
          <div className="relative">
            <div className="flex items-center h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
              <DatePicker
                date={productionDate}
                onDateChange={(date) => {
                  if (date) {
                    setValue('productionDate', date, { shouldValidate: true });
                  }
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
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Descripción</Label>
          <Textarea
            id="description"
            {...register('description')}
            placeholder="Describe el programa y su propósito"
            rows={3}
          />
          {errors.description && (
            <p className="text-sm text-destructive">{errors.description.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="machine">Máquina</Label>
          <Select
            value={watch('machine')}
            onValueChange={(value) => setValue('machine', value as MachineType)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecciona la máquina" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="C">Máquina Chica (C)</SelectItem>
              <SelectItem value="G">Máquina Grande (G)</SelectItem>
              <SelectItem value="XL">Máquina XL</SelectItem>
              <SelectItem value="ABC">Máquina ABC</SelectItem>
            </SelectContent>
          </Select>
          {errors.machine && (
            <p className="text-sm text-destructive">{errors.machine.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Sellos</Label>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowStampsDialog(true)}
            className="w-full justify-start"
          >
            <Plus className="h-4 w-4 mr-2" />
            {selectedStamps.length > 0
              ? `${selectedStamps.length} sello${selectedStamps.length !== 1 ? 's' : ''} seleccionado${selectedStamps.length !== 1 ? 's' : ''}`
              : 'Agregar sellos al programa'}
          </Button>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline">
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creando...' : 'Crear Programa'}
        </Button>
      </div>

      <StampsSelectionDialog
        isOpen={showStampsDialog}
        onClose={() => setShowStampsDialog(false)}
        onAddStamps={handleAddStamps}
        programId="new"
      />
    </form>
  );
}







