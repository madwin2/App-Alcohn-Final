'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/** Misma curva y duración que el carril en `index.tsx`. */
export const MOCKUP_STRIP_SHEET_MS = 700;
export const MOCKUP_STRIP_SHEET_EASE = 'cubic-bezier(0.22,1,0.36,1)';

export type StripFadeKind = 'none' | 'exit-up' | 'exit-down' | 'enter-below' | 'enter-above';

export type StripCardVariant = 'creations' | 'history';

const VEIL_IN = 'animate-mockup-sheet-veil-in';
const VEIL_OUT = 'animate-mockup-sheet-veil-out';

const GRADIENT: Record<Exclude<StripFadeKind, 'none'>, string> = {
  'exit-up':
    'bg-[linear-gradient(to_bottom,hsl(var(--background)/0.34)_0%,hsl(var(--background)/0.1)_32%,transparent_62%)]',
  'exit-down':
    'bg-[linear-gradient(to_top,hsl(var(--background)/0.34)_0%,hsl(var(--background)/0.1)_32%,transparent_62%)]',
  'enter-below':
    'bg-[linear-gradient(to_top,hsl(var(--background)/0.32)_0%,hsl(var(--background)/0.08)_30%,transparent_58%)]',
  'enter-above':
    'bg-[linear-gradient(to_bottom,hsl(var(--background)/0.32)_0%,hsl(var(--background)/0.08)_30%,transparent_58%)]',
};

const ANIM: Record<Exclude<StripFadeKind, 'none'>, string> = {
  'exit-up': VEIL_IN,
  'exit-down': VEIL_IN,
  'enter-below': VEIL_OUT,
  'enter-above': VEIL_OUT,
};

const CREATIONS_SCALE: Record<Exclude<StripFadeKind, 'none'>, string> = {
  'exit-up': 'animate-mockup-sheet-card-exit-up origin-top',
  'exit-down': 'animate-mockup-sheet-card-exit-down origin-bottom',
  'enter-below': 'animate-mockup-sheet-card-enter-below origin-bottom',
  'enter-above': 'animate-mockup-sheet-card-enter-above origin-top',
};

const HISTORY_SCALE: Record<Exclude<StripFadeKind, 'none'>, string> = {
  'exit-up': 'animate-mockup-history-card-exit-up origin-top',
  'exit-down': 'animate-mockup-history-card-exit-down origin-bottom',
  'enter-below': 'animate-mockup-history-card-enter-below origin-bottom',
  'enter-above': 'animate-mockup-history-card-enter-above origin-top',
};

const CASCADE_STEP_MS = 76;

function motionDelayMs(
  variant: StripCardVariant,
  kind: StripFadeKind,
  staggerMs: number,
  rowTop: number,
  rowFromBottom: number,
  rowsInPage: number,
): number {
  if (kind === 'none') return 0;
  if (variant === 'creations') return staggerMs;
  const rows = Math.max(1, rowsInPage);
  const cap = (rows - 1) * CASCADE_STEP_MS;
  if (kind === 'exit-up' || kind === 'exit-down') return Math.min(rowFromBottom * CASCADE_STEP_MS, cap);
  if (kind === 'enter-below') return Math.min(rowFromBottom * CASCADE_STEP_MS, cap);
  if (kind === 'enter-above') return Math.min(rowTop * CASCADE_STEP_MS, cap);
  return 0;
}

type Props = {
  kind: StripFadeKind;
  variant?: StripCardVariant;
  /** Creaciones: retardo compartido velo + escala (ms). */
  staggerMs?: number;
  /** Historial: fila 0 = arriba del grid de la página. */
  rowTop?: number;
  rowFromBottom?: number;
  rowsInPage?: number;
  className?: string;
  children: ReactNode;
};

/**
 * Velo atmosférico + capa interna con escala/desplazamiento alineada al carril.
 * Historial: retardo en cascada por fila (abajo primero al salir hacia arriba, etc.).
 */
export function StripCardAtmosphere({
  kind,
  variant = 'creations',
  staggerMs = 0,
  rowTop = 0,
  rowFromBottom = 0,
  rowsInPage = 1,
  className,
  children,
}: Props) {
  const delay = motionDelayMs(variant, kind, staggerMs, rowTop, rowFromBottom, rowsInPage);
  const scaleClass =
    kind !== 'none' ? (variant === 'history' ? HISTORY_SCALE[kind] : CREATIONS_SCALE[kind]) : null;

  const motionStyle =
    kind !== 'none'
      ? {
          animationDuration: `${MOCKUP_STRIP_SHEET_MS}ms`,
          animationTimingFunction: MOCKUP_STRIP_SHEET_EASE,
          animationFillMode: 'both' as const,
          animationDelay: delay > 0 ? `${delay}ms` : undefined,
          willChange: 'transform',
        }
      : undefined;

  return (
    <div className={cn('relative min-h-0', className)}>
      <div
        className={cn(
          'min-h-0 w-full transform-gpu',
          variant === 'creations' ? 'h-full' : 'h-auto',
          scaleClass,
        )}
        style={motionStyle}
      >
        {children}
      </div>
      {kind !== 'none' ? (
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0 z-20 rounded-[inherit]',
            GRADIENT[kind],
            ANIM[kind],
          )}
          style={{
            animationDuration: `${MOCKUP_STRIP_SHEET_MS}ms`,
            animationTimingFunction: MOCKUP_STRIP_SHEET_EASE,
            animationFillMode: 'both',
            animationDelay: delay > 0 ? `${delay}ms` : undefined,
            willChange: 'opacity',
          }}
        />
      ) : null}
    </div>
  );
}

export function stripFadeKindForPage(
  pageIndex: number,
  anim: { from: number; to: number } | null,
): StripFadeKind {
  if (!anim) return 'none';
  if (anim.from === pageIndex) return anim.to > anim.from ? 'exit-up' : 'exit-down';
  if (anim.to === pageIndex) return anim.to > anim.from ? 'enter-below' : 'enter-above';
  return 'none';
}
