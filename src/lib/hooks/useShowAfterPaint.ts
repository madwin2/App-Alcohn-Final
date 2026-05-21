import { useEffect, useState } from 'react';

/** Deja pintar la shell (sidebar, header) antes de montar contenido pesado (tabla). */
export function useShowAfterPaint(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, []);

  return ready;
}
