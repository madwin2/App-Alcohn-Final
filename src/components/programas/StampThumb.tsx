import { useEffect, useState } from 'react';
import { ProgramStamp } from '@/lib/types/index';
import { cn } from '@/lib/utils';
import { storageFileKindFromUrl } from '@/lib/utils/storageFileKind';

interface StampThumbProps {
  stamp: ProgramStamp;
  className?: string;
  /**
   * vector: solo preview de vector (sin foto).
   * photo: prioriza foto_sello / mockup 3D.
   * auto: vector → preview → foto.
   */
  prefer?: 'auto' | 'vector' | 'photo';
}

/** Elige la primera URL que el navegador pueda mostrar en <img>. */
function pickThumbSrc(
  stamp: ProgramStamp,
  prefer: 'auto' | 'vector' | 'photo' = 'auto',
): string | undefined {
  const candidates =
    prefer === 'vector'
      ? [stamp.vectorPreviewUrl, stamp.previewUrl]
      : prefer === 'photo'
        ? [stamp.photoUrl, stamp.vectorPreviewUrl, stamp.previewUrl]
        : [stamp.vectorPreviewUrl, stamp.previewUrl, stamp.photoUrl];

  const list = candidates.filter((u): u is string => Boolean(u && u.trim()));

  for (const url of list) {
    const kind = storageFileKindFromUrl(url);
    if (kind === 'image' || kind === 'svg') return url;
  }

  for (const url of list) {
    const kind = storageFileKindFromUrl(url);
    if (kind !== 'eps' && kind !== 'pdf' && kind !== 'ai') return url;
  }

  return undefined;
}

export function StampThumb({
  stamp,
  className,
  prefer = 'auto',
}: StampThumbProps) {
  const src = pickThumbSrc(stamp, prefer);
  const [failed, setFailed] = useState(false);
  const dim = `${Math.round(stamp.widthMm)}×${Math.round(stamp.heightMm)}`;

  useEffect(() => {
    setFailed(false);
  }, [src, stamp.id]);

  return (
    <div
      className={cn(
        'flex flex-shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-white',
        className ?? 'h-16 w-16',
      )}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={`Diseño de ${stamp.designName}`}
          className="h-full w-full bg-transparent object-contain"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="px-1 text-center text-[10px] leading-tight text-muted-foreground">
          {dim}mm
        </div>
      )}
    </div>
  );
}
