import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ClipboardList, LayoutDashboard, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
  const [refreshing, setRefreshing] = useState(false);
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
    loadTasks().finally(() => {
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
    <TooltipProvider delayDuration={280}>
      <div className="relative h-full overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/75 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_24px_64px_-20px_rgba(0,0,0,0.65)] ring-1 ring-white/[0.06] backdrop-blur-xl">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        aria-hidden
        style={{
          backgroundImage:
            'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(251,191,36,0.12), transparent), radial-gradient(ellipse 60% 40% at 100% 100%, rgba(59,130,246,0.08), transparent)',
        }}
      />
      <div className="relative z-[1] flex h-full min-h-0 flex-col">
        <div className="mb-3 flex shrink-0 flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Dashboard personal</p>
            <h3 className="mt-0.5 flex items-center gap-2 text-lg font-semibold tracking-tight text-zinc-50">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                <ClipboardList className="h-4 w-4 text-amber-400/90" />
              </span>
              Mis tareas
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 border border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/[0.06]"
                  asChild
                >
                  <Link to="/innovacion" className="gap-1">
                    <LayoutDashboard className="h-3.5 w-3.5" aria-hidden />
                    Tablero
                    <ArrowUpRight className="h-3 w-3 opacity-70" aria-hidden />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[240px] text-left">
                Abrí el tablero completo de Innovación &amp; Desarrollo para ver áreas y proyectos del equipo.
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 border border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/[0.06]"
                  onClick={() => {
                    setRefreshing(true);
                    loadTasks().finally(() => setRefreshing(false));
                  }}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
                  Actualizar
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Sincronizar con el servidor (también se actualiza solo con cambios en vivo).</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15">
          {loading && tasks.length === 0 ? (
            <div className="space-y-2 py-1" aria-busy>
              {[0, 1, 2].map((key) => (
                <div
                  key={key}
                  className="h-24 animate-pulse rounded-xl border border-white/5 bg-zinc-900/50"
                />
              ))}
            </div>
          ) : tasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/15 bg-zinc-900/30 px-4 py-8 text-center">
              <p className="text-sm text-zinc-400">No tenés tareas asignadas por ahora.</p>
              <p className="mt-1 text-xs text-zinc-500">Cuando te asignen algo en Innovación, aparecerá acá.</p>
            </div>
          ) : (
            tasks.map(({ task, area, project, subtasks, recentComments }) => {
              const doneSub = subtasks.filter((item) => item.isCompleted).length;
              const totalSub = subtasks.length;
              return (
                <button
                  type="button"
                  key={task.id}
                  onClick={() => loadTaskDetail(task)}
                  className="group w-full rounded-xl border border-white/10 bg-zinc-900/55 p-3 text-left shadow-sm transition hover:border-amber-500/25 hover:bg-zinc-900/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-snug text-zinc-100 group-hover:text-white">{task.title}</p>
                    <Badge variant="outline" className="shrink-0 border-white/15 bg-black/20 text-[11px] text-zinc-200">
                      {task.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    <span className="text-zinc-400">{area?.name ?? 'Área'}</span>
                    <span className="mx-1 text-zinc-600">·</span>
                    <span>{project?.title ?? 'Proyecto'}</span>
                  </p>
                  <div className="mt-2.5 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-zinc-500">
                      <span>Progreso</span>
                      <span className="tabular-nums text-zinc-400">{task.progress}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-500/90 to-amber-400/70 transition-[width] duration-300"
                        style={{ width: `${Math.min(100, Math.max(0, task.progress))}%` }}
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                    <span>
                      Prioridad: <span className="text-zinc-400">{task.priority}</span>
                    </span>
                    <span>
                      Subtareas:{' '}
                      <span className="tabular-nums text-zinc-400">
                        {doneSub}/{totalSub || 0}
                      </span>
                    </span>
                    {task.dueDate ? (
                      <span>
                        Vence:{' '}
                        <span className="text-zinc-400">{new Date(task.dueDate).toLocaleDateString('es-AR')}</span>
                      </span>
                    ) : null}
                  </div>
                  {recentComments[0] ? (
                    <p className="mt-2 line-clamp-2 border-t border-white/5 pt-2 text-[11px] leading-relaxed text-zinc-500">
                      <span className="text-zinc-600">Último comentario · </span>
                      {recentComments[0].comment}
                    </p>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
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
    </TooltipProvider>
  );
}
