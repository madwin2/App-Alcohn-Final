import { BookOpen } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils/cn';

/** Acceso rápido al Centro Alcohn, mismo estilo que la campanita de notificaciones. */
export function CentroFloatButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const isActive =
    location.pathname === '/centro' || location.pathname.startsWith('/centro/');

  return (
    <button
      type="button"
      aria-label="Centro Alcohn"
      title="Centro Alcohn"
      onClick={() => navigate('/centro')}
      className={cn(
        'relative flex h-[52px] w-[52px] items-center justify-center',
        'rounded-full border border-white/10',
        'bg-gradient-to-br from-zinc-900/95 via-black/70 to-black/95',
        'shadow-[0_12px_30px_-8px_rgba(0,0,0,0.85)] backdrop-blur-sm',
        'transition-transform duration-200 hover:scale-105 hover:bg-white/[0.06]',
        isActive && 'ring-2 ring-white/25',
      )}
    >
      <BookOpen className="h-5 w-5 text-white" strokeWidth={1.75} />
    </button>
  );
}
