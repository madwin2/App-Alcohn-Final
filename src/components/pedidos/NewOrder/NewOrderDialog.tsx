import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NewOrderStepForm } from './NewOrderStepForm';
import { NewOrderFormData } from '@/lib/types/index';
import { useToast } from '@/components/ui/use-toast';
import { useState } from 'react';

interface NewOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewOrderDialog({ open, onOpenChange }: NewOrderDialogProps) {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<Partial<NewOrderFormData>>({});

  const handleStepSubmit = (stepData: any, step: number) => {
    setFormData(prev => ({ ...prev, ...stepData }));
    
    if (step === 1) {
      setCurrentStep(2);
    } else if (step === 2) {
      handleFinalSubmit({ ...formData, ...stepData });
    } else if (step === 3) {
      handleFinalSubmit({ ...formData, ...stepData });
    }
  };

  const handleFinalSubmit = (data: NewOrderFormData) => {
    // Aquí iría la lógica para crear el pedido
    console.log('Creando pedido:', data);
    
    toast({
      title: "¡Pedido creado!",
      description: `Se ha creado el pedido para ${data.customer?.firstName} ${data.customer?.lastName}`,
    });
    
    // Reset form
    setCurrentStep(1);
    setFormData({});
    onOpenChange(false);
  };

  const handleCancel = () => {
    setCurrentStep(1);
    setFormData({});
    onOpenChange(false);
  };

  const handleBack = () => {
    if (currentStep === 3) {
      setCurrentStep(2);
    } else {
      setCurrentStep(1);
    }
  };

  const handleAddDesign = () => {
    setCurrentStep(3);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-8">
        <DialogHeader className="pb-6">
          <DialogTitle className="text-xl">
            Nuevo Pedido - Paso {currentStep} de 3
          </DialogTitle>
        </DialogHeader>
        <NewOrderStepForm 
          currentStep={currentStep}
          onStepSubmit={handleStepSubmit}
          onCancel={handleCancel}
          onBack={handleBack}
          onAddDesign={handleAddDesign}
          initialData={formData}
        />
      </DialogContent>
    </Dialog>
  );
}