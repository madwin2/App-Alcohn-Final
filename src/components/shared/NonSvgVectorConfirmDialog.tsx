import { ConfirmDialog } from '@/components/programas/ConfirmDialog';
import { vectorFormatLabel } from '@/lib/utils/vectorFileFormat';

interface NonSvgVectorConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nombre del archivo (para derivar el formato). */
  fileName: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

export function NonSvgVectorConfirmDialog({
  open,
  onOpenChange,
  fileName,
  onConfirm,
  onCancel,
}: NonSvgVectorConfirmDialogProps) {
  const formato = vectorFormatLabel(fileName);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Vector en formato no SVG"
      description={`El vector fue subido en formato ${formato}. ¿Estás seguro de que querés continuar? Recordá que es importante subir los vectores en formato SVG para mantener el flujo correcto de trabajo.`}
      confirmLabel="Continuar igualmente"
      cancelLabel="Cancelar"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
