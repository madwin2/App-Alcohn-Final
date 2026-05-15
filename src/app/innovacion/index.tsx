import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sidebar } from '@/components/pedidos/Sidebar/Sidebar';
import { Toaster } from '@/components/ui/toaster';
import { useAuth } from '@/lib/hooks/useAuth';
import { useToast } from '@/components/ui/use-toast';
import { getApprovedUsers } from '@/lib/supabase/services/auth.service';
import { supabase } from '@/lib/supabase/client';
import {
  createInnovationArea,
  createInnovationComment,
  createInnovationProject,
  createInnovationRealtimeChannel,
  createInnovationSubtask,
  createInnovationTask,
  deleteInnovationProject,
  getInnovationActivityForEntity,
  getInnovationBoardData,
  setInnovationProjectCollaborators,
  updateInnovationProject,
  updateInnovationSubtask,
  updateInnovationTask,
  uploadInnovationAttachment,
  type InnovationAttachment,
  type InnovationActivityLog,
  type InnovationAreaNode,
  type InnovationComment,
  type InnovationPriority,
  type InnovationStatus,
  type InnovationTask,
} from '@/lib/supabase/services/innovation.service';
import { InnovationHeader } from '@/components/innovacion/InnovationHeader';
import { CreateAreaModal } from '@/components/innovacion/CreateAreaModal';
import { CreateIdeaModal } from '@/components/innovacion/CreateIdeaModal';
import {
  InnovationFilters,
  type InnovationFiltersValue,
} from '@/components/innovacion/InnovationFilters';
import { InnovationAreaColumn } from '@/components/innovacion/InnovationAreaColumn';
import { InnovacionPageLayout } from '@/components/innovacion/InnovacionPageLayout';
import { ProjectDetailPanel } from '@/components/innovacion/ProjectDetailPanel';
import { TaskDetailPanel } from '@/components/innovacion/TaskDetailPanel';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { FilterX, Shapes, Sparkles } from 'lucide-react';

const DEFAULT_FILTERS: InnovationFiltersValue = {
  query: '',
  areaId: 'all',
  responsibleId: 'all',
  status: 'all',
  priority: 'all',
};

