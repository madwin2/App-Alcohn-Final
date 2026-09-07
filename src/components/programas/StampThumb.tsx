import { useEffect, useState } from 'react';
import { ProgramStamp } from '@/lib/types/index';
import { cn } from '@/lib/utils';
import { storageFileKindFromUrl } from '@/lib/utils/storageFileKind';

interface StampThumbProps {
  stamp: ProgramStamp;
  className?: string;
}

/** Elige la primera URL que el navegador pueda mostrar en <img>. */
function pickThumbSrc(stamp: ProgramStamp): string | undefined {
  const candidates = [stamp.vectorPreviewUrl, stamp.previewUrl, stamp.photoUrl].filter(
    (u): u is string => Boolean(u && u.trim()),
  );

  for (const url of candidates) {
    const kind = storageFileKindFromUrl(url);
    if (kind === 'image' || kind === 'svg') return url;
  }

  for (const url of candidates) {
    const kind = storageFileKindFromUrl(url);
    if (kind !== 'eps' && kind !== 'pdf' && kind !== 'ai') return url;
  }

  return undefined;
}

export function StampThumb({ stamp, className }: StampThumbProps) {
  const src = pickThumbSrc(stamp);
  const [failed, setFailed] = useState(false);
  const dim = `${Math.round(stamp.widthMm)}×${Math.round(stamp.heightMm)}`;

  useEffect(() => {
    setFailed(false);
  }, [src, stamp.id]);

  return (
    <div
      className={cn(
        'border border-border rounded bg-white flex items-center justify-center overflow-hidden flex-shrink-0',
        className ?? 'w-16 h-16',
      )}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={`Diseño de ${stamp.designName}`}
          className="w-full h-full object-contain"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="text-[10px] text-muted-foreground text-center px-1 leading-tight">{dim}mm</div>
      )}
    </div>
  );
}
