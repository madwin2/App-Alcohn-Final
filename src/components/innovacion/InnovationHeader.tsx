import { Lightbulb, Shapes } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface InnovationHeaderProps {
  onOpenIdea: () => void;
  onOpenArea: () => void;
}

export function InnovationHeader({ onOpenIdea, onOpenArea }: InnovationHeaderProps) {
  return (
    <header className="rounded-2xl border border-white/10 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 p-6 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)]">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Lab interno</p>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Innovación &amp; Desarrollo</h1>
          <p className="text-sm text-zinc-300">
            Mapa interno de ideas, mejoras y proyectos de Alcohn.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onOpenIdea} className="gap-2 bg-blue-600 hover:bg-blue-500">
            <Lightbulb className="h-4 w-4" />
            Nueva idea
          </Button>
          <Button variant="outline" onClick={onOpenArea} className="gap-2 border-white/20 text-white hover:bg-white/10">
            <Shapes className="h-4 w-4" />
            Nueva área
          </Button>
        </div>
      </div>
    </header>
  );
}
