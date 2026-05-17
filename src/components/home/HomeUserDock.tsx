import { useCallback, useRef } from 'react';
import { cn } from '@/lib/utils/cn';

export interface DockUser {
  id: string;
  name: string;
  profile: string;
}

const BASE_SIZE = 72;
const MAX_SCALE = 1.42;
/** Distancia (px) desde el centro del avatar donde el efecto decae a escala base. */
const MAGNIFY_RANGE = 130;

/** Curva suave tipo macOS dock (cos^12), inspirada en Cult UI Dock. */
function scaleFromDistance(distance: number): number {
  if (!Number.isFinite(distance)) return 1;
  const abs = Math.abs(distance);
  if (abs >= MAGNIFY_RANGE) return 1;
  const t = Math.cos((abs / MAGNIFY_RANGE) * (Math.PI / 2)) ** 12;
  return 1 + (MAX_SCALE - 1) * t;
}

interface HomeUserDockProps {
  users: DockUser[];
  className?: string;
}

/** Barra de avatares con efecto dock estilo macOS (magnificación por proximidad al cursor). */
export function HomeUserDock({ users, className }: HomeUserDockProps) {
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const applyScales = useCallback(
    (mousePageX: number | null) => {
      users.forEach((u) => {
        const el = itemRefs.current.get(u.id);
        if (!el) return;
        if (mousePageX === null) {
          el.style.transform = 'scale(1)';
          el.style.zIndex = '';
          return;
        }
        const rect = el.getBoundingClientRect();
        const centerPageX = rect.left + window.scrollX + rect.width / 2;
        const distance = mousePageX - centerPageX;
        const scale = scaleFromDistance(distance);
        el.style.transform = `scale(${scale})`;
        el.style.zIndex = scale > 1.05 ? String(Math.round(scale * 10)) : '';
      });
    },
    [users],
  );

  const handleMouseMove = (e: React.MouseEvent) => {
    applyScales(e.pageX);
  };

  const handleMouseLeave = () => {
    itemRefs.current.forEach((el) => {
      el.style.transition = 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)';
    });
    applyScales(null);
    window.setTimeout(() => {
      itemRefs.current.forEach((el) => {
        el.style.transition = '';
      });
    }, 300);
  };

  if (users.length === 0) return null;

  return (
    <div className={cn('flex justify-center min-h-[120px] items-end overflow-visible', className)}>
      <div
        className="flex items-end justify-center gap-3 px-8 py-2 rounded-full border-2 border-white/15 bg-black/40 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-sm overflow-visible"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {users.map((u) => (
          <div
            key={u.id}
            ref={(node) => {
              if (node) itemRefs.current.set(u.id, node);
              else itemRefs.current.delete(u.id);
            }}
            title={u.name}
            style={{ width: BASE_SIZE, height: BASE_SIZE }}
            className="relative shrink-0 origin-bottom rounded-full overflow-hidden cursor-pointer bg-transparent shadow-[0_4px_16px_rgba(0,0,0,0.35)] will-change-transform"
          >
            <img
              src={u.profile}
              alt={u.name}
              className="h-full w-full object-cover select-none"
              draggable={false}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
