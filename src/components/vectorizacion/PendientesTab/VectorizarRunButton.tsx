import { useEffect, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Check, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useVectorizacionStore } from '@/lib/state/vectorizacion.store';
import { fetchVectorizerAccount } from '@/lib/vectorizacion/vectorizerApi';
import type { SheetProgress } from '@/lib/vectorizacion/types';

gsap.registerPlugin(useGSAP);

function progressPct(sheets: SheetProgress[]): number {
  if (!sheets.length) return 0;
  const done = sheets.filter((s) => s.status === 'ok' || s.status === 'error').length;
  const running = sheets.some((s) => s.status === 'running');
  return Math.min(100, ((done + (running ? 0.55 : 0)) / sheets.length) * 100);
}

interface Props {
  hojasCount: number;
  canRun: boolean;
  onOpenConfirm: (credits: number | null) => void;
}

export function VectorizarRunButton({ hojasCount, canRun, onOpenConfirm }: Props) {
  const mode = useVectorizacionStore((s) => s.mode);
  const running = useVectorizacionStore((s) => s.running);
  const progress = useVectorizacionStore((s) => s.progress);
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const btnRef = useRef<HTMLButtonElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const burstRef = useRef<HTMLDivElement>(null);
  const pct = progressPct(progress);

  useEffect(() => {
    if (running) {
      setPhase('running');
      return;
    }
    if (phase === 'running') {
      setPhase('done');
      const t = window.setTimeout(() => setPhase('idle'), 2200);
      return () => window.clearTimeout(t);
    }
  }, [running, phase]);

  useGSAP(
    () => {
      if (!fillRef.current) return;
      if (phase === 'running') {
        gsap.to(fillRef.current, {
          width: `${Math.max(8, pct)}%`,
          duration: 0.45,
          ease: 'power2.out',
          overwrite: true,
        });
      } else if (phase === 'idle') {
        gsap.set(fillRef.current, { width: '0%' });
      }
    },
    { dependencies: [phase, pct] },
  );

  useGSAP(
    () => {
      if (phase !== 'done' || !btnRef.current || !fillRef.current || !burstRef.current) return;
      const btn = btnRef.current;
      const fill = fillRef.current;
      const burst = burstRef.current;

      const tl = gsap.timeline();
      tl.to(fill, { width: '100%', duration: 0.25, ease: 'power2.out' })
        .to(btn, { scale: 1.06, duration: 0.22, ease: 'power2.out' }, 0)
        .fromTo(
          burst,
          { scale: 0.4, opacity: 0.9 },
          { scale: 2.4, opacity: 0, duration: 0.85, ease: 'power2.out' },
          0.05,
        )
        .to(btn, {
          boxShadow: '0 0 0 0 rgba(16,185,129,0), 0 0 48px 8px rgba(16,185,129,0.55)',
          duration: 0.35,
          ease: 'power2.out',
        }, 0.1)
        .to(btn, { scale: 1, duration: 0.55, ease: 'elastic.out(1, 0.45)' }, 0.28)
        .to(btn, {
          boxShadow: '0 0 0 0 rgba(16,185,129,0)',
          duration: 0.9,
          ease: 'power2.inOut',
        }, 0.7);
    },
    { dependencies: [phase] },
  );

  const label =
    phase === 'done'
      ? 'Listo'
      : phase === 'running'
        ? `Vectorizando… ${Math.round(pct)}%`
        : mode === 'test'
          ? 'Probar preset (gratis)'
          : `Vectorizar (${hojasCount} créditos)`;

  return (
    <button
      ref={btnRef}
      type="button"
      disabled={!canRun || phase === 'running'}
      onClick={async () => {
        try {
          onOpenConfirm((await fetchVectorizerAccount()).credits);
        } catch {
          onOpenConfirm(null);
        }
      }}
      className={cn(
        'relative isolate min-w-[200px] overflow-hidden rounded-md border px-4 py-2 text-sm font-medium',
        'border-white/15 bg-white/[0.04] text-foreground backdrop-blur transition',
        'hover:border-emerald-400/40 hover:bg-emerald-500/10',
        'disabled:cursor-not-allowed disabled:opacity-45',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50',
        phase === 'done' && 'border-emerald-400/70 text-emerald-50',
      )}
    >
      <div
        ref={burstRef}
        className="pointer-events-none absolute left-1/2 top-1/2 z-0 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400/40 opacity-0"
        aria-hidden
      />
      <div
        ref={fillRef}
        className={cn(
          'absolute inset-y-0 left-0 z-0 w-0',
          phase === 'done'
            ? 'bg-gradient-to-r from-emerald-600 via-emerald-400 to-teal-300'
            : 'bg-gradient-to-r from-emerald-700/90 via-emerald-500/80 to-emerald-400/70',
        )}
        aria-hidden
      />
      <span className="relative z-10 inline-flex items-center justify-center gap-1.5">
        {phase === 'done' ? <Check className="size-4" strokeWidth={2.5} /> : null}
        {phase === 'running' ? <Sparkles className="size-3.5 animate-pulse" /> : null}
        {label}
      </span>
    </button>
  );
}
