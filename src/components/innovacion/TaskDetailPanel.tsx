import { ListTodo } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CommentsSection } from './CommentsSection';
import { AttachmentsSection } from './AttachmentsSection';
import { TaskChecklist } from './TaskChecklist';
import { InnovationActivityLog } from './InnovationActivityLog';
import { InnovacionDialogContent } from '@/components/innovacion/InnovacionDialog';
import { InnovacionFieldLabel, InnovacionModalHeader } from '@/components/innovacion/InnovacionHints';
import { innovacionFieldSurface } from '@/components/innovacion/innovacion-ui';
import {
  INNOVATION_PRIORITIES,
  INNOVATION_STATUSES,
  type InnovationAttachment,
  type InnovationActivityLog as InnovationActivityItem,
  type InnovationComment,
  type InnovationPriority,
  type InnovationStatus,
  type InnovationSubtask,
  type InnovationTask,
} from '@/lib/supabase/services/innovation.service';

interface TaskDetailPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: InnovationTask | null;
  users: Array<{ id: string; name: string }>;
  usersMap: Map<string, string>;
  subtasks: InnovationSubtask[];
  comments: InnovationComment[];
  attachments: InnovationAttachment[];
  activity: InnovationActivityItem[];
  onUpdateTask: (updates: Partial<{
    title: string;
    description: string | null;
    assignedTo: string | null;
    priority: InnovationPriority;
    status: InnovationStatus;
    dueDate: string | null;
    progress: number;
    isCompleted: boolean;
  }>) => Promise<void>;
  onCreateSubtask: (title: string) => Promise<void>;
  onToggleSubtask: (subtaskId: string, done: boolean) => Promise<void>;
  onCreateComment: (text: string) => Promise<void>;
  onUploadAttachment: (file: File) => Promise<void>;
}

export function TaskDetailPanel({
  open,
  onOpenChange,
  task,
  users,
  usersMap,
  subtasks,
  comments,
  attachments,
  activity,
  onUpdateTask,
  onCreateSubtask,
  onToggleSubtask,
  onCreateComment,
  onUploadAttachment,
}: TaskDetailPanelProps) {
  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <InnovacionDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <InnovacionModalHeader
          icon={ListTodo}
          title="Detalle de tarea"
          description="Editá la tarea, checklist, comentarios y adjuntos. Los cambios se sincronizan con Mis tareas del responsable."
        />

        <div className="space-y-6">
          <div className="space-y-2">
            <InnovacionFieldLabel label="Título" hint="Nombre de la tarea en el tablero y en el inicio." />
            <Input
              value={task.title}
              onChange={(event) => onUpdateTask({ title: event.target.value })}
              className={innovacionFieldSurface}
            />
          </div>

          <div className="space-y-2">
            <InnovacionFieldLabel label="Descripción" hint="Detalle, criterios de hecho o enlaces útiles." />
            <Textarea
              value={task.description ?? ''}
              onChange={(event) => onUpdateTask({ description: event.target.value || null })}
              rows={3}
              className={innovacionFieldSurface}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="space-y-2">
              <InnovacionFieldLabel label="Responsable" hint="Aparece en Mis tareas de esa persona." />
              <Select
                value={task.assignedTo ?? 'none'}
                onValueChange={(value) => onUpdateTask({ assignedTo: value === 'none' ? null : value })}
              >
                <SelectTrigger className={innovacionFieldSurface}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-zinc-950 text-zinc-100">
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <InnovacionFieldLabel label="Estado" hint="Etapa en el flujo de trabajo." />
              <Select value={task.status} onValueChange={(value) => onUpdateTask({ status: value as InnovationStatus })}>
                <SelectTrigger className={innovacionFieldSurface}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-zinc-950 text-zinc-100">
                  {INNOVATION_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <InnovacionFieldLabel label="Prioridad" hint="Urgencia de esta tarea frente a otras." />
              <Select value={task.priority} onValueChange={(value) => onUpdateTask({ priority: value as InnovationPriority })}>
                <SelectTrigger className={innovacionFieldSurface}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-zinc-950 text-zinc-100">
                  {INNOVATION_PRIORITIES.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {priority}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <InnovacionFieldLabel label="Fecha límite" hint="Referencia de vencimiento para el seguimiento." />
              <Input
                type="date"
                value={task.dueDate ?? ''}
                onChange={(event) => onUpdateTask({ dueDate: event.target.value || null })}
                className={innovacionFieldSurface}
              />
            </div>
          </div>

          <div className="space-y-2">
            <InnovacionFieldLabel label={`Progreso (${task.progress}%)`} hint="Deslizá para indicar avance manual de la tarea." />
            <Input
              type="range"
              min={0}
              max={100}
              value={task.progress}
              onChange={(event) => onUpdateTask({ progress: Number(event.target.value) })}
              className="accent-amber-500"
            />
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <TaskChecklist subtasks={subtasks} onCreate={onCreateSubtask} onToggle={onToggleSubtask} />
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <CommentsSection comments={comments} usersMap={usersMap} onCreateComment={onCreateComment} />
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <AttachmentsSection attachments={attachments} onUpload={onUploadAttachment} />
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <InnovationActivityLog logs={activity} usersMap={usersMap} />
          </div>
        </div>
      </InnovacionDialogContent>
    </Dialog>
  );
}
