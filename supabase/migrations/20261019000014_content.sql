-- Content from the Anilha team, written in the management panel: announcements in
-- everyone's inbox, and ready-made fichas anyone adds to their own routines. Neither holds
-- personal data; who wrote it is kept only to know it came from the team.

-- 1. Announcements. In the inbox for 30 days; a new account sees only what came after it.
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 500),
  -- A screen of the app, never an outside address.
  url text check (url ~ '^/[A-Za-z0-9/_-]*$' and char_length(url) <= 80),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index announcements_created_idx on public.announcements (created_at desc);
alter table public.announcements enable row level security;

create or replace function public.admin_announce(p_title text, p_body text, p_url text, p_push boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_admin();
  t text := btrim(coalesce(p_title, ''));
  b text := btrim(coalesce(p_body, ''));
  u text := nullif(btrim(coalesce(p_url, '')), '');
  new_id uuid;
begin
  if char_length(t) not between 1 and 80 or char_length(b) not between 1 and 500 then
    raise exception 'Título de até 80 e texto de até 500 caracteres' using errcode = '22023';
  end if;
  if u is not null and u !~ '^/[A-Za-z0-9/_-]*$' then
    raise exception 'O link é uma tela do app, como /plano' using errcode = '22023';
  end if;
  insert into public.announcements (title, body, url, created_by)
    values (t, b, u, uid) returning id into new_id;
  -- Also by notification, to whoever has notifications from friends and the app on.
  if coalesce(p_push, false) then
    perform public.queue_social_push(s.user_id, 'aviso', t || ': ' || left(b, 140), coalesce(u, '/avisos'))
      from (select distinct user_id from public.push_subscriptions) s;
  end if;
  return jsonb_build_object('id', new_id);
end;
$$;

create or replace function public.admin_announcements()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'title', a.title, 'body', a.body, 'url', a.url, 'created_at', a.created_at
      ) order by a.created_at desc), '[]'::jsonb)
    from public.announcements a
  );
end;
$$;

create or replace function public.admin_delete_announcement(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  delete from public.announcements where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- 2. Ready-made fichas. Built like a sent ficha (same limits); adding one copies it into
-- the person's routines on the phone, like any routine they create.
create table public.library_routines (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 300),
  items jsonb not null check (jsonb_typeof(items) = 'array' and pg_column_size(items) < 40000),
  exercises jsonb not null default '[]'::jsonb
    check (jsonb_typeof(exercises) = 'array' and pg_column_size(exercises) < 40000),
  adds integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.library_routines enable row level security;

-- Anyone signed in sees the library: no personal data in it.
create or replace function public.library()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id, 'name', l.name, 'description', l.description,
      'items', l.items, 'exercises', l.exercises, 'created_at', l.created_at
    ) order by l.created_at desc, l.name), '[]'::jsonb)
  from public.library_routines l;
$$;

-- Counts an addition, for the panel. Only the number, never who.
create or replace function public.count_library_add(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_uid();
  update public.library_routines set adds = adds + 1 where id = p_id;
  return jsonb_build_object('ok', found);
end;
$$;

create or replace function public.admin_publish_routine(
  p_name text, p_description text, p_items jsonb, p_exercises jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_admin();
  nm text := btrim(coalesce(p_name, ''));
  new_id uuid;
begin
  if char_length(nm) not between 1 and 80 then
    raise exception 'Dê um nome à ficha' using errcode = '22023';
  end if;
  insert into public.library_routines (name, description, items, exercises, created_by)
    values (nm, left(nullif(btrim(coalesce(p_description, '')), ''), 300),
            public.clean_routine_items(p_items), public.clean_routine_exercises(p_exercises), uid)
    returning id into new_id;
  return jsonb_build_object('id', new_id);
end;
$$;

create or replace function public.admin_library()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'name', l.name, 'description', l.description,
        'exercises_count', jsonb_array_length(l.items), 'adds', l.adds, 'created_at', l.created_at
      ) order by l.created_at desc, l.name), '[]'::jsonb)
    from public.library_routines l
  );
end;
$$;

