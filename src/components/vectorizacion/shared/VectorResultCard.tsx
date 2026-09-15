import { Button } from '@/components/ui/button';
import { downloadSvg } from '@/lib/vectorizacion/zipResults';
import type { VectorResult } from '@/lib/vectorizacion/types';
import { RotateCcw } from 'lucide-react';

interface Props {
  result: VectorResult;
  beforeUrl?: string;
  onRetry?: () => void;
}

export function VectorResultCard({ result, beforeUrl, onRetry }: Props) {
  const svgUrl = result.svg
    ? `data:image/svg+xml;utf8,${encodeURIComponent(result.svg)}`
    : result.previewUrl;

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="grid grid-cols-2 gap-px bg-border">
        <div className="flex aspect-square items-center justify-center bg-white p-2">
          {beforeUrl ? <img src={beforeUrl} alt="" className="max-h-full max-w-full object-contain" /> : null}
        </div>
        <div className="flex aspect-square items-center justify-center bg-white p-2">
          {svgUrl ? <img src={svgUrl} alt="" className="max-h-full max-w-full object-contain" /> : null}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{result.name}</p>
          {result.error ? <p className="text-xs text-destructive">{result.error}</p> : null}
        </div>
        <div className="flex gap-1">
          {result.svg ? (
            <Button type="button" size="sm" variant="outline" onClick={() => downloadSvg(result.svg, result.name)}>
              SVG
            </Button>
          ) : null}
          {result.error && onRetry ? (
            <Button type="button" size="icon" variant="ghost" onClick={onRetry} aria-label="Reintentar">
              <RotateCcw className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
