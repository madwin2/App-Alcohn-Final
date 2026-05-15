import { supabase } from '../client';

const INNOVATION_ATTACHMENTS_BUCKET =
  (import.meta as any)?.env?.VITE_INNOVATION_ATTACHMENTS_BUCKET || 'adjuntos';

export const INNOVATION_STATUSES = [
  'Pendiente',
  'En proceso',
  'Esperando revisión',
  'Bloqueado',
  'Finalizado',
  'Cancelado',
] as const;

export const INNOVATION_PRIORITIES = ['Baja', 'Media', 'Alta', 'Crítica'] as const;

export type InnovationStatus = (typeof INNOVATION_STATUSES)[number];
export type InnovationPriority = (typeof INNOVATION_PRIORITIES)[number];
export type InnovationEntityType = 'area' | 'project' | 'task' | 'subtask';

export interface InnovationArea {
  id: string;
  name: string;
  description: string | null;
  color: string;
  status: 'Activa' | 'Archivada';
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InnovationProject {
  id: string;
  areaId: string;
  title: string;
  description: string | null;
  ownerId: string | null;
  collaboratorIds: string[];
  priority: InnovationPriority;
  status: InnovationStatus;
  dueDate: string | null;
  progress: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InnovationTask {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  assignedTo: string | null;
  priority: InnovationPriority;
  status: InnovationStatus;
  isCompleted: boolean;
  dueDate: string | null;
  progress: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InnovationSubtask {
  id: string;
  taskId: string;
  title: string;
  assignedTo: string | null;
  isCompleted: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InnovationComment {
  id: string;
  entityType: InnovationEntityType;
  entityId: string;
  userId: string | null;
  comment: string;
  createdAt: string;
  updatedAt: string;
}

export interface InnovationAttachment {
  id: string;
  entityType: InnovationEntityType;
  entityId: string;
  fileUrl: string;
  fileName: string;
  fileType: string | null;
  uploadedBy: string | null;
  createdAt: string;
}

export interface InnovationActivityLog {
  id: string;
  entityType: 'area' | 'project' | 'task' | 'subtask' | 'comment' | 'attachment';
  entityId: string;
  action: 'created' | 'updated' | 'deleted';
  summary: string;
  payload: Record<string, unknown> | null;
  actorId: string | null;
  createdAt: string;
}

export interface InnovationProjectNode extends InnovationProject {
  tasks: InnovationTaskNode[];
}

export interface InnovationTaskNode extends InnovationTask {
  subtasks: InnovationSubtask[];
}

export interface InnovationAreaNode extends InnovationArea {
  projects: InnovationProjectNode[];
}

export interface InnovationBoardData {
  areas: InnovationAreaNode[];
  comments: InnovationComment[];
  attachments: InnovationAttachment[];
}

export interface InnovationUserTask {
  task: InnovationTask;
  project: InnovationProject | null;
  area: InnovationArea | null;
  subtasks: InnovationSubtask[];
  recentComments: InnovationComment[];
}

const mapArea = (row: any): InnovationArea => ({
  id: row.id,
  name: row.name,
  description: row.description,
  color: row.color,
  status: row.status,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapProject = (row: any, collaboratorIds: string[] = []): InnovationProject => ({
  id: row.id,
  areaId: row.area_id,
  title: row.title,
  description: row.description,
  ownerId: row.owner_id,
  collaboratorIds,
  priority: row.priority,
  status: row.status,
  dueDate: row.due_date,
  progress: row.progress ?? 0,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapTask = (row: any): InnovationTask => ({
  id: row.id,
  projectId: row.project_id,
  title: row.title,
  description: row.description,
  assignedTo: row.assigned_to,
  priority: row.priority,
  status: row.status,
  isCompleted: row.is_completed,
  dueDate: row.due_date,
  progress: row.progress ?? 0,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapSubtask = (row: any): InnovationSubtask => ({
  id: row.id,
  taskId: row.task_id,
  title: row.title,
  assignedTo: row.assigned_to,
  isCompleted: row.is_completed,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapComment = (row: any): InnovationComment => ({
  id: row.id,
  entityType: row.entity_type,
  entityId: row.entity_id,
  userId: row.user_id,
  comment: row.comment,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapAttachment = (row: any): InnovationAttachment => ({
  id: row.id,
  entityType: row.entity_type,
  entityId: row.entity_id,
  fileUrl: row.file_url,
  fileName: row.file_name,
  fileType: row.file_type,
  uploadedBy: row.uploaded_by,
  createdAt: row.created_at,
});

const mapActivity = (row: any): InnovationActivityLog => ({
  id: row.id,
  entityType: row.entity_type,
  entityId: row.entity_id,
  action: row.action,
  summary: row.summary,
  payload: row.payload,
  actorId: row.actor_id,
  createdAt: row.created_at,
});

const logActivity = async (
  entityType: InnovationActivityLog['entityType'],
  entityId: string,
  action: InnovationActivityLog['action'],
  summary: string,
  actorId: string | null,
  payload?: Record<string, unknown>,
) => {
  await supabase.from('innovation_activity_log').insert({
    entity_type: entityType,
    entity_id: entityId,
    action,
    summary,
    actor_id: actorId,
    payload: payload ?? null,
  });
};

export const getInnovationBoardData = async (): Promise<InnovationBoardData> => {
  const [areasRes, projectsRes, collaboratorsRes, tasksRes, subtasksRes, commentsRes, attachmentsRes] =
    await Promise.all([
      supabase.from('innovation_areas').select('*').order('created_at', { ascending: true }),
      supabase.from('innovation_projects').select('*').order('created_at', { ascending: false }),
      supabase.from('innovation_project_collaborators').select('*'),
      supabase.from('innovation_tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('innovation_subtasks').select('*').order('created_at', { ascending: true }),
      supabase.from('innovation_comments').select('*').order('created_at', { ascending: false }),
      supabase.from('innovation_attachments').select('*').order('created_at', { ascending: false }),
    ]);

  if (areasRes.error) throw areasRes.error;
  if (projectsRes.error) throw projectsRes.error;
  if (collaboratorsRes.error) throw collaboratorsRes.error;
  if (tasksRes.error) throw tasksRes.error;
  if (subtasksRes.error) throw subtasksRes.error;
  if (commentsRes.error) throw commentsRes.error;
  if (attachmentsRes.error) throw attachmentsRes.error;

  const areas = (areasRes.data ?? []).map(mapArea);
  const projects = projectsRes.data ?? [];
  const tasks = tasksRes.data ?? [];
  const subtasks = subtasksRes.data ?? [];

  const collaboratorsByProject = new Map<string, string[]>();
  (collaboratorsRes.data ?? []).forEach((row) => {
    const list = collaboratorsByProject.get(row.project_id) ?? [];
    list.push(row.user_id);
    collaboratorsByProject.set(row.project_id, list);
  });

  const subtasksByTask = new Map<string, InnovationSubtask[]>();
  subtasks.forEach((row) => {
    const list = subtasksByTask.get(row.task_id) ?? [];
    list.push(mapSubtask(row));
    subtasksByTask.set(row.task_id, list);
  });

  const tasksByProject = new Map<string, InnovationTaskNode[]>();
  tasks.forEach((row) => {
    const node: InnovationTaskNode = {
      ...mapTask(row),
      subtasks: subtasksByTask.get(row.id) ?? [],
    };
    const list = tasksByProject.get(row.project_id) ?? [];
    list.push(node);
    tasksByProject.set(row.project_id, list);
  });

  const projectsByArea = new Map<string, InnovationProjectNode[]>();
  projects.forEach((row) => {
    const node: InnovationProjectNode = {
      ...mapProject(row, collaboratorsByProject.get(row.id) ?? []),
      tasks: tasksByProject.get(row.id) ?? [],
    };
    const list = projectsByArea.get(row.area_id) ?? [];
    list.push(node);
    projectsByArea.set(row.area_id, list);
  });

  return {
    areas: areas.map((area) => ({
      ...area,
      projects: projectsByArea.get(area.id) ?? [],
    })),
    comments: (commentsRes.data ?? []).map(mapComment),
    attachments: (attachmentsRes.data ?? []).map(mapAttachment),
  };
};

export const getInnovationTaskById = async (taskId: string): Promise<InnovationTask | null> => {
  const { data, error } = await supabase.from('innovation_tasks').select('*').eq('id', taskId).single();
  if (error) return null;
  return mapTask(data);
};

export const getInnovationCommentsForEntity = async (
  entityType: InnovationEntityType,
  entityId: string,
): Promise<InnovationComment[]> => {
  const { data, error } = await supabase
    .from('innovation_comments')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapComment);
};

export const getInnovationAttachmentsForEntity = async (
  entityType: InnovationEntityType,
  entityId: string,
): Promise<InnovationAttachment[]> => {
  const { data, error } = await supabase
    .from('innovation_attachments')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapAttachment);
};

export const getInnovationActivityForEntity = async (
  entityType: InnovationActivityLog['entityType'],
  entityId: string,
): Promise<InnovationActivityLog[]> => {
  const { data, error } = await supabase
    .from('innovation_activity_log')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map(mapActivity);
};

export const createInnovationArea = async (
  input: { name: string; description?: string | null; color: string; createdBy: string },
): Promise<InnovationArea> => {
  const { data, error } = await supabase
    .from('innovation_areas')
    .insert({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      color: input.color || '#3b82f6',
      created_by: input.createdBy,
    })
    .select('*')
    .single();
  if (error) throw error;
  await logActivity('area', data.id, 'created', `Área creada: ${data.name}`, input.createdBy);
  return mapArea(data);
};

export const updateInnovationArea = async (
  areaId: string,
  updates: Partial<Pick<InnovationArea, 'name' | 'description' | 'color' | 'status'>>,
  actorId: string,
) => {
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name.trim();
  if (updates.description !== undefined) payload.description = updates.description?.trim() || null;
  if (updates.color !== undefined) payload.color = updates.color;
  if (updates.status !== undefined) payload.status = updates.status;

  const { data, error } = await supabase.from('innovation_areas').update(payload).eq('id', areaId).select('*').single();
  if (error) throw error;
  await logActivity('area', areaId, 'updated', `Área actualizada: ${data.name}`, actorId, payload);
  return mapArea(data);
};

export const deleteInnovationArea = async (areaId: string, actorId: string): Promise<void> => {
  await logActivity('area', areaId, 'deleted', 'Área eliminada', actorId);
  const { error } = await supabase.from('innovation_areas').delete().eq('id', areaId);
  if (error) throw error;
};

export const createInnovationProject = async (
  input: {
    areaId: string;
    title: string;
    description?: string;
    ownerId?: string | null;
    collaboratorIds?: string[];
    priority?: InnovationPriority;
    status?: InnovationStatus;
    dueDate?: string | null;
  },
  actorId: string,
): Promise<InnovationProject> => {
  const { data, error } = await supabase
    .from('innovation_projects')
    .insert({
      area_id: input.areaId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      owner_id: input.ownerId || null,
      priority: input.priority ?? 'Media',
      status: input.status ?? 'Pendiente',
      due_date: input.dueDate || null,
      created_by: actorId,
    })
    .select('*')
    .single();
  if (error) throw error;

  if (input.collaboratorIds && input.collaboratorIds.length > 0) {
    const rows = [...new Set(input.collaboratorIds)].map((userId) => ({
      project_id: data.id,
      user_id: userId,
    }));
    const { error: collabError } = await supabase.from('innovation_project_collaborators').insert(rows);
    if (collabError) throw collabError;
  }

  await logActivity('project', data.id, 'created', `Proyecto creado: ${data.title}`, actorId);
  return mapProject(data, input.collaboratorIds ?? []);
};

export const updateInnovationProject = async (
  projectId: string,
  updates: Partial<{
    title: string;
    description: string | null;
    ownerId: string | null;
    priority: InnovationPriority;
    status: InnovationStatus;
    dueDate: string | null;
    progress: number;
  }>,
  actorId: string,
) => {
  const payload: Record<string, unknown> = {};
  if (updates.title !== undefined) payload.title = updates.title.trim();
  if (updates.description !== undefined) payload.description = updates.description?.trim() || null;
  if (updates.ownerId !== undefined) payload.owner_id = updates.ownerId;
  if (updates.priority !== undefined) payload.priority = updates.priority;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.dueDate !== undefined) payload.due_date = updates.dueDate;
  if (updates.progress !== undefined) payload.progress = Math.max(0, Math.min(100, updates.progress));

  const { data, error } = await supabase
    .from('innovation_projects')
    .update(payload)
    .eq('id', projectId)
    .select('*')
    .single();
  if (error) throw error;
  await logActivity('project', projectId, 'updated', `Proyecto actualizado: ${data.title}`, actorId, payload);
  return mapProject(data);
};

export const deleteInnovationProject = async (projectId: string, actorId: string): Promise<void> => {
  await logActivity('project', projectId, 'deleted', 'Proyecto eliminado', actorId);
  const { error } = await supabase.from('innovation_projects').delete().eq('id', projectId);
  if (error) throw error;
};

export const setInnovationProjectCollaborators = async (
  projectId: string,
  collaboratorIds: string[],
  actorId: string,
) => {
  const normalized = [...new Set(collaboratorIds)];
  const { error: deleteError } = await supabase.from('innovation_project_collaborators').delete().eq('project_id', projectId);
  if (deleteError) throw deleteError;

  if (normalized.length > 0) {
    const rows = normalized.map((userId) => ({ project_id: projectId, user_id: userId }));
    const { error: insertError } = await supabase.from('innovation_project_collaborators').insert(rows);
    if (insertError) throw insertError;
  }

  await logActivity('project', projectId, 'updated', 'Colaboradores actualizados', actorId, {
    collaboratorIds: normalized,
  });
};

export const createInnovationTask = async (
  input: {
    projectId: string;
    title: string;
    description?: string;
    assignedTo?: string | null;
    priority?: InnovationPriority;
    status?: InnovationStatus;
    dueDate?: string | null;
  },
  actorId: string,
): Promise<InnovationTask> => {
  const { data, error } = await supabase
    .from('innovation_tasks')
    .insert({
      project_id: input.projectId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      assigned_to: input.assignedTo || null,
      priority: input.priority ?? 'Media',
      status: input.status ?? 'Pendiente',
      due_date: input.dueDate || null,
      created_by: actorId,
    })
    .select('*')
    .single();
  if (error) throw error;
  await logActivity('task', data.id, 'created', `Tarea creada: ${data.title}`, actorId);
  return mapTask(data);
};

export const updateInnovationTask = async (
  taskId: string,
  updates: Partial<{
    title: string;
    description: string | null;
    assignedTo: string | null;
    priority: InnovationPriority;
    status: InnovationStatus;
    dueDate: string | null;
    progress: number;
    isCompleted: boolean;
  }>,
  actorId: string,
) => {
  const payload: Record<string, unknown> = {};
  if (updates.title !== undefined) payload.title = updates.title.trim();
  if (updates.description !== undefined) payload.description = updates.description?.trim() || null;
  if (updates.assignedTo !== undefined) payload.assigned_to = updates.assignedTo;
  if (updates.priority !== undefined) payload.priority = updates.priority;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.dueDate !== undefined) payload.due_date = updates.dueDate;
  if (updates.progress !== undefined) payload.progress = Math.max(0, Math.min(100, updates.progress));
  if (updates.isCompleted !== undefined) payload.is_completed = updates.isCompleted;

  const { data, error } = await supabase
    .from('innovation_tasks')
    .update(payload)
    .eq('id', taskId)
    .select('*')
    .single();
  if (error) throw error;
  await logActivity('task', taskId, 'updated', `Tarea actualizada: ${data.title}`, actorId, payload);
  return mapTask(data);
};

export const deleteInnovationTask = async (taskId: string, actorId: string): Promise<void> => {
  await logActivity('task', taskId, 'deleted', 'Tarea eliminada', actorId);
  const { error } = await supabase.from('innovation_tasks').delete().eq('id', taskId);
  if (error) throw error;
};

export const createInnovationSubtask = async (
  input: {
    taskId: string;
    title: string;
    assignedTo?: string | null;
  },
  actorId: string,
): Promise<InnovationSubtask> => {
  const { data, error } = await supabase
    .from('innovation_subtasks')
    .insert({
      task_id: input.taskId,
      title: input.title.trim(),
      assigned_to: input.assignedTo || null,
      created_by: actorId,
    })
    .select('*')
    .single();
  if (error) throw error;
  await logActivity('subtask', data.id, 'created', `Subtarea creada: ${data.title}`, actorId);
  return mapSubtask(data);
};

export const updateInnovationSubtask = async (
  subtaskId: string,
  updates: Partial<{
    title: string;
    assignedTo: string | null;
    isCompleted: boolean;
  }>,
  actorId: string,
): Promise<InnovationSubtask> => {
  const payload: Record<string, unknown> = {};
  if (updates.title !== undefined) payload.title = updates.title.trim();
  if (updates.assignedTo !== undefined) payload.assigned_to = updates.assignedTo;
  if (updates.isCompleted !== undefined) payload.is_completed = updates.isCompleted;

  const { data, error } = await supabase
    .from('innovation_subtasks')
    .update(payload)
    .eq('id', subtaskId)
    .select('*')
    .single();
  if (error) throw error;
  await logActivity('subtask', subtaskId, 'updated', `Subtarea actualizada: ${data.title}`, actorId, payload);
  return mapSubtask(data);
};

export const deleteInnovationSubtask = async (subtaskId: string, actorId: string): Promise<void> => {
  await logActivity('subtask', subtaskId, 'deleted', 'Subtarea eliminada', actorId);
  const { error } = await supabase.from('innovation_subtasks').delete().eq('id', subtaskId);
  if (error) throw error;
};

export const createInnovationComment = async (
  entityType: InnovationEntityType,
  entityId: string,
  comment: string,
  actorId: string,
): Promise<InnovationComment> => {
  const text = comment.trim();
  const { data, error } = await supabase
    .from('innovation_comments')
    .insert({
      entity_type: entityType,
      entity_id: entityId,
      comment: text,
      user_id: actorId,
    })
    .select('*')
    .single();
  if (error) throw error;
  await logActivity('comment', data.id, 'created', `Comentario agregado en ${entityType}`, actorId);
  return mapComment(data);
};

export const deleteInnovationComment = async (commentId: string, actorId: string): Promise<void> => {
  await logActivity('comment', commentId, 'deleted', 'Comentario eliminado', actorId);
  const { error } = await supabase.from('innovation_comments').delete().eq('id', commentId);
  if (error) throw error;
};

export const uploadInnovationAttachment = async (
  file: File,
  entityType: InnovationEntityType,
  entityId: string,
  actorId: string,
): Promise<InnovationAttachment> => {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `innovacion/${entityType}/${entityId}/${Date.now()}_${safeName}`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(INNOVATION_ATTACHMENTS_BUCKET)
    .upload(path, file, { upsert: true, cacheControl: '3600' });
  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage
    .from(INNOVATION_ATTACHMENTS_BUCKET)
    .getPublicUrl(uploadData.path);
  const { data, error } = await supabase
    .from('innovation_attachments')
    .insert({
      entity_type: entityType,
      entity_id: entityId,
      file_url: publicUrlData.publicUrl,
      file_name: file.name,
      file_type: file.type || null,
      uploaded_by: actorId,
    })
    .select('*')
    .single();
  if (error) throw error;
  await logActivity('attachment', data.id, 'created', `Adjunto subido en ${entityType}`, actorId, {
    fileName: file.name,
    fileType: file.type || null,
  });
  return mapAttachment(data);
};

export const deleteInnovationAttachment = async (attachmentId: string, actorId: string): Promise<void> => {
  await logActivity('attachment', attachmentId, 'deleted', 'Adjunto eliminado', actorId);
  const { error } = await supabase.from('innovation_attachments').delete().eq('id', attachmentId);
  if (error) throw error;
};

export const getInnovationUserTasks = async (userId: string): Promise<InnovationUserTask[]> => {
  const { data: tasksRows, error: tasksError } = await supabase
    .from('innovation_tasks')
    .select('*')
    .eq('assigned_to', userId)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (tasksError) throw tasksError;

  const tasks = (tasksRows ?? []).map(mapTask);
  if (tasks.length === 0) return [];

  const taskIds = tasks.map((task) => task.id);
  const projectIds = [...new Set(tasks.map((task) => task.projectId))];

  const [projectsRes, subtasksRes, commentsRes] = await Promise.all([
    supabase.from('innovation_projects').select('*').in('id', projectIds),
    supabase.from('innovation_subtasks').select('*').in('task_id', taskIds).order('created_at', { ascending: true }),
    supabase
      .from('innovation_comments')
      .select('*')
      .eq('entity_type', 'task')
      .in('entity_id', taskIds)
      .order('created_at', { ascending: false }),
  ]);

  if (projectsRes.error) throw projectsRes.error;
  if (subtasksRes.error) throw subtasksRes.error;
  if (commentsRes.error) throw commentsRes.error;

  const projects = (projectsRes.data ?? []).map((row) => mapProject(row));
  const areaIds = [...new Set(projects.map((project) => project.areaId))];

  const areasRes = await supabase.from('innovation_areas').select('*').in('id', areaIds);
  if (areasRes.error) throw areasRes.error;

  const projectMap = new Map(projects.map((project) => [project.id, project]));
  const areaMap = new Map((areasRes.data ?? []).map((row) => [row.id, mapArea(row)]));

  const subtasksByTask = new Map<string, InnovationSubtask[]>();
  (subtasksRes.data ?? []).forEach((row) => {
    const list = subtasksByTask.get(row.task_id) ?? [];
    list.push(mapSubtask(row));
    subtasksByTask.set(row.task_id, list);
  });

  const commentsByTask = new Map<string, InnovationComment[]>();
  (commentsRes.data ?? []).forEach((row) => {
    const list = commentsByTask.get(row.entity_id) ?? [];
    list.push(mapComment(row));
    commentsByTask.set(row.entity_id, list);
  });

  return tasks.map((task) => {
    const project = projectMap.get(task.projectId) ?? null;
    const area = project ? areaMap.get(project.areaId) ?? null : null;
    return {
      task,
      project,
      area,
      subtasks: subtasksByTask.get(task.id) ?? [],
      recentComments: (commentsByTask.get(task.id) ?? []).slice(0, 3),
    };
  });
};

export const createInnovationRealtimeChannel = (onChange: () => void) =>
  supabase
    .channel(`innovation-realtime-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'innovation_areas' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'innovation_projects' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'innovation_project_collaborators' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'innovation_tasks' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'innovation_subtasks' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'innovation_comments' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'innovation_attachments' }, onChange)
    .subscribe();

