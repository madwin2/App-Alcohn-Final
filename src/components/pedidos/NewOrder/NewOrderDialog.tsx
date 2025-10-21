import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NewOrderStepForm } from './NewOrderStepForm';
import { NewOrderFormData } from '@/lib/types/index';
import { useToast } from '@/components/ui/use-toast';
import { useOrdersStore } from '@/lib/state/orders.store';
import { OrdersCompleteService } from '@/lib/supabase/services/orders-complete.service';
import { useState } from 'react';

interface NewOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewOrderDialog({ open, onOpenChange }: NewOrderDialogProps) {
  const { toast } = useToast();
  const { fetchOrders } = useOrdersStore();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<Partial<NewOrderFormData>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleFinalSubmit = async (data: NewOrderFormData) => {
    setIsSubmitting(true);
    
    try {
      // Mapear los datos del formulario a la estructura de Supabase
      const orderData = {
        cliente: {
          nombre: data.customer?.firstName || '',
          apellido: data.customer?.lastName || '',
          telefono: data.customer?.phoneE164 || '',
          mail: data.customer?.email || undefined,
          medio_contacto: data.customer?.channel?.toLowerCase() as any,
          dni: undefined
        },
        orden: {
          empresa_envio: data.shipping?.carrier?.toLowerCase() as any,
          tipo_envio: data.shipping?.service?.toLowerCase() as any,
          estado_orden: 'Señado' as const,
          estado_envio: data.states?.shipping?.toLowerCase() as any
        },
        sello: {
          tipo: data.order?.stampType?.toLowerCase() as any,
          valor: data.values?.totalValue || 0,
          senia: data.values?.depositValue || 0,
          diseno: data.order?.designName || undefined,
          nota: data.order?.notes || undefined,
          estado_fabricacion: data.states?.fabrication?.toLowerCase() as any,
          estado_venta: data.states?.sale?.toLowerCase() as any,
          largo_real: data.order?.requestedWidthMm || undefined,
          ancho_real: data.order?.requestedHeightMm || undefined
        }
      };

      // Crear el pedido completo
      const result = await OrdersCompleteService.createCompleteOrder(orderData);
      
      // Recargar la lista de órdenes
      await fetchOrders();
      
      toast({
        title: "¡Pedido creado!",
        description: `Se ha creado el pedido para ${data.customer?.firstName} ${data.customer?.lastName}`,
      });
      
      // Reset form
      setCurrentStep(1);
      setFormData({});
      onOpenChange(false);
      
    } catch (error) {
      console.error('Error creating order:', error);
      toast({
        title: "Error",
        description: "No se pudo crear el pedido. Inténtalo de nuevo.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
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