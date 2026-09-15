import type { CropReason } from './imagePrep';

export interface SourceImage {
  id: string;
  name: string;
  bitmap: ImageBitmap;
  naturalWidth: number;
  naturalHeight: number;
  selloId?: string;
  orderId?: string;
}

export interface PixelBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface PrepOptions {
  autoCrop: boolean;
  cropPaddingPct: number;
  cleanLevels: boolean;
  blackPoint: number;
  whitePoint: number;
  manualCrop?: { x: number; y: number; w: number; h: number };
}

export const DEFAULT_PREP_OPTIONS: PrepOptions = {
  autoCrop: true,
  cropPaddingPct: 0.02,
  cleanLevels: true,
  blackPoint: 60,
  whitePoint: 235,
};

export interface PreparedImage {
  id: string;
  name: string;
  width: number;
  height: number;
  canvas: HTMLCanvasElement;
  /** Cacheado una vez en prepareImage — no llamar toDataURL en cada render. */
  previewDataUrl: string;
  empty: boolean;
  cropReason: CropReason;
  cropPx: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  selloId?: string;
  orderId?: string;
}

export interface PackedCell {
  imageId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PackedSheet {
  width: number;
  height: number;
  cells: PackedCell[];
}

export interface PendingSello {
  id: string;
  orderId: string;
  designName: string;
  clienteNombre: string;
  archivoBase: string;
  archivoBaseMejorado: string | null;
  mockupSolicitudId: string | null;
  requestedWidthMm: number;
  requestedHeightMm: number;
  estadoFabricacion: string;
  esPrioritario: boolean;
  fechaLimite: string | null;
}

export interface VectorResult {
  id: string;
  name: string;
  selloId?: string;
  orderId?: string;
  svg: string;
  previewUrl?: string;
  error?: string;
  empty?: boolean;
}

export interface SheetProgress {
  index: number;
  total: number;
  status: 'pending' | 'running' | 'ok' | 'error';
  label: string;
  credits?: number;
  elapsedMs?: number;
}

export interface NormalizedCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ReviewItem {
  id: string;
  selloId: string;
  orderId: string;
  designName: string;
  clienteNombre: string;
  svg: string;
  beforeDataUrl: string;
  requestedWidthMm: number;
  requestedHeightMm: number;
  mode: import('./vectorizerPreset').VectorizeMode;
}
