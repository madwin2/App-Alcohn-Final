import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NewOrderStepForm } from './NewOrderStepForm';
import { NewOrderFormData } from '@/lib/types/index';
import { useToast } from '@/components/ui/use-toast';
import { useOrdersStore } from '@/lib/state/orders.store';
import { OrdersCompleteService } from '@/lib/supabase/services/orders-complete.service';
import { useState } from 'react';

// Funciones de mapeo para convertir valores del formulario a valores de Supabase
const mapChannelToSupabase = (channel: string | undefined) => {
  console.log('mapChannelToSupabase input:', channel);
  const mapping: Record<string, string> = {
    'WHATSAPP': 'Whatsapp',
    'INSTAGRAM': 'Instagram', 
    'FACEBOOK': 'Facebook',
    'MAIL': 'Mail'
  };
  const result = channel ? mapping[channel] || null : null;
  console.log('mapChannelToSupabase output:', result);
  return result;
};

const mapCarrierToSupabase = (carrier: string | undefined) => {
  const mapping: Record<string, string> = {
    'ANDREANI': 'Andreani',
    'CORREO_ARGENTINO': 'Correo Argentino',
    'VIA_CARGO': 'Via Cargo',
    'OTRO': 'Retiro'
  };
  return carrier ? mapping[carrier] || null : null;
};

const mapServiceToSupabase = (service: string | undefined) => {
  const mapping: Record<string, string> = {
    'DOMICILIO': 'Domicilio',
    'SUCURSAL': 'Sucursal'
  };
  return service ? mapping[service] || null : null;
};

const mapShippingStateToSupabase = (state: string | undefined) => {
  const mapping: Record<string, string> = {
    'SIN_ENVIO': 'Sin envio',
    'HACER_ETIQUETA': 'Hacer Etiqueta',
    'ETIQUETA_LISTA': 'Etiqueta Lista',
    'DESPACHADO': 'Despachado',
    'SEGUIMIENTO_ENVIADO': 'Seguimiento Enviado'
  };
  return state ? mapping[state] || null : null;
};

const mapStampTypeToSupabase = (type: string | undefined) => {
  const mapping: Record<string, string> = {
    '3MM': '3mm',
    'ALIMENTO': 'Alimento',
    'CLASICO': 'Clasico',
    'ABC': 'ABC',
    'LACRE': 'Lacre'
  };
  return type ? mapping[type] || null : null;
};

const mapFabricationStateToSupabase = (state: string | undefined) => {
  const mapping: Record<string, string> = {
    'SIN_HACER': 'Sin Hacer',
    'HACIENDO': 'Haciendo',
    'VERIFICAR': 'Verificar',
    'HECHO': 'Hecho',
    'REHACER': 'Rehacer',
    'PRIORIDAD': 'Prioridad',
    'RETOCAR': 'Retocar'
  };
  return state ? mapping[state] || null : null;
};

const mapSaleStateToSupabase = (state: string | undefined) => {
  const mapping: Record<string, string> = {
    'SEÑADO': 'Señado',
    'FOTO_ENVIADA': 'Foto',
    'TRANSFERIDO': 'Transferido',
    'DEUDOR': 'Señado'
  };
  return state ? mapping[state] || null : null;
};

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
          medio_contacto: mapChannelToSupabase(data.customer?.channel),
          dni: undefined
        },
        orden: {
          empresa_envio: mapCarrierToSupabase(data.shipping?.carrier),
          tipo_envio: mapServiceToSupabase(data.shipping?.service),
          estado_orden: 'Señado' as const,
          estado_envio: mapShippingStateToSupabase(data.states?.shipping)
        },
        sello: {
          tipo: mapStampTypeToSupabase(data.order?.stampType),
          valor: data.values?.totalValue || 0,
          senia: data.values?.depositValue || 0,
          diseno: data.order?.designName || undefined,
          nota: data.order?.notes || undefined,
          estado_fabricacion: mapFabricationStateToSupabase(data.states?.fabrication),
          estado_venta: mapSaleStateToSupabase(data.states?.sale),
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