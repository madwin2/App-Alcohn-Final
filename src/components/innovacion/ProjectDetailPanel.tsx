import { useMemo, useState } from 'react';
import { FolderKanban, PlusCircle, Trash2, Users } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { InnovacionDialogContent } from '@/components/innovacion/InnovacionDialog';
import {
  InnovacionFieldLabel,
  InnovacionModalHeader,
  InnovacionSectionHeading,
} from '@/components/innovacion/InnovacionHints';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { InnovationActivityLog } from './InnovationActivityLog';
import { innovacionFieldSurface } from '@/components/innovacion/innovacion-ui';
import {
  INNOVATION_PRIORITIES,
  INNOVATION_STATUSES,
  type InnovationArea,
  type InnovationActivityLog as InnovationActivityItem,
  type InnovationPriority,
  type InnovationProjectNode,
  type InnovationStatus,
  type InnovationTask,
} from '@/lib/supabase/services/innovation.service';

interface ProjectDetailPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: InnovationProjectNode | null;
  area: InnovationArea | null;
  users: Array<{ id: string; name: string }>;
  usersMap: Map<string, string>;
  onUpdateProject: (updates: Partial<{
    title: string;
    description: string | null;
    ownerId: string | null;
    priority: InnovationPriority;
    status: InnovationStatus;
    dueDate: string | null;
    progress: number;
  }>) => Promise<void>;
  onSaveCollaborators: (collaboratorIds: string[]) => Promise<void>;
  onCreateTask: (input: {
    title: string;
    description?: string;
    assignedTo?: string | null;
    priority?: InnovationPriority;
    status?: InnovationStatus;
    dueDate?: string | null;
  }) => Promise<void>;
  onDeleteProject: () => Promise<void>;
  onOpenTask: (task: InnovationTask) => void;
  activity: InnovationActivityItem[];
}

