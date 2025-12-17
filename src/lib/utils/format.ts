// Utilidades de formateo para la aplicación
import { FabricationState, OrderItem } from '@/lib/types/index';

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(date);
};

export const formatDateTime = (dateString: string): string => {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const formatPhone = (phoneE164: string): string => {
  // Remover el prefijo +549 y formatear como argentino
  const cleanPhone = phoneE164.replace(/^\+549/, '');
  if (cleanPhone.length === 10) {
    return `(${cleanPhone.slice(0, 3)}) ${cleanPhone.slice(3, 6)}-${cleanPhone.slice(6)}`;
  }
  return phoneE164;
};

export const formatDimensions = (width: number, height: number): string => {
  return `${width}×${height}mm`;
};

export const isDeadlineNear = (deadlineAt?: string | null): boolean => {
  if (!deadlineAt) return false;
  const deadline = new Date(deadlineAt);
  const now = new Date();
  const diffDays = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays <= 3 && diffDays >= 0;
};

export const getDaysUntilDeadline = (deadlineAt?: string | null): number | null => {
  if (!deadlineAt) return null;
  const deadline = new Date(deadlineAt);
  const now = new Date();
  const diffDays = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays;
};

export const getSaleStateColor = (state: string): string => {
  switch (state) {
    case 'SEÑADO':
      return 'bg-muted/30 text-muted-foreground border-border/40'; // Estilo oscuro como "Sin Hacer"
    case 'FOTO_ENVIADA':
      return 'bg-blue-500 text-black border-blue-500';
    case 'TRANSFERIDO':
      return 'bg-green-500 text-black border-green-500';
    case 'DEUDOR':
      return 'bg-red-500 text-black border-red-500';
    default:
      return 'bg-muted/30 text-muted-foreground border-border/40';
  }
};

export const getFabricationStateColor = (state: string, isPriority: boolean = false): string => {
  const baseColor = (() => {
    switch (state) {
      case 'SIN_HACER':
        return 'bg-muted/30 text-muted-foreground border-border/40'; // Estilo oscuro
      case 'HACIENDO':
        return 'bg-blue-500 text-black border-blue-500';
      case 'VERIFICAR':
        return 'bg-orange-500 text-black border-orange-500';
      case 'HECHO':
        return 'bg-green-500 text-black border-green-500';
      case 'RETOCAR':
        return 'bg-yellow-500 text-black border-yellow-500';
      case 'REHACER':
        return 'bg-red-500 text-black border-red-500';
      default:
        return 'bg-muted/30 text-muted-foreground border-border/40';
    }
  })();
  
  // Si es prioritario, solo agregar font-semibold (sin glow rojo)
  if (isPriority) {
    return baseColor + ' font-semibold';
  }
  
  return baseColor;
};

export const getChannelIcon = (channel: string): string => {
  switch (channel) {
    case 'WHATSAPP':
      return 'WHATSAPP';
    case 'INSTAGRAM':
      return 'INSTAGRAM';
    case 'FACEBOOK':
      return 'FACEBOOK';
    case 'MAIL':
      return 'MAIL';
    default:
      return 'WHATSAPP';
  }
};

export const truncateText = (text: string, maxLength: number = 20): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
};

export const getStampTypeIcon = (stampType: string): string => {
  switch (stampType) {
    case '3MM':
      return '3mm';
    case 'ALIMENTO':
      return 'Hamburguesa';
    case 'CLASICO':
      return 'CLASICO';
    case 'ABC':
      return 'ABC';
    case 'LACRE':
      return 'LACRE';
    default:
      return '3mm';
  }
};

export const getCarrierIcon = (carrier: string): string => {
  switch (carrier) {
    case 'ANDREANI':
      return 'ANDREANI DOMICILIO';
    case 'CORREO_ARGENTINO':
      return 'CORREO ARGENTINO DOMICILIO';
    case 'VIA_CARGO':
      return 'VIA CARGO DOMICILIO';
    case 'OTRO':
      return 'ANDREANI DOMICILIO'; // Usar Andreani como default
    default:
      return 'ANDREANI DOMICILIO';
  }
};

