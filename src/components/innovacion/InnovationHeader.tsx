import { Lightbulb, Shapes } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { innovacionHeroCard } from '@/components/innovacion/innovacion-ui';
import { cn } from '@/lib/utils/cn';

interface InnovationHeaderProps {
  onOpenIdea: () => void;
  onOpenArea: () => void;
}

export function InnovationHeader({ onOpenIdea, onOpenArea }: InnovationHeaderProps) {
  return (
    <Card
      className={cn(
        innovacionHeroCard,
        'animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none',
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
      >
        <div className="absolute inset-y-0 -left-[45%] w-[55%] bg-gradient-to-r from-transparent via-amber-200/10 to-transparent motion-safe:animate-innovacion-edge-sheen motion-reduce:animate-none" />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent"
      />
      <CardContent className="relative p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-500">Lab interno</p>
            <h1 className="bg-gradient-to-br from-white via-zinc-100 to-zinc-400 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
              Innovación &amp; Desarrollo
            </h1>
            <p className="text-sm leading-relaxed text-zinc-400 sm:text-base">
              Mapa interno de ideas, mejoras y proyectos de Alcohn. Pensado para reuniones rápidas y seguimiento
              diario.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={onOpenIdea}
                  className="gap-2 bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg shadow-amber-900/25 hover:from-amber-500 hover:to-orange-500"
                >
                  <Lightbulb className="h-4 w-4" aria-hidden />
                  Nueva idea
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-left">
                Creá un proyecto o idea dentro de un área y asigná responsable, prioridad y estado.
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={onOpenArea}
                  className="gap-2 border-white/20 bg-white/[0.04] text-zinc-100 hover:bg-white/10 hover:text-white"
                >
                  <Shapes className="h-4 w-4" aria-hidden />
                  Nueva área
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-left">
                Las áreas agrupan proyectos: ideal para equipos, productos o iniciativas internas.
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