export default function InnovacionPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [areas, setAreas] = useState<InnovationAreaNode[]>([]);
  const [comments, setComments] = useState<InnovationComment[]>([]);
  const [attachments, setAttachments] = useState<InnovationAttachment[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [projectActivity, setProjectActivity] = useState<InnovationActivityLog[]>([]);
  const [taskActivity, setTaskActivity] = useState<InnovationActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<InnovationFiltersValue>(DEFAULT_FILTERS);
  const [areaModalOpen, setAreaModalOpen] = useState(false);
  const [ideaModalOpen, setIdeaModalOpen] = useState(false);
  const [projectPanelOpen, setProjectPanelOpen] = useState(false);
  const [taskPanelOpen, setTaskPanelOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const usersMap = useMemo(() => new Map(users.map((entry) => [entry.id, entry.name])), [users]);

  const loadBoard = useCallback(async () => {
    const data = await getInnovationBoardData();
    setAreas(data.areas);
    setComments(data.comments);
    setAttachments(data.attachments);
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([loadBoard(), getApprovedUsers()])
      .then(([, approved]) => {
        if (!mounted) return;
        setUsers(approved);
      })
      .catch((error) => {
        console.error(error);
        toast({
          title: 'Error',
          description: 'No se pudo cargar Innovación & Desarrollo.',
          variant: 'destructive',
        });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [loadBoard, toast]);

  useEffect(() => {
    const channel = createInnovationRealtimeChannel(() => {
      loadBoard().catch(() => {
        // noop
      });
    });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadBoard]);

  useEffect(() => {
    if (!selectedProjectId) {
      setProjectActivity([]);
      return;
    }
    getInnovationActivityForEntity('project', selectedProjectId)
      .then(setProjectActivity)
      .catch(() => setProjectActivity([]));
  }, [selectedProjectId]);

  useEffect(() => {
    if (!selectedTaskId) {
      setTaskActivity([]);
      return;
    }
    getInnovationActivityForEntity('task', selectedTaskId)
      .then(setTaskActivity)
      .catch(() => setTaskActivity([]));
  }, [selectedTaskId]);

  const selectedProjectWithArea = useMemo(() => {
    if (!selectedProjectId) return null;
    for (const area of areas) {
      const project = area.projects.find((item) => item.id === selectedProjectId);
      if (project) return { area, project };
    }
    return null;
  }, [areas, selectedProjectId]);

  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null;
    for (const area of areas) {
      for (const project of area.projects) {
        const task = project.tasks.find((item) => item.id === selectedTaskId);
        if (task) return task;
      }
    }
    return null;
  }, [areas, selectedTaskId]);

  const selectedTaskSubtasks = selectedTask?.subtasks ?? [];
  const selectedTaskComments = useMemo(
    () => (selectedTask ? comments.filter((entry) => entry.entityId === selectedTask.id && entry.entityType === 'task') : []),
    [comments, selectedTask],
  );
  const selectedTaskAttachments = useMemo(
    () => (selectedTask ? attachments.filter((entry) => entry.entityId === selectedTask.id && entry.entityType === 'task') : []),
    [attachments, selectedTask],
  );

  const filteredAreas = useMemo(() => {
    const query = filters.query.trim().toLowerCase();

    return areas
      .filter((area) => (filters.areaId === 'all' ? true : area.id === filters.areaId))
      .map((area) => ({
        ...area,
        projects: area.projects.filter((project) => {
          const taskMatchesResponsible =
            filters.responsibleId === 'all'
              ? true
              : project.ownerId === filters.responsibleId ||
                project.tasks.some((task) => task.assignedTo === filters.responsibleId);

          const statusMatches =
            filters.status === 'all'
              ? true
              : project.status === filters.status ||
                project.tasks.some((task) => task.status === filters.status);

          const priorityMatches =
            filters.priority === 'all'
              ? true
              : project.priority === filters.priority ||
                project.tasks.some((task) => task.priority === filters.priority);

          const queryMatches =
            query.length === 0
              ? true
              : [
                  area.name,
                  area.description ?? '',
                  project.title,
                  project.description ?? '',
                  ...project.tasks.flatMap((task) => [task.title, task.description ?? '']),
                ]
                  .join(' ')
                  .toLowerCase()
                  .includes(query);

          return taskMatchesResponsible && statusMatches && priorityMatches && queryMatches;
        }),
      }))
      .filter((area) => area.projects.length > 0 || filters.areaId === area.id || query.length === 0);
  }, [areas, filters]);

  const createArea = async (input: { name: string; description?: string; color: string }) => {
    if (!user?.id) return;
    await createInnovationArea(
      {
        name: input.name,
        description: input.description,
        color: input.color,
        createdBy: user.id,
      },
    );
    await loadBoard();
    toast({ title: 'Área creada', description: `${input.name} fue creada correctamente.` });
  };

  const createIdea = async (input: {
    title: string;
    areaId: string;
    description?: string;
    ownerId?: string;
    priority: InnovationPriority;
    status: InnovationStatus;
  }) => {
    if (!user?.id) return;
    await createInnovationProject(
      {
        areaId: input.areaId,
        title: input.title,
        description: input.description,
        ownerId: input.ownerId ?? null,
        priority: input.priority,
        status: input.status,
      },
      user.id,
    );
    await loadBoard();
    toast({ title: 'Idea creada', description: 'La idea quedó registrada en el tablero.' });
  };

  return (
    <InnovacionPageLayout>
      <Sidebar />
      <main className="ml-20 flex min-h-screen flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
          <InnovationHeader
            onOpenArea={() => setAreaModalOpen(true)}
            onOpenIdea={() => setIdeaModalOpen(true)}
          />

          <InnovationFilters
            value={filters}
            onChange={setFilters}
            areas={areas.map((area) => ({ id: area.id, name: area.name }))}
            users={users}
          />

          {loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((slot) => (
                <div
                  key={slot}
                  className="animate-pulse rounded-2xl border border-white/10 bg-zinc-900/40 p-4 shadow-inner"
                >
                  <div className="mb-4 h-4 w-[40%] max-w-[10rem] rounded bg-zinc-800" />
                  <div className="space-y-3">
                    <div className="h-24 rounded-xl bg-zinc-800/80" />
                    <div className="h-24 rounded-xl bg-zinc-800/60" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredAreas.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/15 bg-zinc-900/30 px-6 py-16 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-500 motion-reduce:animate-none">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] shadow-[0_0_40px_rgba(251,191,36,0.08)]">
                <Sparkles className="h-7 w-7 text-amber-300/90" strokeWidth={1.5} />
              </div>
              <div className="max-w-md space-y-2">
                <h2 className="text-lg font-semibold tracking-tight text-white">
                  {areas.length === 0 ? 'Empezá creando un área' : 'No hay resultados con estos filtros'}
                </h2>
                <p className="text-sm text-zinc-400">
                  {areas.length === 0
                    ? 'Las áreas agrupan proyectos e ideas. Podés crear la primera y después cargar ideas rápido desde el botón superior.'
                    : 'Probá limpiar la búsqueda o cambiar área, responsable, estado o prioridad.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      onClick={() => setAreaModalOpen(true)}
                      className="gap-2 bg-amber-600 text-white hover:bg-amber-500"
                    >
                      <Shapes className="h-4 w-4" aria-hidden />
                      Nueva área
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[240px] text-left">
                    Creá una columna en el tablero para agrupar proyectos por equipo o tema.
                  </TooltipContent>
                </Tooltip>
                {areas.length > 0 ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2 border-white/20 text-zinc-200 hover:bg-white/10"
                        onClick={() => setFilters(DEFAULT_FILTERS)}
                      >
                        <FilterX className="h-4 w-4" aria-hidden />
                        Limpiar filtros
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      Restablecé búsqueda, área, responsable, estado y prioridad.
                    </TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
            </div>
          ) : (
            <section className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 [-ms-overflow-style:none] [scrollbar-width:thin] xl:grid xl:snap-none xl:grid-cols-3 xl:overflow-visible 2xl:grid-cols-4 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15">
              {filteredAreas.map((area) => (
                <InnovationAreaColumn
                  key={area.id}
                  area={area}
                  usersMap={usersMap}
                  projects={area.projects}
                  onOpenProject={(project) => {
                    setSelectedProjectId(project.id);
                    setProjectPanelOpen(true);
                  }}
                  onCreateProject={async (input) => {
                    if (!user?.id) return;
                    await createInnovationProject(
                      {
                        areaId: area.id,
                        title: input.title,
                        description: input.description,
                        priority: input.priority,
                        status: input.status,
                      },
                      user.id,
                    );
                    await loadBoard();
                  }}
                />
              ))}
            </section>
          )}
        </div>
      </main>

      <CreateAreaModal open={areaModalOpen} onOpenChange={setAreaModalOpen} onSubmit={createArea} />
      <CreateIdeaModal
        open={ideaModalOpen}
        onOpenChange={setIdeaModalOpen}
        areas={areas.map((area) => ({ id: area.id, name: area.name }))}
        users={users}
        onSubmit={createIdea}
      />

      <ProjectDetailPanel
        open={projectPanelOpen}
        onOpenChange={(open) => {
          setProjectPanelOpen(open);
          if (!open) setSelectedProjectId(null);
        }}
        project={selectedProjectWithArea?.project ?? null}
        area={selectedProjectWithArea?.area ?? null}
        users={users}
        usersMap={usersMap}
        onUpdateProject={async (updates) => {
          if (!user?.id || !selectedProjectWithArea?.project) return;
          await updateInnovationProject(selectedProjectWithArea.project.id, updates, user.id);
          await loadBoard();
        }}
        onSaveCollaborators={async (collaboratorIds) => {
          if (!user?.id || !selectedProjectWithArea?.project) return;
          await setInnovationProjectCollaborators(selectedProjectWithArea.project.id, collaboratorIds, user.id);
          await loadBoard();
        }}
        onCreateTask={async (input) => {
          if (!user?.id || !selectedProjectWithArea?.project) return;
          await createInnovationTask(
            {
              projectId: selectedProjectWithArea.project.id,
              ...input,
            },
            user.id,
          );
          await loadBoard();
        }}
        onDeleteProject={async () => {
          if (!user?.id || !selectedProjectWithArea?.project) return;
          await deleteInnovationProject(selectedProjectWithArea.project.id, user.id);
          setProjectPanelOpen(false);
          setSelectedProjectId(null);
          await loadBoard();
          toast({ title: 'Proyecto eliminado' });
        }}
        onOpenTask={(task) => {
          setSelectedTaskId(task.id);
          setTaskPanelOpen(true);
        }}
        activity={projectActivity}
      />

      <TaskDetailPanel
        open={taskPanelOpen}
        onOpenChange={(open) => {
          setTaskPanelOpen(open);
          if (!open) setSelectedTaskId(null);
        }}
        task={selectedTask as InnovationTask | null}
        users={users}
        usersMap={usersMap}
        subtasks={selectedTaskSubtasks}
        comments={selectedTaskComments}
        attachments={selectedTaskAttachments}
        activity={taskActivity}
        onUpdateTask={async (updates) => {
          if (!user?.id || !selectedTaskId) return;
          await updateInnovationTask(selectedTaskId, updates, user.id);
          await loadBoard();
          const activity = await getInnovationActivityForEntity('task', selectedTaskId);
          setTaskActivity(activity);
        }}
        onCreateSubtask={async (title) => {
          if (!user?.id || !selectedTaskId) return;
          await createInnovationSubtask({ taskId: selectedTaskId, title }, user.id);
          await loadBoard();
          const activity = await getInnovationActivityForEntity('task', selectedTaskId);
          setTaskActivity(activity);
        }}
        onToggleSubtask={async (subtaskId, done) => {
          if (!user?.id || !selectedTaskId) return;
          await updateInnovationSubtask(subtaskId, { isCompleted: done }, user.id);
          await loadBoard();
          const activity = await getInnovationActivityForEntity('task', selectedTaskId);
          setTaskActivity(activity);
        }}
        onCreateComment={async (text) => {
          if (!user?.id || !selectedTaskId) return;
          await createInnovationComment('task', selectedTaskId, text, user.id);
          await loadBoard();
          const activity = await getInnovationActivityForEntity('task', selectedTaskId);
          setTaskActivity(activity);
        }}
        onUploadAttachment={async (file) => {
          if (!user?.id || !selectedTaskId) return;
          await uploadInnovationAttachment(file, 'task', selectedTaskId, user.id);
          await loadBoard();
          const activity = await getInnovationActivityForEntity('task', selectedTaskId);
          setTaskActivity(activity);
        }}
      />

      <Toaster />
    </InnovacionPageLayout>
  );
}