export const getServiceIcon = (service: string): string => {
  switch (service) {
    case 'DOMICILIO':
      return '🏠';
    case 'SUCURSAL':
      return '🏢';
    default:
      return '📍';
  }
};

export const getShippingStateColor = (state: string): string => {
  switch (state) {
    case 'SIN_ENVIO':
      return 'bg-muted/30 text-muted-foreground border-border/40'; // Estilo oscuro como "Sin Hacer"
    case 'HACER_ETIQUETA':
      return 'bg-muted/30 text-muted-foreground border-border/40';
    case 'ETIQUETA_LISTA':
      return 'bg-muted/30 text-muted-foreground border-border/40';
    case 'DESPACHADO':
      return 'bg-muted/30 text-muted-foreground border-border/40';
    case 'SEGUIMIENTO_ENVIADO':
      return 'bg-muted/30 text-muted-foreground border-border/40';
    default:
      return 'bg-muted/30 text-muted-foreground border-border/40';
  }
};

// ---- Chip visuals (gradiente + glow) ----
// Devuelve estilo inline para background y shadow + clase de texto
export interface ChipVisual {
  backgroundImage: string;
  backgroundColor?: string;
  boxShadow: string;
  borderColor: string;
  textClass: string; // para chips oscuros
  textColor?: string; // para chips de color
  width?: string; // ancho fijo
}

const buildVisual = (
  fromRgb: string,
  toRgb: string,
  glowRgb: string,
  isDark: boolean = false
): ChipVisual => {
  // Intensidad distinta para chips de color vs. oscuros
  const gradAlphaFrom = isDark ? 0.18 : 0.05; // 25% para chips de color
  const gradAlphaTo = isDark ? 0.14 : 0.42;
  const glowAlphaNear = isDark ? 0.22 : 0.55;
  const glowAlphaFar = isDark ? 0.12 : 0.30;
  const borderAlpha = isDark ? 0.35 : 0.70;

  return {
    backgroundImage: `linear-gradient(60deg, rgba(${fromRgb},${gradAlphaFrom}) 0%, rgba(${fromRgb},0) 100%)`,
    backgroundColor: isDark ? undefined : `rgba(${glowRgb},0.1)`,
    boxShadow: 'none',
    borderColor: `rgba(${glowRgb},${borderAlpha})`,
    textClass: isDark ? 'text-muted-foreground' : '',
    textColor: isDark ? undefined : `rgba(${glowRgb},0.82)`,
    width: '80px' // Ancho fijo para todos los chips
  };
};

// Abreviaturas para nombres largos
export const getFabricationLabel = (state: string, _isPriority: boolean = false): string => {
  const labels: Record<string, string> = {
    'SIN_HACER': 'Sin Hacer',
    'HACIENDO': 'Haciendo',
    'VERIFICAR': 'Verificar',
    'HECHO': 'Hecho',
    'RETOCAR': 'Retocar',
    'REHACER': 'Rehacer',
    'PROGRAMADO': 'Programado'
  };
  const baseLabel = labels[state] || state;
  return baseLabel;
};

export const getSaleLabel = (state: string): string => {
  const labels: Record<string, string> = {
    'SEÑADO': 'Señado',
    'FOTO_ENVIADA': 'Foto Env.',
    'TRANSFERIDO': 'Transferido',
    'DEUDOR': 'Deudor'
  };
  return labels[state] || state;
};

export const getShippingLabel = (state: string): string => {
  const labels: Record<string, string> = {
    'SIN_ENVIO': 'Sin Envío',
    'HACER_ETIQUETA': 'Hacer Et.',
    'ETIQUETA_LISTA': 'Et. Lista',
    'DESPACHADO': 'Desp.',
    'SEGUIMIENTO_ENVIADO': 'Seg. Env.'
  };
  return labels[state] || state;
};

