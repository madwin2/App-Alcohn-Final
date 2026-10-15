import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { esTipoAlimento, type FresaTarget } from '@/lib/fresa/chequeoFresa';
import { fetchSvgText } from '@/lib/fresa/useFresaReport';
import { slugify } from '@/lib/vectorizacion/helpers';
import { FresaCheckDialog } from './FresaCheckDialog';

/** Medidas de un sello, para decidir a qué escala se analiza su vector. */
export interface FresaSizeInfo {
  fabricationWidthMm?: number | null;
  fabricationHeightMm?: number | null;
  requestedWidthMm?: number | null;
  requestedHeightMm?: number | null;
  /** Tipo de sello: Alimento pide más profundidad mínima. */
  stampType?: string | null;
}

/**
 * La medida que importa es la de fabricación (la que usa el gadget para
 * escalar en Aspire). Si todavía no está, la pedida, como hace "Confirmar".
 */
export function fresaTargetFor(size: FresaSizeInfo): FresaTarget | null {
  const fw = Number(size.fabricationWidthMm);
  const fh = Number(size.fabricationHeightMm);
  const alimento = esTipoAlimento(size.stampType);
  const rw = Number(size.requestedWidthMm);
  const rh = Number(size.requestedHeightMm);
  if (fw > 0 && fh > 0) {
    return {
      mode: 'fabricacion',
      longSideMm: Math.max(fw, fh),
      // La pedida dice la planchuela: tope si hiciera falta agrandar.
      ...(rw > 0 && rh > 0 ? { requestedWidthMm: rw, requestedHeightMm: rh } : {}),
      alimento,
    };
  }
  if (rw > 0 && rh > 0) return { mode: 'pedido', requestedWidthMm: rw, requestedHeightMm: rh, alimento };
  return null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** URL del SVG guardado. */
  vectorUrl: string | null | undefined;
  title: string;
  size: FresaSizeInfo;
  /**
   * Guarda el SVG corregido (por ejemplo, subirlo y reemplazar el vector del
   * sello). Si no se pasa, solo se puede descargar.
   */
  onSaveCorrected?: (file: File, fabricationMm: { widthMm: number; heightMm: number }) => Promise<void>;
  saveHint?: string;
}

/** Chequeo de fresa de un vector ya guardado (por URL). */
export function FresaVectorDialog({ open, onOpenChange, vectorUrl, title, size, onSaveCorrected, saveHint }: Props) {
  const { toast } = useToast();
  const [svgText, setSvgText] = useState<string | null>(null);
  // En refs para que un re-render del padre (callbacks nuevos) no vuelva a
  // bajar el SVG ni reinicie el diálogo con una corrección a medio ver.
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    if (!open || !vectorUrl) return;
    let alive = true;
    setSvgText(null);
    fetchSvgText(vectorUrl)
      .then((t) => alive && setSvgText(t))
      .catch((e) => {
        if (!alive) return;
        toastRef.current({
          title: 'No se pudo abrir el vector',
          description: e instanceof Error ? e.message : undefined,
          variant: 'destructive',
        });
        onOpenChangeRef.current(false);
      });
    return () => {
      alive = false;
    };
  }, [open, vectorUrl]);

  return (
    <FresaCheckDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      svgText={svgText}
      target={fresaTargetFor(size)}
      downloadName={slugify(title || 'vector')}
      onApply={
        onSaveCorrected
          ? async (svg, _fix, opts) => {
              const file = new File([svg], `${slugify(title || 'vector')}-corregido.svg`, { type: 'image/svg+xml' });
              // Se guarda la medida del resultado: el gadget escala por el lado
              // largo, así que tiene que coincidir con el dibujo corregido.
              await onSaveCorrected(file, opts.fabricationMm);
              toast({ title: 'Vector corregido guardado', description: 'Reemplazó al anterior en el sello.' });
            }
          : undefined
      }
      applyLabel="Guardar el corregido en el sello"
      applyHint={
        saveHint ??
        'Reemplaza el vector del sello; la medida de fabricación no cambia. Si el sello ya está armado en Aspire, el gadget no lo reimporta solo: borralo del archivo y corré Actualizar (elegí «reimportar»), o usá Rehacer desde cero.'
      }
    />
  );
}
