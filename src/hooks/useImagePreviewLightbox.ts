import { useState, useCallback } from 'react';

export function useImagePreviewLightbox() {
  const [preview, setPreview] = useState<{ src: string; alt?: string } | null>(null);
  const openPreview = useCallback((src: string, alt?: string) => setPreview({ src, alt }), []);
  const closePreview = useCallback(() => setPreview(null), []);
  return { preview, openPreview, closePreview };
}
