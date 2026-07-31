import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils/cn';

/** Resolución interna cuadrada (mismo aspect que el avatar). */
const PROCESS_SIZE = 180;

/**
 * Quita verde chroma de forma agresiva + máscara circular.
 * Opera in-place sobre ImageData RGBA.
 */
function keyGreenScreen(data: Uint8ClampedArray, size: number) {
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const radius = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      let a = data[i + 3];
      if (a === 0) continue;

      // Máscara circular (evita el “cuadrado” del canvas)
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) {
        data[i + 3] = 0;
        continue;
      }
      const edgeSoft = Math.max(0, Math.min(1, (radius - dist) / 1.25));
      a = Math.round(a * edgeSoft);

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;
      const sat = max === 0 ? 0 : delta / max;
      const val = max / 255;

      let hue = 0;
      if (delta > 0) {
        if (max === r) hue = ((g - b) / delta) % 6;
        else if (max === g) hue = (b - r) / delta + 2;
        else hue = (r - g) / delta + 4;
        hue *= 60;
        if (hue < 0) hue += 360;
      }

      const greenExcess = g - Math.max(r, b);
      const isGreenHue = hue >= 60 && hue <= 170;

      // Key agresivo: cualquier verde saturado / dominante se va
      if (isGreenHue && ((sat > 0.28 && val > 0.2) || greenExcess > 14)) {
        const excessT = Math.min(1, Math.max(0, (greenExcess - 8) / 40));
        const satT = Math.min(1, Math.max(0, (sat - 0.22) / 0.4));
        const keyAmount = Math.min(1, Math.max(excessT, satT) * 1.15);
        a = Math.round(a * (1 - keyAmount));
        if (keyAmount > 0.15) {
          data[i + 1] = Math.min(g, Math.max(r, b));
        }
      } else if (isGreenHue && greenExcess > 0) {
        data[i + 1] = Math.min(g, Math.max(r, b) + Math.round(greenExcess * 0.2));
      }

      data[i + 3] = a;
    }
  }
}

/**
 * Recorte cuadrado del video que aproxima el encuadre de las fotos de perfil
 * (sujeto abajo del frame 9:16, cabeza cerca del tope del cuadrado).
 */
function sourceCrop(vw: number, vh: number) {
  const side = Math.min(vw, vh);
  const sx = Math.max(0, (vw - side) / 2);
  // ~43% del alto: alinea cabeza/hombros como en perfil
  const sy = Math.max(0, Math.min(vh - side, vh * 0.43));
  return { sx, sy, sw: side, sh: side };
}

interface ChromaKeyVideoProps {
  src: string;
  active: boolean;
  className?: string;
}

/**
 * Reproduce un video con fondo verde removido, recorte tipo perfil y máscara circular.
 */
export function ChromaKeyVideo({ src, active, className }: ChromaKeyVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    if (!workRef.current) {
      workRef.current = document.createElement('canvas');
    }
    const work = workRef.current;
    work.width = PROCESS_SIZE;
    work.height = PROCESS_SIZE;
    canvas.width = PROCESS_SIZE;
    canvas.height = PROCESS_SIZE;

    const workCtx = work.getContext('2d', { willReadFrequently: true, alpha: true });
    const outCtx = canvas.getContext('2d', { alpha: true });
    if (!workCtx || !outCtx) return;

    let running = false;

    const drawFrame = () => {
      if (!running) return;
      if (video.readyState >= 2 && video.videoWidth > 0) {
        const { sx, sy, sw, sh } = sourceCrop(video.videoWidth, video.videoHeight);

        workCtx.clearRect(0, 0, PROCESS_SIZE, PROCESS_SIZE);
        workCtx.drawImage(video, sx, sy, sw, sh, 0, 0, PROCESS_SIZE, PROCESS_SIZE);
        const image = workCtx.getImageData(0, 0, PROCESS_SIZE, PROCESS_SIZE);
        keyGreenScreen(image.data, PROCESS_SIZE);

        outCtx.clearRect(0, 0, PROCESS_SIZE, PROCESS_SIZE);
        outCtx.putImageData(image, 0, 0);
      }
      rafRef.current = requestAnimationFrame(drawFrame);
    };

    const start = () => {
      if (running) return;
      running = true;
      try {
        video.currentTime = 0;
      } catch {
        /* ignore */
      }
      void video.play().catch(() => {});
      rafRef.current = requestAnimationFrame(drawFrame);
    };

    const stop = () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
      video.pause();
      outCtx.clearRect(0, 0, PROCESS_SIZE, PROCESS_SIZE);
    };

    if (active) start();
    else stop();

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
      video.pause();
    };
  }, [active, src]);

  return (
    <>
      <video
        ref={videoRef}
        src={encodeURI(src)}
        muted
        loop
        playsInline
        preload="auto"
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        aria-hidden
      />
      <canvas
        ref={canvasRef}
        className={cn('block h-full w-full bg-transparent', className)}
        aria-hidden={!active}
      />
    </>
  );
}
