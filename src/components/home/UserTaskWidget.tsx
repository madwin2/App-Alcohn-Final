import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  createInnovationComment,
  createInnovationRealtimeChannel,
  createInnovationSubtask,
  getInnovationAttachmentsForEntity,
  getInnovationActivityForEntity,
  getInnovationCommentsForEntity,
  getInnovationUserTasks,
  type InnovationAttachment,
  type InnovationActivityLog as InnovationActivityItem,
  type InnovationComment,
  type InnovationSubtask,
  type InnovationTask,
  type InnovationUserTask,
  updateInnovationSubtask,
  updateInnovationTask,
  uploadInnovationAttachment,
  type InnovationPriority,
  type InnovationStatus,
} from '@/lib/supabase/services/innovation.service';
import { supabase } from '@/lib/supabase/client';
import { TaskDetailPanel } from '@/components/innovacion/TaskDetailPanel';

interface UserTaskWidgetProps {
  userId: string;
  users: Array<{ id: string; name: string }>;
}

export function UserTaskWidget({ userId, users }: UserTaskWidgetProps) {
  const usersMap = useMemo(() => new Map(users.map((user) => [user.id, user.name])), [users]);
  const [tasks, setTasks] = useState<InnovationUserTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<InnovationTask | null>(null);
  const [selectedSubtasks, setSelectedSubtasks] = useState<InnovationSubtask[]>([]);
  const [selectedComments, setSelectedComments] = useState<InnovationComment[]>([]);
  const [selectedAttachments, setSelectedAttachments] = useState<InnovationAttachment[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<InnovationActivityItem[]>([]);

  const selectedTaskId = selectedTask?.id ?? null;

  const loadTasks = useCallback(async () => {
    if (!userId) return [] as InnovationUserTask[];
    const data = await getInnovationUserTasks(userId);
    setTasks(data);
    return data;
  }, [userId]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
      loadTasks()
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [loadTasks]);

  useEffect(() => {
    if (!userId) return;
    const channel = createInnovationRealtimeChannel(() => {
      loadTasks();
    });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, loadTasks]);

  const loadTaskDetail = useCallback(async (task: InnovationTask) => {
    setSelectedTask(task);
    const [comments, attachments, activity, latestTasks] = await Promise.all([
      getInnovationCommentsForEntity('task', task.id),
      getInnovationAttachmentsForEntity('task', task.id),
      getInnovationActivityForEntity('task', task.id),
      loadTasks(),
    ]);
    setSelectedComments(comments);
    setSelectedAttachments(attachments);
    setSelectedActivity(activity);
    const current = latestTasks.find((entry) => entry.task.id === task.id);
    setSelectedSubtasks(current?.subtasks ?? []);
  }, [loadTasks]);

  return (
    <div className="h-full rounded-2xl border border-white/10 bg-zinc-950/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Dashboard personal</p>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
            <ClipboardList className="h-5 w-5 text-blue-300" />
            Mis tareas
          </h3>
        </div>
        <Button variant="ghost" size="sm" className="gap-1" onClick={loadTasks}>
          <RefreshCw className="h-3.5 w-3.5" />
          Actualizar
        </Button>
      </div>

      <div className="space-y-2">
        {loading ? (
          <p className="text-sm text-zinc-400">Cargando tareas...</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-zinc-500">No tenés tareas asignadas por ahora.</p>
        ) : (
          tasks.map(({ task, area, project, subtasks, recentComments }) => (
            <button
              type="button"
              key={task.id}
              onClick={() => loadTaskDetail(task)}
              className="w-full rounded-lg border border-white/10 bg-zinc-900/70 p-3 text-left hover:border-white/25"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-zinc-100">{task.title}</p>
                <Badge variant="outline" className="border-white/20 text-zinc-300">
                  {task.status}
                </Badge>
              </div>
              <p className="text-xs text-zinc-400">
                {area?.name ?? 'Área'} · {project?.title ?? 'Proyecto'}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-400">
                <span>Prioridad: {task.priority}</span>
                <span>Progreso: {task.progress}%</span>
                <span>Subtareas: {subtasks.filter((item) => item.isCompleted).length}/{subtasks.length}</span>
                {task.dueDate ? (
                  <span>Vence: {new Date(task.dueDate).toLocaleDateString('es-AR')}</span>
                ) : null}
              </div>
              {recentComments[0] ? (
                <p className="mt-2 line-clamp-1 text-xs text-zinc-500">Último comentario: {recentComments[0].comment}</p>
              ) : null}
            </button>
          ))
        )}
      </div>

      <TaskDetailPanel
        open={Boolean(selectedTask)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedTask(null);
            setSelectedComments([]);
            setSelectedAttachments([]);
            setSelectedSubtasks([]);
            setSelectedActivity([]);
          }
        }}
        task={selectedTask}
        users={users}
        usersMap={usersMap}
        subtasks={selectedSubtasks}
        comments={selectedComments}
        attachments={selectedAttachments}
        activity={selectedActivity}
        onUpdateTask={async (updates) => {
          if (!selectedTaskId) return;
          await updateInnovationTask(
            selectedTaskId,
            updates as Partial<{
              title: string;
              description: string | null;
              assignedTo: string | null;
              priority: InnovationPriority;
              status: InnovationStatus;
              dueDate: string | null;
              progress: number;
              isCompleted: boolean;
            }>,
            userId,
          );
          const latestTasks = await loadTasks();
          const nextTask = latestTasks.find((entry) => entry.task.id === selectedTaskId)?.task;
          if (nextTask) {
            setSelectedTask({ ...nextTask, ...updates });
          }
        }}
        onCreateSubtask={async (title) => {
          if (!selectedTaskId) return;
          await createInnovationSubtask({ taskId: selectedTaskId, title }, userId);
          const latestTasks = await loadTasks();
          const refreshed = latestTasks.find((entry) => entry.task.id === selectedTaskId);
          setSelectedSubtasks(refreshed?.subtasks ?? []);
        }}
        onToggleSubtask={async (subtaskId, done) => {
          await updateInnovationSubtask(subtaskId, { isCompleted: done }, userId);
          const latestTasks = await loadTasks();
          const refreshed = latestTasks.find((entry) => entry.task.id === selectedTaskId);
          setSelectedSubtasks(refreshed?.subtasks ?? []);
        }}
        onCreateComment={async (text) => {
          if (!selectedTaskId) return;
          await createInnovationComment('task', selectedTaskId, text, userId);
          const comments = await getInnovationCommentsForEntity('task', selectedTaskId);
          setSelectedComments(comments);
          await loadTasks();
        }}
        onUploadAttachment={async (file) => {
          if (!selectedTaskId) return;
          await uploadInnovationAttachment(file, 'task', selectedTaskId, userId);
          const attachments = await getInnovationAttachmentsForEntity('task', selectedTaskId);
          setSelectedAttachments(attachments);
          const activity = await getInnovationActivityForEntity('task', selectedTaskId);
          setSelectedActivity(activity);
        }}
      />
    </div>
  );
}
