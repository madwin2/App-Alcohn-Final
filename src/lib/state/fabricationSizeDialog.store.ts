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
  /** Se cierra sin confirmar (Cancelar, Escape o la cruz). */
  onCancel?: () => void;
  /** Texto del botón de cancelar (por defecto «Cancelar»). */
  cancelLabel?: string;
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

/**
 * Abre el popup y espera la decisión: la medida elegida, o null si se cerró
 * sin confirmar.
 */
export function pedirMedidaFabricacion(
  payload: Omit<FabricationSizeDialogPayload, 'onConfirm' | 'onCancel'>,
): Promise<{ widthMm: number; heightMm: number } | null> {
  return new Promise((resolve) => {
    useFabricationSizeDialogStore.getState().open({
      ...payload,
      onConfirm: (result) => resolve(result),
      onCancel: () => resolve(null),
    });
  });
}
