import { useState } from 'react';
import { CalendarClock, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils/cn';
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
    <section className="flex h-full min-h-[420px] flex-col rounded-2xl border border-white/10 bg-zinc-950/60 p-4 backdrop-blur-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: area.color }} />
            <h3 className="truncate text-base font-semibold text-white">{area.name}</h3>
            <Badge variant="outline" className="border-white/20 text-zinc-300">
              {projects.length}
            </Badge>
          </div>
          {area.description ? (
            <p className="mt-1 text-xs text-zinc-400">{area.description}</p>
          ) : null}
        </div>
        <Button size="sm" variant="outline" onClick={() => setCreating((prev) => !prev)} className="border-white/20">
          <Plus className="mr-1 h-3 w-3" />
          Proyecto
        </Button>
      </div>

      {creating ? (
        <div className="mb-3 space-y-2 rounded-lg border border-dashed border-white/20 p-3">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Nuevo proyecto / objetivo"
            className="border-white/15 bg-zinc-900"
          />
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Descripción opcional"
            rows={2}
            className="border-white/15 bg-zinc-900"
          />
          <div className="flex gap-2">
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
            >
              Guardar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {projects.length === 0 ? (
          <p className="text-sm text-zinc-500">No hay proyectos en esta área todavía.</p>
        ) : (
          projects.map((project) => (
            <button
              key={project.id}
              type="button"
              className={cn(
                'w-full rounded-xl border border-white/10 bg-zinc-900/70 p-3 text-left transition hover:border-white/30 hover:bg-zinc-900',
              )}
              onClick={() => onOpenProject(project)}
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-semibold text-zinc-100">{project.title}</h4>
                <Badge variant="outline" className="border-white/20 text-zinc-300">
                  {project.status}
                </Badge>
              </div>
              {project.description ? (
                <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{project.description}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                <span>Resp: {project.ownerId ? usersMap.get(project.ownerId) ?? 'Usuario' : 'Sin asignar'}</span>
                <span>•</span>
                <span>Tareas: {project.tasks.length}</span>
                <span>•</span>
                <span>Progreso: {project.progress}%</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <Badge className="bg-zinc-800 text-zinc-200">{project.priority}</Badge>
                {project.dueDate ? (
                  <span className="inline-flex items-center gap-1 text-zinc-400">
                    <CalendarClock className="h-3 w-3" />
                    {new Date(project.dueDate).toLocaleDateString('es-AR')}
                  </span>
                ) : (
                  <span className="text-zinc-500">Sin fecha límite</span>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
