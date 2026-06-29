import { useEffect, useState } from 'react';
import { FileType2, Loader2 } from 'lucide-react';
import { resolveStorageDisplayUrl } from '@/lib/utils/storageUrlUtils';

type Props = {
  url: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
  fallbackClassName?: string;
  mockupSolicitudId?: string | null;
};

/** Miniatura que resuelve URLs firmadas para buckets privados (logos-web / mockups-web). */
export function StorageUrlImage({
  url,
  alt = '',
  className,
  imgClassName,
  fallbackClassName,
  mockupSolicitudId,
}: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setSrc(null);

    void (async () => {
      try {
        const resolved = await resolveStorageDisplayUrl(url, mockupSolicitudId);
        if (!cancelled) setSrc(resolved);
      } catch {
        if (!cancelled) {
          setSrc(url);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, mockupSolicitudId]);

  if (!src && !failed) {
    return (
      <div
        className={
          fallbackClassName ??
          className ??
          'flex h-full w-full items-center justify-center bg-muted/40'
        }
      >
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  if (failed) {
    return (
      <div
        className={
          fallbackClassName ??
          className ??
          'flex h-full w-full items-center justify-center bg-muted'
        }
      >
        <FileType2 className="size-5 text-muted-foreground" aria-hidden />
      </div>
    );
  }

  return (
    <img
      src={src!}
      alt={alt}
      className={imgClassName ?? className}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