// Fabricación
export const getFabricationChipVisual = (state: string, isPriority: boolean = false): ChipVisual => {
  const baseVisual = (() => {
    switch (state) {
      case 'SIN_HACER':
        return buildVisual('75,85,99', '31,41,55', '107,114,128', true); // grises
      case 'HACIENDO':
        return buildVisual('59,130,246', '37,99,235', '59,130,246'); // azules
      case 'VERIFICAR':
        return buildVisual('249,115,22', '245,158,11', '249,115,22'); // naranjas
      case 'HECHO':
        return buildVisual('34,197,94', '22,163,74', '34,197,94'); // verdes
      case 'RETOCAR':
        return buildVisual('234,179,8', '202,138,4', '234,179,8'); // amarillos
      case 'REHACER':
        return buildVisual('248,113,113', '239,68,68', '248,113,113'); // rojo claro
      case 'PROGRAMADO':
        return buildVisual('139,92,246', '124,58,237', '139,92,246'); // morado
      default:
        return buildVisual('75,85,99', '31,41,55', '107,114,128', true);
    }
  })();
  
  // Si es prioritario, solo agregar font-semibold (mantener colores originales)
  if (isPriority) {
    return {
      ...baseVisual,
      textClass: baseVisual.textClass + ' font-semibold', // Solo agregar negrita
    };
  }
  
  return baseVisual;
};

// Venta
export const getSaleChipVisual = (state: string): ChipVisual => {
  switch (state) {
    case 'SEÑADO':
      return buildVisual('75,85,99', '31,41,55', '107,114,128', true); // oscuro igual a Sin Hacer
    case 'FOTO_ENVIADA':
      return buildVisual('59,130,246', '37,99,235', '59,130,246');
    case 'TRANSFERIDO':
      return buildVisual('34,197,94', '22,163,74', '34,197,94');
    case 'DEUDOR':
      return buildVisual('239,68,68', '220,38,38', '239,68,68');
    default:
      return buildVisual('75,85,99', '31,41,55', '107,114,128', true);
  }
};

// Envío (colores específicos)
export const getShippingChipVisual = (state: string): ChipVisual => {
  switch (state) {
    case 'SIN_ENVIO':
      return buildVisual('55,65,81', '17,24,39', '107,114,128', true); // Oscuro
    case 'HACER_ETIQUETA':
      return buildVisual('249,115,22', '245,158,11', '249,115,22'); // Naranja
    case 'ETIQUETA_LISTA':
      return buildVisual('234,179,8', '202,138,4', '234,179,8'); // Amarillo
    case 'DESPACHADO':
      return buildVisual('59,130,246', '37,99,235', '59,130,246'); // Azul
    case 'SEGUIMIENTO_ENVIADO':
      return buildVisual('34,197,94', '22,163,74', '34,197,94'); // Verde
    default:
      return buildVisual('55,65,81', '17,24,39', '107,114,128', true);
  }
};

// Orden de prioridad para estados de fabricación: el menor número tiene menor prioridad (estado más bajo)
// Orden: Sin Hacer, Programado (y estados de aspire), Haciendo, Rehacer, Retocar, Verificar, Hecho
const fabricationPriority: Record<FabricationState, number> = {
  'SIN_HACER': 0,
  'PROGRAMADO': 0.5, // Entre Sin Hacer y Haciendo, pero nunca aparece en la lista (prioridad la tiene aspire)
  'HACIENDO': 1,
  'RETOCAR': 2,
  'REHACER': 3,
  'VERIFICAR': 4,
  'HECHO': 5
};

/**
 * Calcula el estado de fabricación del pedido basado en todos sus sellos.
 * - Si todos los sellos tienen el mismo estado, retorna ese estado.
 * - Si hay estados distintos, retorna el estado con menor prioridad (menor número).
 */
export function calculateOrderFabricationState(items: OrderItem[]): FabricationState {
  if (items.length === 0) return 'SIN_HACER';
  
  const states = items.map(item => item.fabricationState);
  const uniqueStates = [...new Set(states)];
  
  // Si todos tienen el mismo estado, retornar ese estado
  if (uniqueStates.length === 1) {
    return uniqueStates[0] as FabricationState;
  }
  
  // Si hay estados distintos, retornar el de menor prioridad
  return uniqueStates.reduce((minState, currentState) => {
    const minPriority = fabricationPriority[minState as FabricationState] ?? 999;
    const currentPriority = fabricationPriority[currentState as FabricationState] ?? 999;
    return currentPriority < minPriority ? currentState : minState;
  }) as FabricationState;
}
