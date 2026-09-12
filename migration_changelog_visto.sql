-- Changelog: última tanda de novedades que vio cada usuario (modal "Qué hay de nuevo").
-- Ejecutar en Supabase SQL Editor (una vez).

create table if not exists public.changelog_visto (
  user_id uuid primary key references auth.users (id) on delete cascade,
  ultimo_id_visto integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.changelog_visto enable row level security;

drop policy if exists "changelog_visto_select_own" on public.changelog_visto;
drop policy if exists "changelog_visto_insert_own" on public.changelog_visto;
drop policy if exists "changelog_visto_update_own" on public.changelog_visto;

create policy "changelog_visto_select_own"
  on public.changelog_visto for select
  to authenticated
  using (auth.uid() = user_id);

create policy "changelog_visto_insert_own"
  on public.changelog_visto for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "changelog_visto_update_own"
  on public.changelog_visto for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.changelog_visto is 'Id de la última entrada de CHANGELOG_ENTRIES que cada usuario ya vio.';
