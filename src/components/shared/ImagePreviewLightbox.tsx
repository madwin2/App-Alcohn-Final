import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface ImagePreviewLightboxProps {
  src: string | null;
  alt?: string;
  onClose: () => void;
}

export function ImagePreviewLightbox({ src, alt = 'Vista previa', onClose }: ImagePreviewLightboxProps) {
  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [src, onClose]);

  if (!src) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-white p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Vista previa"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 rounded-full p-2 text-foreground/80 hover:bg-muted hover:text-foreground"
        aria-label="Cerrar"
      >
        <X className="size-6" />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-h-[90vh] max-w-[min(90vw,1200px)] object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body
  );
}