create or replace function public.admin_unpublish_routine(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  delete from public.library_routines where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- The first fichas of the library, made with the app's own exercises; the one for
-- beginners shows first. The first exercise with load gets its warm-up from the app.
insert into public.library_routines (name, description, items, created_at) values
(
  'Corpo inteiro para começar',
  'Para as primeiras semanas: máquinas, movimentos simples e o corpo todo em uns 45 minutos.',
  '[
    {"exercise_id": "leg-press-45", "sets": 3, "target_min": 10, "target_max": 12, "rest_sec": 90, "warmup_sets": 0, "note": null, "superset": null},
    {"exercise_id": "supino-maquina", "sets": 3, "target_min": 10, "target_max": 12, "rest_sec": 90, "warmup_sets": 0, "note": null, "superset": null},
    {"exercise_id": "puxada-frente", "sets": 3, "target_min": 10, "target_max": 12, "rest_sec": 90, "warmup_sets": 0, "note": null, "superset": null},
    {"exercise_id": "desenvolvimento-maquina", "sets": 3, "target_min": 10, "target_max": 12, "rest_sec": 75, "warmup_sets": 0, "note": null, "superset": null},
    {"exercise_id": "mesa-flexora", "sets": 3, "target_min": 10, "target_max": 12, "rest_sec": 60, "warmup_sets": 0, "note": null, "superset": null},
    {"exercise_id": "prancha", "sets": 3, "target_min": 20, "target_max": 40, "rest_sec": 45, "warmup_sets": 0, "note": null, "superset": null}
  ]'::jsonb,
  now()
),
(
  'Treino de 30 minutos',
  'Para o dia corrido: bi-sets que alternam dois exercícios e cabem em meia hora.',
  '[
    {"exercise_id": "agachamento-goblet", "sets": 3, "target_min": 10, "target_max": 12, "rest_sec": 60, "warmup_sets": 0, "note": null, "superset": "a"},
    {"exercise_id": "remada-unilateral", "sets": 3, "target_min": 10, "target_max": 12, "rest_sec": 60, "warmup_sets": 0, "note": null, "superset": "a"},
    {"exercise_id": "supino-reto-halteres", "sets": 3, "target_min": 8, "target_max": 12, "rest_sec": 60, "warmup_sets": 0, "note": null, "superset": "b"},
    {"exercise_id": "stiff-halteres", "sets": 3, "target_min": 10, "target_max": 12, "rest_sec": 60, "warmup_sets": 0, "note": null, "superset": "b"},
    {"exercise_id": "prancha", "sets": 2, "target_min": 30, "target_max": 45, "rest_sec": 30, "warmup_sets": 0, "note": null, "superset": null}
  ]'::jsonb,
  now() - interval '1 minute'
),
(
  'Em casa com halteres',
  'Para treinar em casa com um par de halteres: corpo inteiro, com flexão e prancha.',
  '[
    {"exercise_id": "agachamento-goblet", "sets": 3, "target_min": 10, "target_max": 15, "rest_sec": 75, "warmup_sets": 0, "note": null, "superset": null},
    {"exercise_id": "flexao-bracos", "sets": 3, "target_min": 8, "target_max": 15, "rest_sec": 60, "warmup_sets": 0, "note": null, "superset": null},
    {"exercise_id": "remada-unilateral", "sets": 3, "target_min": 10, "target_max": 12, "rest_sec": 60, "warmup_sets": 0, "note": null, "superset": null},
    {"exercise_id": "afundo", "sets": 3, "target_min": 10, "target_max": 12, "rest_sec": 60, "warmup_sets": 0, "note": null, "superset": null},
    {"exercise_id": "desenvolvimento-halteres-sentado", "sets": 3, "target_min": 10, "target_max": 12, "rest_sec": 60, "warmup_sets": 0, "note": null, "superset": null},
    {"exercise_id": "prancha", "sets": 3, "target_min": 30, "target_max": 45, "rest_sec": 45, "warmup_sets": 0, "note": null, "superset": null}
  ]'::jsonb,
  now() - interval '2 minutes'
),
(
  'Glúteo e posterior',
  'Foco em glúteo e posterior de coxa, com carga que sobe semana a semana.',
  '[
    {"exercise_id": "elevacao-pelvica", "sets": 4, "target_min": 8, "target_max": 12, "rest_sec": 90, "warmup_sets": 0, "note": null, "superset": null},
    {"exercise_id": "stiff", "sets": 3, "target_min": 8, "target_max": 10, "rest_sec": 90, "warmup_sets": 0, "note": null, "superset": null},
    {"exercise_id": "agachamento-bulgaro", "sets": 3, "target_min": 8, "target_max": 12, "rest_sec": 75, "warmup_sets": 0, "note": null, "superset": null},
    {"exercise_id": "cadeira-flexora", "sets": 3, "target_min": 10, "target_max": 12, "rest_sec": 60, "warmup_sets": 0, "note": null, "superset": null},
    {"exercise_id": "cadeira-abdutora", "sets": 3, "target_min": 12, "target_max": 15, "rest_sec": 45, "warmup_sets": 0, "note": null, "superset": null}
  ]'::jsonb,
  now() - interval '3 minutes'
);

