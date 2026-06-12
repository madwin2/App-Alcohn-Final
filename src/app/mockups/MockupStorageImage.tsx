import { useEffect, useState } from 'react';
import {
  resolveMockupAssetDisplayUrl,
  type MockupAssetKind,
} from '@/lib/utils/mockupStorage';
import type { MockupSolicitudRow } from '@/lib/supabase/services/mockupSolicitudes.service';

type Props = {
  row: MockupSolicitudRow;
  kind: MockupAssetKind;
  alt?: string;
  className?: string;
  fallbackUrl?: string | null;
};

/** Miniatura/preview que funciona con mockups web (bucket privado logos-web / mockups-web). */
export function MockupStorageImage({ row, kind, alt = '', className, fallbackUrl }: Props) {
  const [src, setSrc] = useState<string | null>(fallbackUrl ?? null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const url = await resolveMockupAssetDisplayUrl(row, kind);
        if (!cancelled) setSrc(url);
      } catch {
        if (!cancelled) setSrc(fallbackUrl ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [row, kind, fallbackUrl]);

  if (!src) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted/45 text-[10px] text-muted-foreground">
        Sin vista previa
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
    />
  );
}
