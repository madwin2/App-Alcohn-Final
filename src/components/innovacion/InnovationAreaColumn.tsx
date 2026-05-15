import { useState } from 'react';
import { CalendarClock, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils/cn';
import { innovacionFieldSurface, innovacionStackCard } from '@/components/innovacion/innovacion-ui';
import type {
  InnovationPriority,
  InnovationProjectNode,
  InnovationStatus,
} from '@/lib/supabase/services/innovation.service';

interface InnovationAreaColumnProps {
  area: {
    id: string;
    name: string;
    description: string | null;
    color: string;
  };
  usersMap: Map<string, string>;
  projects: InnovationProjectNode[];
  onOpenProject: (project: InnovationProjectNode) => void;
  onCreateProject: (input: {
    title: string;
    description?: string;
    priority: InnovationPriority;
    status: InnovationStatus;
  }) => Promise<void>;
}

function ProjectProgressBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/90">
      <div
        className="h-full rounded-full bg-gradient-to-r from-amber-500/90 to-orange-400/90 transition-[width] duration-500 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function InnovationAreaColumn({
  area,
  usersMap,
  projects,
  onOpenProject,
  onCreateProject,
}: InnovationAreaColumnProps) {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  return (
    <Card
      className={cn(
        innovacionStackCard,
        'snap-center shrink-0 xl:w-auto xl:min-w-0 min-w-[min(100%,20rem)] max-w-[min(100%,24rem)] xl:max-w-none',
      )}
    >
      <div
        aria-hidden
        className="h-1 w-full rounded-t-2xl"
        style={{
          background: `linear-gradient(90deg, ${area.color}cc, transparent)`,
        }}
      />
      <CardContent className="flex min-h-[420px] flex-col p-4 sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/15"
                style={{ backgroundColor: area.color }}
              />
              <h3 className="truncate text-base font-semibold tracking-tight text-white">{area.name}</h3>
              <Badge variant="outline" className="border-white/15 bg-white/[0.04] text-xs text-zinc-300">
                {projects.length}
              </Badge>
            </div>
            {area.description ? (
              <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-zinc-500">{area.description}</p>
            ) : null}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCreating((prev) => !prev)}
                className="shrink-0 border-white/15 bg-white/[0.04] text-zinc-100 hover:bg-white/10"
              >
                <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
                Proyecto
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[220px] text-left">
              {creating ? 'Cerrar formulario y descartar cambios no guardados.' : 'Agregar un proyecto u objetivo en esta área.'}
            </TooltipContent>
          </Tooltip>
        </div>

        {creating ? (
          <div className="mb-3 space-y-2 rounded-xl border border-dashed border-amber-500/25 bg-amber-500/[0.04] p-3">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Nuevo proyecto / objetivo"
              className={innovacionFieldSurface}
            />
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Descripción opcional"
              rows={2}
              className={innovacionFieldSurface}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={async () => {
                  if (!title.trim()) return;
                  await onCreateProject({
                    title: title.trim(),
                    description: description.trim() || undefined,
                    priority: 'Media',
                    status: 'Pendiente',
                  });
                  setTitle('');
                  setDescription('');
                  setCreating(false);
                }}
                disabled={!title.trim()}
                className="bg-amber-600 text-white hover:bg-amber-500"
              >
                Guardar
              </Button>
              <Button size="sm" variant="ghost" className="text-zinc-400 hover:text-white" onClick={() => setCreating(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto pr-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/12">
          {projects.length === 0 ? (
            <p className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-6 text-center text-sm text-zinc-500">
              No hay proyectos en esta área todavía.
            </p>
          ) : (
            projects.map((project) => (
              <button
                key={project.id}
                type="button"
                className={cn(
                  'group w-full rounded-xl border border-white/10 bg-zinc-950/50 p-3.5 text-left shadow-sm transition-all duration-200',
                  'hover:border-amber-500/35 hover:bg-zinc-950/80 hover:shadow-[0_12px_40px_-16px_rgba(251,191,36,0.12)]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
                )}
                onClick={() => onOpenProject(project)}
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-semibold leading-snug text-zinc-100 group-hover:text-white">
                    {project.title}
                  </h4>
                  <Badge variant="outline" className="shrink-0 border-white/15 text-[10px] uppercase tracking-wide text-zinc-400">
                    {project.status}
                  </Badge>
                </div>
                {project.description ? (
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-zinc-500">{project.description}</p>
                ) : null}
                <ProjectProgressBar value={project.progress} />
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500">
                  <span className="truncate">
                    Resp: {project.ownerId ? usersMap.get(project.ownerId) ?? 'Usuario' : 'Sin asignar'}
                  </span>
                  <span className="text-zinc-700">·</span>
                  <span>{project.tasks.length} tareas</span>
                  <span className="text-zinc-700">·</span>
                  <span>{project.progress}%</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                  <Badge className="border-0 bg-white/10 text-[10px] font-medium text-zinc-200">{project.priority}</Badge>
                  {project.dueDate ? (
                    <span className="inline-flex items-center gap-1 text-zinc-500">
                      <CalendarClock className="h-3 w-3 shrink-0 text-zinc-600" />
                      {new Date(project.dueDate).toLocaleDateString('es-AR')}
                    </span>
                  ) : (
                    <span className="text-zinc-600">Sin fecha límite</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