export function ProjectDetailPanel({
  open,
  onOpenChange,
  project,
  area,
  users,
  usersMap,
  onUpdateProject,
  onSaveCollaborators,
  onCreateTask,
  onDeleteProject,
  onOpenTask,
  activity,
}: ProjectDetailPanelProps) {
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskResponsible, setNewTaskResponsible] = useState('none');
  const [newTaskPriority, setNewTaskPriority] = useState<InnovationPriority>('Media');
  const [newTaskStatus, setNewTaskStatus] = useState<InnovationStatus>('Pendiente');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');

  const selectedCollaborators = useMemo(
    () => new Set(project?.collaboratorIds ?? []),
    [project?.collaboratorIds],
  );

  if (!project) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <InnovacionDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <InnovacionModalHeader
          icon={FolderKanban}
          title="Detalle de proyecto"
          description="Editá datos del proyecto, colaboradores y tareas. Los cambios se guardan al modificar cada campo."
        />

        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <InnovacionFieldLabel label="Título" hint="Nombre visible en el tablero y en Mis tareas del responsable." />
              <Input
                value={project.title}
                onChange={(event) => onUpdateProject({ title: event.target.value })}
                className={innovacionFieldSurface}
              />
            </div>
            <div className="space-y-2">
              <InnovacionFieldLabel label="Área" hint="Columna del tablero donde está listado este proyecto." />
              <div className={`rounded-md px-3 py-2 text-sm text-zinc-300 ${innovacionFieldSurface}`}>
                {area?.name ?? 'Sin área'}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <InnovacionFieldLabel label="Descripción" hint="Contexto, alcance o notas del proyecto para el equipo." />
            <Textarea
              value={project.description ?? ''}
              onChange={(event) => onUpdateProject({ description: event.target.value || null })}
              rows={3}
              className={innovacionFieldSurface}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <div className="space-y-2">
              <InnovacionFieldLabel label="Responsable" hint="Dueño principal del proyecto." />
              <Select
                value={project.ownerId ?? 'none'}
                onValueChange={(value) => onUpdateProject({ ownerId: value === 'none' ? null : value })}
              >
                <SelectTrigger className={innovacionFieldSurface}><SelectValue /></SelectTrigger>
                <SelectContent className="border-white/10 bg-zinc-950 text-zinc-100">
                  <SelectItem value="none">Sin responsable</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <InnovacionFieldLabel label="Estado" hint="Etapa actual en el flujo interno." />
              <Select value={project.status} onValueChange={(value) => onUpdateProject({ status: value as InnovationStatus })}>
                <SelectTrigger className={innovacionFieldSurface}><SelectValue /></SelectTrigger>
                <SelectContent className="border-white/10 bg-zinc-950 text-zinc-100">
                  {INNOVATION_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>{status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <InnovacionFieldLabel label="Prioridad" hint="Urgencia relativa frente a otras iniciativas." />
              <Select value={project.priority} onValueChange={(value) => onUpdateProject({ priority: value as InnovationPriority })}>
                <SelectTrigger className={innovacionFieldSurface}><SelectValue /></SelectTrigger>
                <SelectContent className="border-white/10 bg-zinc-950 text-zinc-100">
                  {INNOVATION_PRIORITIES.map((priority) => (
                    <SelectItem key={priority} value={priority}>{priority}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <InnovacionFieldLabel label="Fecha límite" hint="Referencia para seguimiento; no envía recordatorios automáticos." />
              <Input
                type="date"
                value={project.dueDate ?? ''}
                onChange={(event) => onUpdateProject({ dueDate: event.target.value || null })}
                className={innovacionFieldSurface}
              />
            </div>
            <div className="space-y-2">
              <InnovacionFieldLabel label={`Progreso (${project.progress}%)`} hint="Porcentaje manual de avance del proyecto." />
              <Input
                type="range"
                min={0}
                max={100}
                value={project.progress}
                onChange={(event) => onUpdateProject({ progress: Number(event.target.value) })}
                className="accent-amber-500"
              />
            </div>
          </div>

          <section className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <InnovacionSectionHeading
              icon={Users}
              title="Colaboradores"
              hint="Personas que participan además del responsable. Clic para sumar o quitar."
            />
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {users.map((user) => {
                const checked = selectedCollaborators.has(user.id);
                return (
                  <button
                    key={user.id}
                    type="button"
                    className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                      checked ? 'border-blue-500 bg-blue-500/10 text-blue-100' : 'border-white/10 bg-zinc-900 text-zinc-300'
                    }`}
                    onClick={async () => {
                      const next = new Set(project.collaboratorIds);
                      if (next.has(user.id)) {
                        next.delete(user.id);
                      } else {
                        next.add(user.id);
                      }
                      await onSaveCollaborators(Array.from(next));
                    }}
                  >
                    {user.name}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <InnovacionSectionHeading
                title={`Tareas (${project.tasks.length})`}
                hint="Clic en una tarea para abrir el detalle. Creá nuevas abajo."
              />
            </div>

            <div className="space-y-2">
              {project.tasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className="w-full rounded-lg border border-white/10 bg-zinc-900/60 p-3 text-left transition hover:border-white/20 hover:bg-zinc-900"
                  onClick={() => onOpenTask(task)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-zinc-100">{task.title}</p>
                    <Badge variant="outline" className="border-white/20 text-zinc-300">{task.status}</Badge>
                  </div>
                  <p className="text-xs text-zinc-400">
                    Responsable: {task.assignedTo ? usersMap.get(task.assignedTo) ?? 'Usuario' : 'Sin asignar'} ·
                    {' '}Prioridad: {task.priority} · Progreso: {task.progress}%
                  </p>
                </button>
              ))}
              {project.tasks.length === 0 ? (
                <p className="text-xs text-zinc-500">Aún no hay tareas para este proyecto.</p>
              ) : null}
            </div>

            <div className="mt-4 space-y-2 rounded-lg border border-dashed border-white/15 bg-zinc-950/40 p-3">
              <div className="flex items-center gap-2 text-sm text-zinc-200">
                <PlusCircle className="h-4 w-4 text-amber-400/90" />
                Nueva tarea
              </div>
              <Input
                value={newTaskTitle}
                onChange={(event) => setNewTaskTitle(event.target.value)}
                placeholder="Título"
                className={innovacionFieldSurface}
              />
              <Textarea
                value={newTaskDescription}
                onChange={(event) => setNewTaskDescription(event.target.value)}
                placeholder="Descripción opcional"
                rows={2}
                className={innovacionFieldSurface}
              />
              <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                <Select value={newTaskResponsible} onValueChange={setNewTaskResponsible}>
                  <SelectTrigger className={innovacionFieldSurface}><SelectValue placeholder="Responsable" /></SelectTrigger>
                  <SelectContent className="border-white/10 bg-zinc-950 text-zinc-100">
                    <SelectItem value="none">Sin asignar</SelectItem>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={newTaskPriority} onValueChange={(value) => setNewTaskPriority(value as InnovationPriority)}>
                  <SelectTrigger className={innovacionFieldSurface}><SelectValue /></SelectTrigger>
                  <SelectContent className="border-white/10 bg-zinc-950 text-zinc-100">
                    {INNOVATION_PRIORITIES.map((priority) => (
                      <SelectItem key={priority} value={priority}>{priority}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={newTaskStatus} onValueChange={(value) => setNewTaskStatus(value as InnovationStatus)}>
                  <SelectTrigger className={innovacionFieldSurface}><SelectValue /></SelectTrigger>
                  <SelectContent className="border-white/10 bg-zinc-950 text-zinc-100">
                    {INNOVATION_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>{status}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="date" value={newTaskDueDate} onChange={(event) => setNewTaskDueDate(event.target.value)} className={innovacionFieldSurface} />
              </div>
              <Button
                onClick={async () => {
                  if (!newTaskTitle.trim()) return;
                  await onCreateTask({
                    title: newTaskTitle.trim(),
                    description: newTaskDescription.trim() || undefined,
                    assignedTo: newTaskResponsible === 'none' ? null : newTaskResponsible,
                    priority: newTaskPriority,
                    status: newTaskStatus,
                    dueDate: newTaskDueDate || null,
                  });
                  setNewTaskTitle('');
                  setNewTaskDescription('');
                  setNewTaskResponsible('none');
                  setNewTaskPriority('Media');
                  setNewTaskStatus('Pendiente');
                  setNewTaskDueDate('');
                }}
                disabled={!newTaskTitle.trim()}
                className="bg-amber-500 text-zinc-950 hover:bg-amber-400"
              >
                Agregar tarea
              </Button>
            </div>
          </section>

          <div className="flex justify-end">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="destructive" className="gap-2" onClick={onDeleteProject}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Eliminar proyecto
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[260px] text-left">
                Elimina el proyecto y sus tareas asociadas. Esta acción no se puede deshacer.
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <InnovationActivityLog logs={activity} usersMap={usersMap} />
          </div>
        </div>
      </InnovacionDialogContent>
    </Dialog>
  );
}
