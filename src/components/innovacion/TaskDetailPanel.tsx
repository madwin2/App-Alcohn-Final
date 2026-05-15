import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Detalle de tarea</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Título</Label>
            <Input
              value={task.title}
              onChange={(event) => onUpdateTask({ title: event.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Descripción</Label>
            <Textarea
              value={task.description ?? ''}
              onChange={(event) => onUpdateTask({ description: event.target.value || null })}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Responsable</Label>
              <Select
                value={task.assignedTo ?? 'none'}
                onValueChange={(value) => onUpdateTask({ assignedTo: value === 'none' ? null : value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
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
              <Label>Estado</Label>
              <Select value={task.status} onValueChange={(value) => onUpdateTask({ status: value as InnovationStatus })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INNOVATION_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Prioridad</Label>
              <Select value={task.priority} onValueChange={(value) => onUpdateTask({ priority: value as InnovationPriority })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INNOVATION_PRIORITIES.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {priority}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Fecha límite</Label>
              <Input
                type="date"
                value={task.dueDate ?? ''}
                onChange={(event) => onUpdateTask({ dueDate: event.target.value || null })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Progreso ({task.progress}%)</Label>
            <Input
              type="range"
              min={0}
              max={100}
              value={task.progress}
              onChange={(event) => onUpdateTask({ progress: Number(event.target.value) })}
            />
          </div>

          <TaskChecklist
            subtasks={subtasks}
            onCreate={onCreateSubtask}
            onToggle={onToggleSubtask}
          />

          <CommentsSection
            comments={comments}
            usersMap={usersMap}
            onCreateComment={onCreateComment}
          />

          <AttachmentsSection
            attachments={attachments}
            onUpload={onUploadAttachment}
          />

          <InnovationActivityLog logs={activity} usersMap={usersMap} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
