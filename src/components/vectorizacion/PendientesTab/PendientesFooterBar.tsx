import { useVectorizacionStore } from '@/lib/state/vectorizacion.store';
import { VectorizarRunButton } from './VectorizarRunButton';

interface Props {
  sellosCount: number;
  hojasCount: number;
  canRun: boolean;
  onOpenConfirm: (credits: number | null) => void;
}

export function PendientesFooterBar({ sellosCount, hojasCount, canRun, onOpenConfirm }: Props) {
  const running = useVectorizacionStore((s) => s.running);

  return (
    <div className="fixed bottom-0 left-20 right-0 z-20 border-t border-white/10 bg-background/80 p-3 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {sellosCount} sellos · {hojasCount} {hojasCount === 1 ? 'hoja' : 'hojas'} · {hojasCount} créditos
          {running ? ' · en curso' : ''}
        </p>
        <VectorizarRunButton hojasCount={hojasCount} canRun={canRun} onOpenConfirm={onOpenConfirm} />
      </div>
    </div>
  );
}
