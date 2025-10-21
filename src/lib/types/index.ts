// Enums
export type FabricationState = 'SIN_HACER' | 'HACIENDO' | 'VERIFICAR' | 'HECHO' | 'REHACER' | 'PRIORIDAD' | 'RETOCAR';
export type SaleState = 'SEÑADO' | 'FOTO_ENVIADA' | 'TRANSFERIDO' | 'DEUDOR';
export type ShippingState = 'SIN_ENVIO' | 'HACER_ETIQUETA' | 'ETIQUETA_LISTA' | 'DESPACHADO' | 'SEGUIMIENTO_ENVIADO';
export type ShippingCarrier = 'ANDREANI' | 'CORREO_ARGENTINO' | 'VIA_CARGO' | 'OTRO';
export type ShippingServiceDest = 'DOMICILIO' | 'SUCURSAL';
export type ShippingOriginMethod = 'RETIRO_EN_ORIGEN' | 'ENTREGA_EN_SUCURSAL';
export type StampType = '3MM' | 'ALIMENTO' | 'CLASICO' | 'ABC' | 'LACRE';
export type ProgressStep = 
  | 'HECHO'
  | 'FOTO'
  | 'TRANSFERIDO'
  | 'HACER_ETIQUETA'
  | 'ETIQUETA_LISTA'
  | 'DESPACHADO'
  | 'SEGUIMIENTO_ENVIADO';

// Interfaces
export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  phoneE164: string;
  email?: string;
  dni?: string;
}

export interface Task {
  id: string;
  orderId: string;
  title: string;
  description?: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  createdAt: string;
  completedAt?: string;
  dueDate?: string;
}

export interface Order {
  id: string;
  customer: Customer;
  orderDate: string; // ISO
  takenBy?: { id: string; name: string } | null;
  totalValue: number;
  depositValueOrder?: number | null;
  restPaidAmountOrder?: number | null;
  saleStateOrder?: SaleState | null;
  saleStateOrderChangedAt?: string | null;
  deadlineAt?: string | null;
  paidAmountCached: number;
  balanceAmountCached: number;
  shipping: {
    carrier: ShippingCarrier;
    service: ShippingServiceDest;
    origin: ShippingOriginMethod;
    trackingNumber?: string | null;
  };
  items: OrderItem[];
  tasks?: Task[];
  progressStep?: ProgressStep;
}

export interface OrderItem {
  id: string;
  orderId: string;
  designName: string;
  requestedWidthMm: number;
  requestedHeightMm: number;
  stampType: StampType;
  itemValue?: number | null;
  fabricationState: FabricationState;
  saleState: SaleState;
  shippingState: ShippingState;
  depositValueItem?: number | null;
  restPaidAmountItem?: number | null;
  paidAmountItemCached: number;
  balanceItemCached: number;
  notes?: string;
  files?: {
    baseUrl?: string;
    vectorUrl?: string;
    photoUrl?: string;
  };
  contact: { 
    channel: 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK' | 'MAIL' | 'OTRO'; 
    phoneE164: string; 
  };
  carrierBlock?: { 
    carrier: ShippingCarrier; 
    service: ShippingServiceDest; 
  };
  trackingNumber?: string | null;
}

// UI State Types
export interface Filters {
  dateRange?: {
    from: string;
    to: string;
  };
  fabrication?: FabricationState[];
  sale?: SaleState[];
  shipping?: ShippingState[];
}

export interface SortCriteria {
  field: 'fecha' | 'cliente' | 'fabricacion' | 'venta' | 'envio' | 'valor' | 'restante';
  dir: 'asc' | 'desc';
}

export interface SortState {
  fabricationPriority: FabricationState[];
  criteria: SortCriteria[];
}

// Production Types
export type ProductionState = 'PENDIENTE' | 'EN_PROGRESO' | 'COMPLETADO' | 'REVISAR' | 'REHACER';
export type VectorizationState = 'PENDIENTE' | 'COMPLETADO' | 'NO_REQUERIDO';
export type ProgramType = 'ILLUSTRATOR' | 'PHOTOSHOP' | 'COREL' | 'AUTOCAD' | 'OTRO';

export interface ProductionTask {
  id: string;
  orderId: string;
  title: string;
  description?: string;
  dueDate?: string;
  status: ProductionState;
  createdAt: string;
  completedAt?: string;
  assignedTo?: string;
}

export interface ProductionItem {
  id: string;
  orderId: string;
  designName: string;
  requestedWidthMm: number;
  requestedHeightMm: number;
  stampType: StampType;
  productionState: ProductionState;
  vectorizationState: VectorizationState;
  program: ProgramType;
  notes?: string;
  files?: {
    baseUrl?: string;
    vectorUrl?: string;
    photoUrl?: string;
  };
  tasks?: ProductionTask[];
}

// Form Types
export interface NewOrderFormData {
  customer: {
    firstName: string;
    lastName: string;
    phoneE164: string;
    email?: string;
    channel: 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK' | 'MAIL' | 'OTRO';
  };
  order: {
    designName: string;
    requestedWidthMm: number;
    requestedHeightMm: number;
    stampType: StampType;
    notes?: string;
  };
  values: {
    totalValue: number;
    depositValue: number;
  };
  shipping: {
    carrier: ShippingCarrier;
    service: ShippingServiceDest;
    origin: ShippingOriginMethod;
  };
  files: {
    base?: File;
    vector?: File;
    photo?: File;
  };
  states: {
    fabrication: FabricationState;
    sale: SaleState;
    shipping: ShippingState;
  };
}
