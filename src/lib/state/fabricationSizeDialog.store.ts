import { create } from 'zustand';
import type { FabricationSizeResolution } from '@/lib/programas/fabricationSize';

export interface FabricationSizeDialogPayload {
  fileName: string;
  previewUrl?: string;
  requestedWidthMm: number;
  requestedHeightMm: number;
  resolution: FabricationSizeResolution;
  svgAspectRatio: number | null;
  onConfirm: (result: { widthMm: number; heightMm: number }) => void | Promise<void>;
}

interface FabricationSizeDialogStore {
  payload: FabricationSizeDialogPayload | null;
  open: (payload: FabricationSizeDialogPayload) => void;
  close: () => void;
}

/** Estado global del popup de medida: sobrevive al remount de celdas tras updateItem/onUpdate. */
export const useFabricationSizeDialogStore = create<FabricationSizeDialogStore>((set) => ({
  payload: null,
  open: (payload) => set({ payload }),
  close: () => set({ payload: null }),
}));
