// Enums
export type FabricationState = 'SIN_HACER' | 'HACIENDO' | 'VERIFICAR' | 'HECHO' | 'REHACER' | 'RETOCAR' | 'PROGRAMADO';
export type SaleState = 'SEÑADO' | 'FOTO_ENVIADA' | 'TRANSFERIDO' | 'DEUDOR';
export type ShippingState = 'SIN_ENVIO' | 'HACER_ETIQUETA' | 'ETIQUETA_LISTA' | 'DESPACHADO' | 'SEGUIMIENTO_ENVIADO';
export type ShippingCarrier = 'ANDREANI' | 'CORREO_ARGENTINO' | 'VIA_CARGO' | 'OTRO';
export type ShippingServiceDest = 'DOMICILIO' | 'SUCURSAL';
export type ShippingOption = 
  | 'ANDREANI_DOMICILIO' 
  | 'ANDREANI_SUCURSAL' 
  | 'CORREO_ARGENTINO_DOMICILIO' 
  | 'CORREO_ARGENTINO_SUCURSAL' 
  | 'VIA_CARGO_DOMICILIO' 
  | 'VIA_CARGO_SUCURSAL' 
  | 'OTRO' 
  | 'NONE';
export type ShippingOriginMethod = 'RETIRO_EN_ORIGEN' | 'ENTREGA_EN_SUCURSAL';
export type StampType = '3MM' | 'ALIMENTO' | 'CLASICO' | 'ABC' | 'LACRE';
export type AspireState = 'Aspire G' | 'Aspire G Check' | 'Aspire C' | 'Aspire C Check' | 'Aspire XL';
// Claves normalizadas para ordenar/filtrar cuando Aspire y Fabricación comparten columna en UI
export type AspireSortKey =
  | 'ASPIRE_Aspire_G'
  | 'ASPIRE_Aspire_G_Check'
  | 'ASPIRE_Aspire_C'
  | 'ASPIRE_Aspire_C_Check'
  | 'ASPIRE_Aspire_XL';
export type ProductionFabricacionAspireKey = FabricationState | AspireSortKey;
export type MachineType = 'C' | 'G' | 'XL';
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
      carrier: ShippingCarrier | null;
      service: ShippingServiceDest | null;
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
  isPriority: boolean;
  saleState: SaleState;
  shippingState: ShippingState;
  depositValueItem?: number | null;
  restPaidAmountItem?: number | null;
  paidAmountItemCached: number;
  balanceItemCached: number;
  notes?: string;
  program?: string; // Nombre del programa (programa_nombre en BD)
  files?: {
    baseUrl?: string;
    vectorUrl?: string;
    vectorPreviewUrl?: string; // Preview PNG para archivos EPS
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
  types?: StampType[];
  channels?: ('WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK' | 'MAIL')[];
  uploaders?: string[];
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
export type VectorizationState = 'BASE' | 'VECTORIZADO' | 'DESCARGADO' | 'EN_PROCESO';
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
  isPriority: boolean;
  vectorizationState: VectorizationState;
  program: string; // Cambiado de ProgramType a string para permitir texto libre
  aspireState?: AspireState | null;
  machine?: MachineType | null;
  notes?: string;
  deadline?: string | null; // Fecha límite del sello
  takenBy?: { id: string; name: string } | null; // Usuario que subió el pedido
  files?: {
    baseUrl?: string;
    vectorUrl?: string;
    photoUrl?: string;
  };
  tasks?: ProductionTask[];
}

// Program Types
export type ProgramStatus = 'active' | 'inactive';
export type ProgramCategory = 'PRODUCTION' | 'DESIGN' | 'ADMINISTRATION' | 'QUALITY' | 'OTHER';
export type ProgramMachineType = 'C' | 'G' | 'XL' | 'ABC'; // Para programas (incluye ABC)
export type StampSize = 63 | 38 | 25 | 19 | 12;

export interface ProgramStamp {
  id: string;
  designName: string;
  widthMm: number;
  heightMm: number;
  stampType: StampType;
  previewUrl?: string;
  isPriority?: boolean;
  deadlineAt?: string;
  createdAt?: string;
}

export interface Program {
  id: string;
  name: string; // Formato: "DD MM x(CANTIDAD) y(MÁQUINA)"
  description: string;
  version: string;
  status: ProgramStatus;
  category: ProgramCategory;
  machine: MachineType;
  stampCount: number;
  productionDate: string; // Fecha en que se hace
  notes?: string;
  fabricationState: FabricationState;
  isVerified: boolean;
  stamps: ProgramStamp[];
  lengthUsed: StampSize;
  createdAt: string;
  lastUpdated: string;
  createdBy: string;
  tags?: string[];
  settings?: Record<string, any>;
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
    isPriority: boolean;
  };
}
