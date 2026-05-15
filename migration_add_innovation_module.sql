-- Modulo Innovacion & Desarrollo
-- Ejecutar una vez en Supabase SQL Editor.

create table if not exists public.innovation_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  color text not null default '#3b82f6',
  status text not null default 'Activa' check (status in ('Activa', 'Archivada')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.innovation_projects (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.innovation_areas (id) on delete cascade,
  title text not null,
  description text,
  owner_id uuid references auth.users (id) on delete set null,
  priority text not null default 'Media'
    check (priority in ('Baja', 'Media', 'Alta', 'Crítica')),
  status text not null default 'Pendiente'
    check (status in ('Pendiente', 'En proceso', 'Esperando revisión', 'Bloqueado', 'Finalizado', 'Cancelado')),
  due_date date,
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.innovation_project_collaborators (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.innovation_projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists innovation_project_collaborators_unique_idx
  on public.innovation_project_collaborators (project_id, user_id);

create table if not exists public.innovation_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.innovation_projects (id) on delete cascade,
  title text not null,
  description text,
  assigned_to uuid references auth.users (id) on delete set null,
  priority text not null default 'Media'
    check (priority in ('Baja', 'Media', 'Alta', 'Crítica')),
  status text not null default 'Pendiente'
    check (status in ('Pendiente', 'En proceso', 'Esperando revisión', 'Bloqueado', 'Finalizado', 'Cancelado')),
  is_completed boolean not null default false,
  due_date date,
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.innovation_subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.innovation_tasks (id) on delete cascade,
  title text not null,
  assigned_to uuid references auth.users (id) on delete set null,
  is_completed boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.innovation_comments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null
    check (entity_type in ('area', 'project', 'task', 'subtask')),
  entity_id uuid not null,
  user_id uuid references auth.users (id) on delete set null,
  comment text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.innovation_attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null
    check (entity_type in ('area', 'project', 'task', 'subtask')),
  entity_id uuid not null,
  file_url text not null,
  file_name text not null,
  file_type text,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.innovation_activity_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null
    check (entity_type in ('area', 'project', 'task', 'subtask', 'comment', 'attachment')),
  entity_id uuid not null,
  action text not null check (action in ('created', 'updated', 'deleted')),
  summary text not null,
  payload jsonb,
  actor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists innovation_projects_area_idx on public.innovation_projects (area_id);
create index if not exists innovation_projects_owner_idx on public.innovation_projects (owner_id);
create index if not exists innovation_tasks_project_idx on public.innovation_tasks (project_id);
create index if not exists innovation_tasks_assigned_idx on public.innovation_tasks (assigned_to);
create index if not exists innovation_subtasks_task_idx on public.innovation_subtasks (task_id);
create index if not exists innovation_comments_entity_idx on public.innovation_comments (entity_type, entity_id);
create index if not exists innovation_attachments_entity_idx on public.innovation_attachments (entity_type, entity_id);
create index if not exists innovation_activity_entity_idx on public.innovation_activity_log (entity_type, entity_id, created_at desc);

create or replace function public.innovation_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_innovation_areas_touch on public.innovation_areas;
create trigger trg_innovation_areas_touch
before update on public.innovation_areas
for each row execute function public.innovation_touch_updated_at();

drop trigger if exists trg_innovation_projects_touch on public.innovation_projects;
create trigger trg_innovation_projects_touch
before update on public.innovation_projects
for each row execute function public.innovation_touch_updated_at();

drop trigger if exists trg_innovation_tasks_touch on public.innovation_tasks;
create trigger trg_innovation_tasks_touch
before update on public.innovation_tasks
for each row execute function public.innovation_touch_updated_at();

drop trigger if exists trg_innovation_subtasks_touch on public.innovation_subtasks;
create trigger trg_innovation_subtasks_touch
before update on public.innovation_subtasks
for each row execute function public.innovation_touch_updated_at();

drop trigger if exists trg_innovation_comments_touch on public.innovation_comments;
create trigger trg_innovation_comments_touch
before update on public.innovation_comments
for each row execute function public.innovation_touch_updated_at();

create or replace function public.recalculate_innovation_task_progress(p_task_id uuid)
returns void
language plpgsql
as $$
declare
  total_subtasks integer;
  completed_subtasks integer;
  computed_progress integer;
begin
  select count(*)
  into total_subtasks
  from public.innovation_subtasks
  where task_id = p_task_id;

  if total_subtasks = 0 then
    return;
  end if;

  select count(*)
  into completed_subtasks
  from public.innovation_subtasks
  where task_id = p_task_id
    and is_completed = true;

  computed_progress := floor((completed_subtasks::numeric / total_subtasks::numeric) * 100);

  update public.innovation_tasks
  set
    progress = computed_progress,
    is_completed = completed_subtasks = total_subtasks,
    status = case
      when completed_subtasks = total_subtasks then 'Finalizado'
      when status = 'Finalizado' then 'En proceso'
      else status
    end
  where id = p_task_id;
end;
$$;

create or replace function public.recalculate_innovation_project_progress(p_project_id uuid)
returns void
language plpgsql
as $$
declare
  total_tasks integer;
  completed_tasks integer;
  computed_progress integer;
begin
  select count(*)
  into total_tasks
  from public.innovation_tasks
  where project_id = p_project_id;

  if total_tasks = 0 then
    update public.innovation_projects
    set progress = 0
    where id = p_project_id;
    return;
  end if;

  select count(*)
  into completed_tasks
  from public.innovation_tasks
  where project_id = p_project_id
    and is_completed = true;

  computed_progress := floor((completed_tasks::numeric / total_tasks::numeric) * 100);

  update public.innovation_projects
  set
    progress = computed_progress,
    status = case
      when computed_progress = 100 and status <> 'Cancelado' then 'Finalizado'
      when computed_progress < 100 and status = 'Finalizado' then 'En proceso'
      else status
    end
  where id = p_project_id;
end;
$$;

create or replace function public.on_innovation_subtask_changed()
returns trigger
language plpgsql
as $$
declare
  task_id_to_update uuid;
begin
  task_id_to_update := coalesce(new.task_id, old.task_id);
  perform public.recalculate_innovation_task_progress(task_id_to_update);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_innovation_subtasks_progress on public.innovation_subtasks;
create trigger trg_innovation_subtasks_progress
after insert or update or delete on public.innovation_subtasks
for each row execute function public.on_innovation_subtask_changed();

create or replace function public.on_innovation_task_changed()
returns trigger
language plpgsql
as $$
declare
  project_id_to_update uuid;
begin
  project_id_to_update := coalesce(new.project_id, old.project_id);
  perform public.recalculate_innovation_project_progress(project_id_to_update);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_innovation_tasks_progress on public.innovation_tasks;
create trigger trg_innovation_tasks_progress
after insert or update or delete on public.innovation_tasks
for each row execute function public.on_innovation_task_changed();

alter table public.innovation_areas enable row level security;
alter table public.innovation_projects enable row level security;
alter table public.innovation_project_collaborators enable row level security;
alter table public.innovation_tasks enable row level security;
alter table public.innovation_subtasks enable row level security;
alter table public.innovation_comments enable row level security;
alter table public.innovation_attachments enable row level security;
alter table public.innovation_activity_log enable row level security;

drop policy if exists "innovation_areas_auth_all" on public.innovation_areas;
create policy "innovation_areas_auth_all"
  on public.innovation_areas
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "innovation_projects_auth_all" on public.innovation_projects;
create policy "innovation_projects_auth_all"
  on public.innovation_projects
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "innovation_project_collaborators_auth_all" on public.innovation_project_collaborators;
create policy "innovation_project_collaborators_auth_all"
  on public.innovation_project_collaborators
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "innovation_tasks_auth_all" on public.innovation_tasks;
create policy "innovation_tasks_auth_all"
  on public.innovation_tasks
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "innovation_subtasks_auth_all" on public.innovation_subtasks;
create policy "innovation_subtasks_auth_all"
  on public.innovation_subtasks
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "innovation_comments_auth_all" on public.innovation_comments;
create policy "innovation_comments_auth_all"
  on public.innovation_comments
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "innovation_attachments_auth_all" on public.innovation_attachments;
create policy "innovation_attachments_auth_all"
  on public.innovation_attachments
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "innovation_activity_log_auth_all" on public.innovation_activity_log;
create policy "innovation_activity_log_auth_all"
  on public.innovation_activity_log
  for all
  to authenticated
  using (true)
  with check (true);

comment on table public.innovation_areas is 'Areas del modulo Innovacion & Desarrollo.';
comment on table public.innovation_projects is 'Proyectos y objetivos dentro de cada area de innovacion.';
comment on table public.innovation_tasks is 'Tareas de cada proyecto con responsables y avance.';
comment on table public.innovation_subtasks is 'Checklist de subtareas por tarea.';
comment on table public.innovation_comments is 'Comentarios sobre area/proyecto/tarea/subtarea.';
comment on table public.innovation_attachments is 'Adjuntos asociados a entidades de innovacion.';
comment on table public.innovation_activity_log is 'Historial de cambios del modulo Innovacion & Desarrollo.';
