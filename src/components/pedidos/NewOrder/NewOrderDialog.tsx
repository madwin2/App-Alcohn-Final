import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NewOrderStepForm } from './NewOrderStepForm';
import { NewOrderFormData, Order, OrderItem } from '@/lib/types/index';
import { useToast } from '@/components/ui/use-toast';
import { useSound } from '@/lib/hooks/useSound';
import { useOrders } from '@/lib/hooks/useOrders';
import { useState } from 'react';
import { notifyOrderRegistered } from '@/lib/supabase/services/orders.service';
import type { SavedDesignData } from './newOrderDesignUtils';

interface NewOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Opcional: inyectar funciones desde la página (recomendado) para que el estado de la tabla
   * se actualice sin refrescar. Si no se provee, el dialog usa su propio useOrders (estado aislado).
   */
  createOrder?: (formData: NewOrderFormData) => Promise<Order>;
  addStampToOrder?: (
    orderId: string,
    item: Partial<OrderItem>,
    files?: { base?: File; vector?: File; photo?: File }
  ) => Promise<any>;
  fetchOrders?: () => Promise<void>;
}

export type SaveDesignOptions = {
  /** Si se indica, reemplaza el diseño en ese índice en lugar de agregar uno nuevo. */
  index?: number;
  createOrder?: boolean;
  /** Tras guardar el primer diseño, pasar al paso 3 para agregar más. */
  advanceToStep3?: boolean;
};

export function NewOrderDialog({
  open,
  onOpenChange,
  createOrder: createOrderProp,
  addStampToOrder: addStampToOrderProp,
  fetchOrders: fetchOrdersProp,
}: NewOrderDialogProps) {
  const { toast } = useToast();
  const { playSound } = useSound();
  const ordersApi = useOrders();
  const createOrder = createOrderProp ?? ordersApi.createOrder;
  const addStampToOrder = addStampToOrderProp ?? ordersApi.addStampToOrder;
  const fetchOrders = fetchOrdersProp ?? ordersApi.fetchOrders;
  const [currentStep, setCurrentStep] = useState(1);
  const [customerData, setCustomerData] = useState<NewOrderFormData['customer'] | null>(null);
  const [skipConfirmationWebhook, setSkipConfirmationWebhook] = useState(false);
  const [designs, setDesigns] = useState<SavedDesignData[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleStepSubmit = (stepData: { customer?: NewOrderFormData['customer']; skipConfirmationWebhook?: boolean }, step: number) => {
    if (step === 1) {
      setCustomerData(stepData.customer!);
      setSkipConfirmationWebhook(stepData.skipConfirmationWebhook === true);
      setCurrentStep(2);
    }
  };

  const handleDesignSave = (designData: SavedDesignData, options: SaveDesignOptions = {}) => {
    setDesigns((prev) => {
      const updated =
        options.index !== undefined
          ? prev.map((d, i) => (i === options.index ? designData : d))
          : [...prev, designData];

      if (options.createOrder && customerData) {
        setTimeout(() => {
          handleFinalSubmitWithDesigns(updated, customerData);
        }, 100);
      }

      return updated;
    });

    if (options.advanceToStep3) {
      setCurrentStep(3);
    }
  };

  const handleFinalSubmit = async () => {
    if (!customerData || designs.length === 0) {
      toast({
        title: 'Error',
        description: 'Debe completar la información del cliente y agregar al menos un diseño',
        variant: 'destructive',
      });
      return;
    }
    handleFinalSubmitWithDesigns(designs, customerData);
  };

  const handleFinalSubmitWithDesigns = async (
    designsToUse: SavedDesignData[],
    customerToUse: NewOrderFormData['customer'],
  ) => {
    if (!customerToUse || designsToUse.length === 0) {
      toast({
        title: 'Error',
        description: 'Debe completar la información del cliente y agregar al menos un diseño',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSubmitting(true);

      const firstDesign = designsToUse[0];
      const orderData: NewOrderFormData = {
        customer: customerToUse,
        order: {
          ...firstDesign.order,
          requestedHeightMm: firstDesign.order.requestedHeightMm || firstDesign.order.requestedWidthMm,
        },
        values: firstDesign.values,
        shipping: firstDesign.shipping,
        states: firstDesign.states,
        files: firstDesign.files || {},
      };

      const createdOrder = await createOrder(orderData);

      for (let i = 1; i < designsToUse.length; i++) {
        const design = designsToUse[i];
        await addStampToOrder(
          createdOrder.id,
          {
            designName: design.order.designName,
            requestedWidthMm: design.order.requestedWidthMm,
            requestedHeightMm: design.order.requestedHeightMm || design.order.requestedWidthMm,
            itemType: design.order.itemType || 'SELLO',
            stampType: design.order.stampType,
            itemConfig: {
              soldadorPower: design.order.soldadorPower,
              abecedarioTipografia: design.order.abecedarioTipografia,
              abecedarioAlturaMm: design.order.abecedarioAlturaMm,
              abecedarioCase: design.order.abecedarioCase,
              abecedarioExtraLetters: design.order.abecedarioExtraLetters,
            },
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
          },
          design.files,
        );
      }

      await fetchOrders();

      if (!skipConfirmationWebhook) {
        await notifyOrderRegistered(createdOrder);
      }

      playSound('success');

      toast({
        title: '¡Pedido creado!',
        description: `Se ha creado el pedido con ${designsToUse.length} diseño(s) para ${customerToUse.firstName} ${customerToUse.lastName}`,
      });

      setCurrentStep(1);
      setCustomerData(null);
      setSkipConfirmationWebhook(false);
      setDesigns([]);
      onOpenChange(false);
    } catch (error) {
      console.error('Error creating order:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudo crear el pedido',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setCurrentStep(1);
    setCustomerData(null);
    setSkipConfirmationWebhook(false);
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

  const handleCreateOrder = (currentDesign?: SavedDesignData, editIndex?: number) => {
    if (currentDesign) {
      handleDesignSave(currentDesign, {
        index: editIndex,
        createOrder: true,
      });
      return;
    }

    if (designs.length === 0) {
      toast({
        title: 'Error',
        description: 'Debe agregar al menos un diseño antes de crear el pedido',
        variant: 'destructive',
      });
      return;
    }
    handleFinalSubmit();
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
          onDesignSave={handleDesignSave}
          onCancel={handleCancel}
          onBack={handleBack}
          onCreateOrder={handleCreateOrder}
          initialData={{
            ...(customerData ? { customer: customerData } : {}),
            skipConfirmationWebhook,
          }}
          savedDesigns={designs}
          isSubmitting={isSubmitting}
        />
      </DialogContent>
    </Dialog>
  );
}
