import { useState } from 'react';
import { ProgramStamp } from '@/lib/types/index';
import { cn } from '@/lib/utils';

interface StampThumbProps {
  stamp: ProgramStamp;
  className?: string;
}

export function StampThumb({ stamp, className }: StampThumbProps) {
  const [failed, setFailed] = useState(false);
  const src = stamp.vectorPreviewUrl || stamp.previewUrl;
  const dim = `${Math.round(stamp.widthMm)}×${Math.round(stamp.heightMm)}`;

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
        <div className="text-[10px] text-muted-foreground text-center px-1">{dim}</div>
      )}
    </div>
  );
}
