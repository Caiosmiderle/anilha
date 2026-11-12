-- Body weight and measures, deload weeks, bi-sets and the app's error log.
-- New columns on synced tables are nullable: an older phone that does not know them
-- pushes rows without them, and sync_push leaves absent columns as they are.

-- Errors the app hits in production, so a broken screen is seen without a report.
create table public.client_errors (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  count integer not null default 1,
  message text not null check (char_length(message) <= 500),
  stack text check (char_length(stack) <= 4000),
  url text check (char_length(url) <= 300),
  version text check (char_length(version) <= 40),
  user_agent text check (char_length(user_agent) <= 300)
);
create index client_errors_user_idx on public.client_errors (user_id, last_at);
alter table public.client_errors enable row level security;

-- Same error again within a day counts up instead of adding a row; at most 30 new
-- errors per person per hour; older than 30 days is dropped.
create or replace function public.log_client_error(
  p_message text, p_stack text, p_url text, p_version text, p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_uid();
  existing bigint;
begin
  select id into existing from public.client_errors
    where user_id = uid and message = left(p_message, 500)
      and coalesce(stack, '') = coalesce(left(p_stack, 4000), '')
      and last_at > now() - interval '1 day'
    limit 1;
  if existing is not null then
    update public.client_errors set count = count + 1, last_at = now() where id = existing;
    return jsonb_build_object('ok', true);
  end if;
  if (select count(*) from public.client_errors
      where user_id = uid and created_at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('ok', false);
  end if;
  insert into public.client_errors (user_id, message, stack, url, version, user_agent)
  values (uid, left(coalesce(p_message, ''), 500), left(p_stack, 4000), left(p_url, 300),
          left(p_version, 40), left(p_user_agent, 300));
  delete from public.client_errors where last_at < now() - interval '30 days';
  return jsonb_build_object('ok', true);
end;
$$;

-- Body weight and waist, by day. Private: only the owner reads it, friends never.
create table public.body_logs (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 64),
  updated_at bigint not null,
  deleted boolean not null default false,
  server_seq bigint not null default 0,
  local_date date not null,
  weight_kg numeric(5, 2) check (weight_kg between 20 and 400),
  waist_cm numeric(5, 1) check (waist_cm between 30 and 250),
  note text check (char_length(note) <= 200),
  primary key (user_id, id)
);
create trigger body_logs_seq before insert or update on public.body_logs
  for each row execute function public.touch_server_seq();
create index body_logs_pull_idx on public.body_logs (user_id, server_seq);
create index body_logs_date_idx on public.body_logs (user_id, local_date);
alter table public.body_logs enable row level security;
create policy body_logs_owner on public.body_logs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function public.synced_tables()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'profiles', 'exercises', 'plans', 'routines', 'routine_items', 'sessions',
    'session_items', 'sets', 'runs', 'pain_reports', 'day_overrides', 'records',
    'body_logs'
  ];
$$;

-- Deload: the Monday of an accepted lighter week, and when the suggestion was declined.
alter table public.profiles add column deload_week date;
alter table public.profiles add column deload_dismissed date;
-- A workout done in a deload week: progression and records skip it.
alter table public.sessions add column deload boolean;

-- Bi-set: items with the same key alternate set by set, resting after the pair.
alter table public.routine_items add column superset text check (char_length(superset) <= 40);
alter table public.session_items add column superset text check (char_length(superset) <= 40);

revoke execute on all functions in schema public from public, anon;
revoke all on all tables in schema public from anon;
grant execute on function public.log_client_error(text, text, text, text, text) to authenticated;