-- The inbox now also brings the team's announcements.
create or replace function public.inbox(p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(item order by (item ->> 'at')::timestamptz desc), '[]'::jsonb)
  from (
    select item from (
      -- A friend reacted to a workout or a run.
      select jsonb_build_object(
        'kind', 'reaction', 'at', r.created_at, 'actor_id', r.actor,
        'actor_name', public.display_name_of(r.actor),
        'target_kind', r.target_kind, 'target_id', r.target_id
      ) as item
      from public.reactions r
      where r.owner = auth.uid() and r.created_at >= p_since
        and public.are_friends(r.actor, r.owner)
      union all
      -- An invite to a group: open ones can be answered here.
      select jsonb_build_object(
        'kind', 'group_invite', 'at', i.created_at, 'id', i.id, 'status', i.status,
        'actor_id', i.inviter, 'actor_name', public.display_name_of(i.inviter),
        'group_id', i.group_id, 'group_name', g.name
      )
      from public.group_invites i
      join public.groups g on g.id = i.group_id
      where i.invitee = auth.uid()
        and (i.status = 'pending' or i.created_at >= p_since)
        and not public.blocked_between(i.inviter, i.invitee)
      union all
      -- A friend you invited to a group joined it.
      select jsonb_build_object(
        'kind', 'group_joined', 'at', i.answered_at,
        'actor_id', i.invitee, 'actor_name', public.display_name_of(i.invitee),
        'group_id', i.group_id, 'group_name', g.name
      )
      from public.group_invites i
      join public.groups g on g.id = i.group_id
      where i.inviter = auth.uid() and i.status = 'accepted' and i.answered_at >= p_since
      union all
      -- Someone used your friend invite.
      select jsonb_build_object(
        'kind', 'friend', 'at', v.used_at,
        'actor_id', v.used_by, 'actor_name', public.display_name_of(v.used_by)
      )
      from public.invites v
      where v.inviter = auth.uid() and v.used_by is not null and v.used_at >= p_since
        and public.are_friends(v.inviter, v.used_by)
      union all
      -- Your message got an answer.
      select jsonb_build_object(
        'kind', 'ticket_answer', 'at', t.answered_at, 'id', t.id, 'ticket_kind', t.kind
      )
      from public.tickets t
      where t.user_id = auth.uid() and t.status = 'respondido' and t.answered_at >= p_since
      union all
      -- A ficha sent to you: open ones can be answered here.
      select jsonb_build_object(
        'kind', 'routine', 'at', s.created_at, 'id', s.id, 'status', s.status,
        'actor_id', case when s.from_team then null else s.sender end,
        'actor_name', case when s.from_team then 'Anilha' else public.display_name_of(s.sender) end,
        'name', s.name, 'from_team', s.from_team
      )
      from public.shared_routines s
      where s.recipient = auth.uid()
        and (s.status = 'pending' or s.created_at >= p_since)
        and (s.from_team or not public.blocked_between(s.sender, s.recipient))
      union all
      -- A friend added a ficha you sent.
      select jsonb_build_object(
        'kind', 'routine_accepted', 'at', s.answered_at, 'id', s.id,
        'actor_id', s.recipient, 'actor_name', public.display_name_of(s.recipient),
        'name', s.name
      )
      from public.shared_routines s
      where s.sender = auth.uid() and not s.from_team and s.status = 'accepted'
        and s.answered_at >= p_since
      union all
      -- News from the team, after this account was created.
      select jsonb_build_object(
        'kind', 'announcement', 'at', a.created_at, 'id', a.id,
        'title', a.title, 'body', a.body, 'url', a.url
      )
      from public.announcements a
      where a.created_at >= p_since
        and a.created_at >= (select u.created_at - interval '1 day' from auth.users u where u.id = auth.uid())
    ) all_items
    order by (item ->> 'at')::timestamptz desc
    limit 100
  ) latest;
$$;

revoke execute on all functions in schema public from public, anon;
revoke all on all tables in schema public from anon;
grant execute on function public.admin_announce(text, text, text, boolean) to authenticated;
grant execute on function public.admin_announcements() to authenticated;
grant execute on function public.admin_delete_announcement(uuid) to authenticated;
grant execute on function public.library() to authenticated;
grant execute on function public.count_library_add(uuid) to authenticated;
grant execute on function public.admin_publish_routine(text, text, jsonb, jsonb) to authenticated;
grant execute on function public.admin_library() to authenticated;
grant execute on function public.admin_unpublish_routine(uuid) to authenticated;
grant execute on function public.inbox(timestamptz) to authenticated;
