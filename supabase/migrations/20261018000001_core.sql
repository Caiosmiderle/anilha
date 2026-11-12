-- Anilha: core synced tables, row level security and sync RPCs.
-- Every synced row is (user_id, id) and carries updated_at (client clock, ms),
-- deleted (tombstone) and server_seq (server order for pulls).

create sequence if not exists public.sync_seq;

create or replace function public.touch_server_seq()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.server_seq := nextval('public.sync_seq');
  return new;
end;
$$;

create table public.profiles (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  server_seq bigint not null default 0,
  display_name text not null default '' check (char_length(display_name) <= 60),
  unit text not null default 'kg' check (unit in ('kg', 'lb')),
  rest_sec integer not null default 90 check (rest_sec between 15 and 600),
  timezone text not null default 'America/Sao_Paulo' check (char_length(timezone) <= 64),
  share_adherence boolean not null default true,
  share_workouts boolean not null default true,
  share_records boolean not null default true,
  share_details boolean not null default false,
  return_mode text not null default 'auto' check (return_mode in ('auto', 'on', 'off')),
  return_started_on date,
  return_notice_seen text check (char_length(return_notice_seen) <= 20),
  reminders jsonb not null default '{"enabled": false, "gym_time": "05:30", "run_eve_time": "21:00"}'
    check (pg_column_size(reminders) < 2000),
  onboarding jsonb check (pg_column_size(onboarding) < 4000),
  primary key (user_id, id),
  check (id = user_id::text)
);

create table public.exercises (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 64),
  updated_at bigint not null,
  deleted boolean not null default false,
  server_seq bigint not null default 0,
  name text not null check (char_length(name) between 1 and 80),
  primary_group text not null check (primary_group in ('costas', 'peito', 'pernas', 'ombros', 'bracos', 'core')),
  secondary_groups jsonb not null default '[]',
  muscles jsonb not null default '[]',
  secondary_muscles jsonb not null default '[]',
  equipment text not null check (char_length(equipment) <= 20),
  measure text not null check (measure in ('weight_reps', 'reps', 'time')),
  increment_kg numeric(5, 2) not null check (increment_kg > 0 and increment_kg <= 50),
  joints jsonb not null default '[]',
  compound boolean not null default false,
  bodyweight boolean not null default false,
  pattern text not null check (char_length(pattern) <= 30),
  progression_hint text check (char_length(progression_hint) <= 200),
  note text check (char_length(note) <= 500),
  builtin boolean not null default false,
  archived boolean not null default false,
  primary key (user_id, id),
  check (pg_column_size(muscles) + pg_column_size(secondary_muscles) + pg_column_size(joints) < 2000)
);

create table public.plans (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 64),
  updated_at bigint not null,
  deleted boolean not null default false,
  server_seq bigint not null default 0,
  active_from date not null,
  gym_per_week integer not null check (gym_per_week between 0 and 7),
  run_per_week integer not null check (run_per_week between 0 and 7),
  days jsonb not null check (jsonb_typeof(days) = 'array' and jsonb_array_length(days) = 7),
  rules jsonb not null default '{"no_legs_before_run": true}',
  params jsonb check (pg_column_size(params) < 4000),
  reasons jsonb not null default '[]' check (pg_column_size(reasons) < 8000),
  primary key (user_id, id)
);

create table public.routines (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 64),
  updated_at bigint not null,
  deleted boolean not null default false,
  server_seq bigint not null default 0,
  name text not null check (char_length(name) between 1 and 80),
  split_key text not null check (char_length(split_key) <= 30),
  position integer not null default 0,
  reason text check (char_length(reason) <= 300),
  archived boolean not null default false,
  primary key (user_id, id)
);

create table public.routine_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 80),
  updated_at bigint not null,
  deleted boolean not null default false,
  server_seq bigint not null default 0,
  routine_id text not null check (char_length(routine_id) <= 64),
  position integer not null default 0,
  exercise_id text not null check (char_length(exercise_id) <= 64),
  sets integer not null check (sets between 1 and 12),
  target_min integer not null check (target_min between 1 and 3600),
  target_max integer not null check (target_max between 1 and 3600 and target_max >= target_min),
  rest_sec integer not null check (rest_sec between 0 and 600),
  warmup_sets integer not null default 0 check (warmup_sets between 0 and 5),
  note text check (char_length(note) <= 500),
  reason text check (char_length(reason) <= 300),
  primary key (user_id, id)
);

create table public.sessions (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 64),
  updated_at bigint not null,
  deleted boolean not null default false,
  server_seq bigint not null default 0,
  local_date date not null,
  started_at bigint not null,
  ended_at bigint,
  status text not null check (status in ('active', 'done')),
  split_key text check (char_length(split_key) <= 30),
  title text not null check (char_length(title) <= 80),
  routine_id text check (char_length(routine_id) <= 64),
  source text not null check (source in ('routine', 'repeat', 'blank', 'import', 'summary')),
  note text check (char_length(note) <= 1000),
  detail text not null default 'full' check (detail in ('full', 'summary')),
  rest_started_at bigint,
  rest_duration_sec integer check (rest_duration_sec between 0 and 900),
  adjustments jsonb not null default '[]' check (pg_column_size(adjustments) < 2000),
  primary key (user_id, id)
);

