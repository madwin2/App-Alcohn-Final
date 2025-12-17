import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NewOrderStepForm } from './NewOrderStepForm';
import { NewOrderFormData } from '@/lib/types/index';
import { useToast } from '@/components/ui/use-toast';
import { useSound } from '@/lib/hooks/useSound';
import { useOrders } from '@/lib/hooks/useOrders';
import { useState } from 'react';

interface NewOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface DesignData {
  order: NewOrderFormData['order'];
  values: NewOrderFormData['values'];
  shipping: NewOrderFormData['shipping'];
  states: NewOrderFormData['states'];
  files?: NewOrderFormData['files'];
}

export function NewOrderDialog({ open, onOpenChange }: NewOrderDialogProps) {
  const { toast } = useToast();
  const { playSound } = useSound();
  const { createOrder, addStampToOrder, fetchOrders } = useOrders();
  const [currentStep, setCurrentStep] = useState(1);
  const [customerData, setCustomerData] = useState<NewOrderFormData['customer'] | null>(null);
  const [designs, setDesigns] = useState<DesignData[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleStepSubmit = (stepData: any, step: number, shouldCreateOrder: boolean = false) => {
    if (step === 1) {
      setCustomerData(stepData.customer);
      setCurrentStep(2);
    } else if (step === 2) {
      // Agregar diseño a la lista
      const designData: DesignData = {
        order: stepData.order,
        values: stepData.values,
        shipping: stepData.shipping,
        states: stepData.states,
        files: stepData.files,
      };
      setDesigns(prev => {
        const updated = [...prev, designData];
        // Si se debe crear el pedido, hacerlo después de actualizar el estado
        if (shouldCreateOrder) {
          // Capturar customerData en el closure
          const currentCustomerData = customerData;
          // Usar el estado actualizado en el callback
          setTimeout(() => {
            // Acceder al estado más reciente usando una función
            setDesigns(currentDesigns => {
              // currentDesigns ya incluye el diseño recién agregado
              if (currentDesigns.length > 0 && currentCustomerData) {
                handleFinalSubmitWithDesigns(currentDesigns, currentCustomerData);
              }
              return currentDesigns; // No modificar el estado, solo usarlo
            });
          }, 100);
        }
        return updated;
      });
      
      if (!shouldCreateOrder) {
        // No crear pedido, solo avanzar al paso 3 para agregar otro diseño
        setCurrentStep(3);
      }
    } else if (step === 3) {
      // Agregar otro diseño a la lista
      const designData: DesignData = {
        order: stepData.order,
        values: stepData.values,
        shipping: stepData.shipping,
        states: stepData.states,
        files: stepData.files,
      };
      setDesigns(prev => {
        const updated = [...prev, designData];
        // Si se debe crear el pedido, hacerlo después de actualizar el estado
        if (shouldCreateOrder) {
          // Capturar customerData en el closure
          const currentCustomerData = customerData;
          // Usar el estado actualizado en el callback
          setTimeout(() => {
            // Acceder al estado más reciente usando una función
            setDesigns(currentDesigns => {
              // currentDesigns ya incluye el diseño recién agregado
              if (currentDesigns.length > 0 && currentCustomerData) {
                handleFinalSubmitWithDesigns(currentDesigns, currentCustomerData);
              }
              return currentDesigns; // No modificar el estado, solo usarlo
            });
          }, 100);
        }
        return updated;
      });
      // Permanecer en el paso 3 para agregar más diseños (a menos que se deba crear)
    }
  };

  const handleFinalSubmit = async () => {
    if (!customerData || designs.length === 0) {
      toast({
        title: "Error",
        description: "Debe completar la información del cliente y agregar al menos un diseño",
        variant: "destructive",
      });
      return;
    }
    handleFinalSubmitWithDesigns(designs, customerData);
  };

  const handleFinalSubmitWithDesigns = async (designsToUse: DesignData[], customerToUse: NewOrderFormData['customer']) => {
    if (!customerToUse || designsToUse.length === 0) {
      toast({
        title: "Error",
        description: "Debe completar la información del cliente y agregar al menos un diseño",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      
      // Crear el pedido con el primer diseño
      const firstDesign = designsToUse[0];
      const orderData: NewOrderFormData = {
        customer: customerToUse,
        order: {
          ...firstDesign.order,
          requestedHeightMm: firstDesign.order.requestedHeightMm || firstDesign.order.requestedWidthMm, // Usar altura si existe, sino usar el ancho
        },
        values: firstDesign.values,
        shipping: firstDesign.shipping,
        states: firstDesign.states,
        files: firstDesign.files || {},
      };
      
      const createdOrder = await createOrder(orderData);
      
      // Agregar los diseños restantes a la orden creada
      for (let i = 1; i < designsToUse.length; i++) {
        const design = designsToUse[i];
        // Usar addStampToOrder del hook para agregar sellos adicionales (actualiza el estado local)
        await addStampToOrder(createdOrder.id, {
          designName: design.order.designName,
          requestedWidthMm: design.order.requestedWidthMm,
          requestedHeightMm: design.order.requestedHeightMm || design.order.requestedWidthMm, // Usar altura si existe, sino usar el ancho
          stampType: design.order.stampType,
          notes: design.order.notes,
          itemValue: design.values.totalValue,
          fabricationState: design.states.fabrication,
          isPriority: design.states.isPriority,
          saleState: design.states.sale || 'SEÑADO',
          shippingState: design.states.shipping || 'SIN_ENVIO',
          depositValueItem: design.values.depositValue,
          restPaidAmountItem: design.values.totalValue - design.values.depositValue,
          paidAmountItemCached: design.values.depositValue,
          balanceItemCached: design.values.totalValue - design.values.depositValue,
          files: {},
          contact: {
            channel: customerToUse.channel,
            phoneE164: customerToUse.phoneE164,
          },
        }, design.files);
      }
      
      // Refrescar la orden completa después de agregar todos los sellos
      // Esto asegura que el estado local tenga todos los datos actualizados
      await fetchOrders();
      
      // Reproducir sonido de éxito
      playSound('success');
      
      toast({
        title: "¡Pedido creado!",
        description: `Se ha creado el pedido con ${designsToUse.length} diseño(s) para ${customerToUse.firstName} ${customerToUse.lastName}`,
      });
      
      // Reset form
      setCurrentStep(1);
      setCustomerData(null);
      setDesigns([]);
      onOpenChange(false);
    } catch (error) {
      console.error('Error creating order:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo crear el pedido",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setCurrentStep(1);
    setCustomerData(null);
    setDesigns([]);
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
    // Validar que el diseño actual esté completo antes de agregar otro
    // Esto se maneja en el formulario, aquí solo avanzamos al paso 3
    setCurrentStep(3);
  };

  const handleCreateOrder = (currentStepData?: any) => {
    // Si se pasa data del paso actual, agregarlo primero y luego crear el pedido
    if (currentStepData) {
      const step = currentStepData.step || 2;
      handleStepSubmit(currentStepData, step, true); // true = crear pedido después
    } else {
      // Si no hay diseños aún, esperar a que se agregue
      if (designs.length === 0) {
        toast({
          title: "Error",
          description: "Debe agregar al menos un diseño antes de crear el pedido",
          variant: "destructive",
        });
        return;
      }
      handleFinalSubmit();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-8 border border-white/20 shadow-[0_0_80px_rgba(255,255,255,0.075),0_0_150px_rgba(255,255,255,0.05),0_0_220px_rgba(255,255,255,0.025)]">
        <DialogHeader className="pb-6 border-b">
          <DialogTitle className="text-xl">
            Nuevo Pedido - Paso {currentStep} de {currentStep === 1 ? 3 : currentStep === 2 ? 3 : 'Final'}
            {designs.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({designs.length} diseño{designs.length > 1 ? 's' : ''} agregado{designs.length > 1 ? 's' : ''})
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <NewOrderStepForm 
          currentStep={currentStep}
          onStepSubmit={handleStepSubmit}
          onCancel={handleCancel}
          onBack={handleBack}
          onAddDesign={handleAddDesign}
          onCreateOrder={handleCreateOrder}
          initialData={customerData ? { customer: customerData } : {}}
          designsCount={designs.length}
          isSubmitting={isSubmitting}
        />
      </DialogContent>
    </Dialog>
  );
}