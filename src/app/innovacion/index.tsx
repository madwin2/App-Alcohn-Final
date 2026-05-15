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
import { ProjectDetailPanel } from '@/components/innovacion/ProjectDetailPanel';
import { TaskDetailPanel } from '@/components/innovacion/TaskDetailPanel';

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
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="ml-20 space-y-5 p-6">
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
          <div className="rounded-xl border border-white/10 bg-zinc-950/40 p-6 text-sm text-zinc-400">
            Cargando mapa de innovación...
          </div>
        ) : (
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-3 2xl:grid-cols-4">
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
    </div>
  );
}