create table public.session_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 80),
  updated_at bigint not null,
  deleted boolean not null default false,
  server_seq bigint not null default 0,
  session_id text not null check (char_length(session_id) <= 64),
  position integer not null default 0,
  exercise_id text not null check (char_length(exercise_id) <= 64),
  original_exercise_id text check (char_length(original_exercise_id) <= 64),
  substitution_reason text check (char_length(substitution_reason) <= 200),
  status text not null check (status in ('pending', 'done', 'skipped', 'not_done')),
  skip_reason text check (char_length(skip_reason) <= 200),
  planned_sets integer not null check (planned_sets between 0 and 12),
  target_min integer not null check (target_min between 0 and 3600),
  target_max integer not null check (target_max between 0 and 3600),
  rest_sec integer not null check (rest_sec between 0 and 600),
  warmup_sets integer not null default 0 check (warmup_sets between 0 and 5),
  note text check (char_length(note) <= 500),
  pain_joint text check (pain_joint in ('ombro', 'cotovelo', 'joelho', 'lombar', 'punho')),
  added boolean not null default false,
  primary key (user_id, id)
);

create table public.sets (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 100),
  updated_at bigint not null,
  deleted boolean not null default false,
  server_seq bigint not null default 0,
  session_id text not null check (char_length(session_id) <= 64),
  item_id text not null check (char_length(item_id) <= 80),
  exercise_id text not null check (char_length(exercise_id) <= 64),
  position integer not null default 0 check (position between 0 and 50),
  kind text not null check (kind in ('warmup', 'work')),
  load_kg numeric(7, 2) check (load_kg between 0 and 1000),
  reps integer check (reps between 0 and 500),
  seconds integer check (seconds between 0 and 7200),
  rir integer check (rir between 0 and 5),
  note text check (char_length(note) <= 300),
  completed_at bigint,
  primary key (user_id, id)
);

create table public.runs (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 64),
  updated_at bigint not null,
  deleted boolean not null default false,
  server_seq bigint not null default 0,
  local_date date not null,
  distance_km numeric(6, 2) not null check (distance_km > 0 and distance_km <= 300),
  duration_sec integer not null check (duration_sec > 0 and duration_sec <= 172800),
  run_type text not null check (run_type in ('leve', 'longo', 'intervalado')),
  rpe integer check (rpe between 1 and 10),
  note text check (char_length(note) <= 500),
  source text not null default 'manual' check (source in ('manual', 'import')),
  external_id text check (char_length(external_id) <= 120),
  primary key (user_id, id)
);

create table public.pain_reports (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 64),
  updated_at bigint not null,
  deleted boolean not null default false,
  server_seq bigint not null default 0,
  local_date date not null,
  exercise_id text not null check (char_length(exercise_id) <= 64),
  session_id text check (char_length(session_id) <= 64),
  joint text not null check (joint in ('ombro', 'cotovelo', 'joelho', 'lombar', 'punho')),
  primary key (user_id, id)
);

create table public.day_overrides (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 64),
  updated_at bigint not null,
  deleted boolean not null default false,
  server_seq bigint not null default 0,
  local_date date not null,
  action text not null check (action in ('rest', 'run', 'time', 'focus', 'no_equipment', 'spare_joint')),
  value text check (char_length(value) <= 40),
  primary key (user_id, id)
);

create table public.records (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 200),
  updated_at bigint not null,
  deleted boolean not null default false,
  server_seq bigint not null default 0,
  exercise_id text check (char_length(exercise_id) <= 64),
  exercise_name text not null check (char_length(exercise_name) <= 80),
  kind text not null check (kind in ('carga', 'e1rm', 'repeticoes', 'tempo', 'distancia', 'marco')),
  value numeric(8, 2) not null,
  unit text not null check (char_length(unit) <= 10),
  local_date date not null,
  session_id text check (char_length(session_id) <= 64),
  run_id text check (char_length(run_id) <= 64),
  primary key (user_id, id)
);

-- server_seq trigger and pull index on every synced table
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'exercises', 'plans', 'routines', 'routine_items', 'sessions',
    'session_items', 'sets', 'runs', 'pain_reports', 'day_overrides', 'records'
  ] loop
    execute format(
      'create trigger %1$I_seq before insert or update on public.%1$I
         for each row execute function public.touch_server_seq()', t);
    execute format('create index %1$I_pull_idx on public.%1$I (user_id, server_seq)', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

create index sessions_date_idx on public.sessions (user_id, local_date);
create index runs_date_idx on public.runs (user_id, local_date);
create index plans_active_idx on public.plans (user_id, active_from);
