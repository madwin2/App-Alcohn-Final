import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export function FakeLogo({ variant }: { variant: 'bird' | 'mono' | 'crown' | 'seal' }) {
  if (variant === 'bird') {
    return (
      <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden>
        <path
          d="M10 44c6-22 18-30 28-22 6 5 10 4 16-2-4 14-2 24 6 32-14-2-24-6-32-14-4 6-10 8-18 6z"
          fill="#18181b"
        />
      </svg>
    );
  }
  if (variant === 'mono') {
    return (
      <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden>
        <circle cx="32" cy="32" r="26" fill="none" stroke="#18181b" strokeWidth="4" />
        <text
          x="32"
          y="38"
          textAnchor="middle"
          fontSize="20"
          fontWeight="700"
          fontFamily="Georgia, serif"
          fill="#18181b"
        >
          DS
        </text>
      </svg>
    );
  }
  if (variant === 'crown') {
    return (
      <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden>
        <path d="M12 44 L16 22 L28 34 L32 16 L36 34 L48 22 L52 44 Z" fill="#18181b" />
        <rect x="12" y="44" width="40" height="6" rx="1" fill="#18181b" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden>
      <circle cx="32" cy="32" r="24" fill="none" stroke="#18181b" strokeWidth="3" />
      <circle cx="32" cy="32" r="14" fill="none" stroke="#18181b" strokeWidth="2" />
      <text x="32" y="36" textAnchor="middle" fontSize="10" fontWeight="700" fill="#18181b">
        JK
      </text>
    </svg>
  );
}

export function Thumb({
  variant,
  selected,
  label,
}: {
  variant: 'bird' | 'mono' | 'crown' | 'seal';
  selected?: boolean;
  label?: string;
}) {
  return (
    <div
      className={cn(
        'relative aspect-square overflow-hidden rounded-xl bg-gradient-to-b from-zinc-100 to-zinc-300 p-2 shadow-sm',
        selected && 'ring-2 ring-sky-400/80 ring-offset-2 ring-offset-zinc-900',
      )}
    >
      <FakeLogo variant={variant} />
      {label ? (
        <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1 py-0.5 text-[8px] font-medium text-white">
          {label}
        </span>
      ) : null}
    </div>
  );
}

export function StageShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col justify-center overflow-hidden bg-zinc-900 p-4 sm:p-5',
        className,
      )}
    >
      {children}
    </div>
  );
}
