import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils/cn';

interface RevealSectionProps {
  children: React.ReactNode;
  className?: string;
  /** Delay en ms para escalonar la entrada de elementos vecinos. */
  delay?: number;
  /** Distancia (en px) que recorre desde abajo al revelar. */
  distance?: number;
}

/**
 * Reveal-on-scroll: cuando la sección entra al viewport, se anima
 * con fade-in + slide-up. Se usa IntersectionObserver para evitar
 * scroll listeners pesados.
 */
export function RevealSection({
  children,
  className,
  delay = 0,
  distance = 48,
}: RevealSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        'transition-[opacity,transform] duration-[750ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform',
        className,
      )}
      style={{
        transitionDelay: `${delay}ms`,
        opacity: revealed ? 1 : 0,
        transform: revealed ? 'translateY(0)' : `translateY(${distance}px)`,
      }}
    >
      {children}
    </div>
  );
}
