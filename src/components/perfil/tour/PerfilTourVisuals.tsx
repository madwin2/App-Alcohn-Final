import { useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import type { PerfilTourVisualId } from '@/lib/equipo/perfilOnboarding';
import {
  LIENZO,
  MarcaActivaProvider,
  MockCalendario,
  MockCorcho,
  MockIntro,
  MockLoMio,
  MockMiDia,
  MockMiDiaResumen,
  MockNumeros,
  MockTareas,
} from './PerfilTourMocks';

const VISUALS: Record<PerfilTourVisualId, ComponentType> = {
  intro: MockIntro,
  'mi-dia': MockMiDia,
  'mi-dia-resumen': MockMiDiaResumen,
  calendario: MockCalendario,
  tareas: MockTareas,
  'lo-mio': MockLoMio,
  numeros: MockNumeros,
  corcho: MockCorcho,
};

/**
 * Dibuja el mock en su lienzo fijo y lo escala para que entre entero en el lugar
 * disponible (modal, tarjeta del sandbox o celular), sin cortar marcas ni textos.
 */
export function PerfilTourVisual({ id, pasoActivo = null }: { id: PerfilTourVisualId; pasoActivo?: number | null }) {
  const Comp = VISUALS[id];
  const ref = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      setEscala(Math.min(width / LIENZO.w, height / LIENZO.h, 1.25));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className="relative size-full overflow-hidden bg-[#0c0c0e]">
      {escala > 0 ? (
        <div
          className="absolute left-1/2 top-1/2"
          style={{
            width: LIENZO.w,
            height: LIENZO.h,
            marginLeft: -LIENZO.w / 2,
            marginTop: -LIENZO.h / 2,
            transform: `scale(${escala})`,
          }}
        >
          {/* La animación va adentro: si estuviera acá pisaría el scale. */}
          <div key={id} className="vt-media-in size-full">
            <MarcaActivaProvider value={pasoActivo}>
              <Comp />
            </MarcaActivaProvider>
          </div>
        </div>
      ) : null}
      <style>{`
        @keyframes vt-media-in {
          from { opacity: 0; transform: translateY(4px) scale(0.985); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .vt-media-in { animation: vt-media-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) both; }
        @media (prefers-reduced-motion: reduce) { .vt-media-in { animation: none !important; } }
      `}</style>
    </div>
  );
}
