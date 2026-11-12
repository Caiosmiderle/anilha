-- Sending a ficha. A friend suggests a routine (or the Anilha team, from the management
-- panel, to anyone); it arrives in the inbox and the person adds it to their own fichas or
-- declines. Nothing changes in anyone's plan without accepting. The copy is made on the
-- phone of who accepts, like any routine they create, so it syncs as usual.

create table public.shared_routines (
  id uuid primary key default gen_random_uuid(),
  sender uuid not null references auth.users (id) on delete cascade,
  recipient uuid not null references auth.users (id) on delete cascade,
  from_team boolean not null default false,
  name text not null check (char_length(name) between 1 and 80),
  note text check (char_length(note) <= 300),
  items jsonb not null check (jsonb_typeof(items) = 'array' and pg_column_size(items) < 40000),
  exercises jsonb not null default '[]'::jsonb
    check (jsonb_typeof(exercises) = 'array' and pg_column_size(exercises) < 40000),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  check (sender <> recipient)
);
create index shared_routines_recipient_idx on public.shared_routines (recipient, created_at desc);
create index shared_routines_sender_idx on public.shared_routines (sender, created_at desc);
alter table public.shared_routines enable row level security;

-- Keeps only what a routine item is made of, within the limits of routine_items.
create or replace function public.clean_routine_items(p_items jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  it jsonb;
  result jsonb := '[]'::jsonb;
  n_sets integer;
  lo integer;
  hi integer;
  rest integer;
  warm integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'A ficha precisa ter de 1 a 30 exercícios' using errcode = '22023';
  end if;
  for it in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(it) <> 'object'
       or char_length(coalesce(it ->> 'exercise_id', '')) not between 1 and 64 then
      raise exception 'Exercício inválido na ficha' using errcode = '22023';
    end if;
    n_sets := coalesce((it ->> 'sets')::integer, 0);
    lo := coalesce((it ->> 'target_min')::integer, 0);
    hi := coalesce((it ->> 'target_max')::integer, 0);
    rest := coalesce((it ->> 'rest_sec')::integer, 90);
    warm := coalesce((it ->> 'warmup_sets')::integer, 0);
    if n_sets not between 1 and 12 or lo not between 1 and 3600 or hi not between lo and 3600
       or rest not between 0 and 600 or warm not between 0 and 5 then
      raise exception 'Séries, faixa ou descanso fora do limite' using errcode = '22023';
    end if;
    result := result || jsonb_build_array(jsonb_build_object(
      'exercise_id', it ->> 'exercise_id',
      'sets', n_sets, 'target_min', lo, 'target_max', hi,
      'rest_sec', rest, 'warmup_sets', warm,
      'note', left(nullif(btrim(coalesce(it ->> 'note', '')), ''), 300),
      'superset', left(nullif(it ->> 'superset', ''), 40)
    ));
  end loop;
  return result;
end;
$$;

-- Exercises the sender created (built-in ones every phone already has). The phone that
-- accepts checks them again when it saves them.
create or replace function public.clean_routine_exercises(p_exercises jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  ex jsonb;
  result jsonb := '[]'::jsonb;
begin
  if p_exercises is null then
    return result;
  end if;
  if jsonb_typeof(p_exercises) <> 'array' or jsonb_array_length(p_exercises) > 30 then
    raise exception 'Exercícios inválidos na ficha' using errcode = '22023';
  end if;
  for ex in select value from jsonb_array_elements(p_exercises) loop
    if jsonb_typeof(ex) <> 'object'
       or char_length(coalesce(ex ->> 'id', '')) not between 1 and 64
       or char_length(coalesce(ex ->> 'name', '')) not between 1 and 80 then
      raise exception 'Exercício inválido na ficha' using errcode = '22023';
    end if;
    result := result || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id', ex -> 'id', 'name', ex -> 'name', 'primary_group', ex -> 'primary_group',
      'secondary_groups', ex -> 'secondary_groups', 'muscles', ex -> 'muscles',
      'secondary_muscles', ex -> 'secondary_muscles', 'equipment', ex -> 'equipment',
      'measure', ex -> 'measure', 'increment_kg', ex -> 'increment_kg', 'joints', ex -> 'joints',
      'compound', ex -> 'compound', 'bodyweight', ex -> 'bodyweight', 'pattern', ex -> 'pattern',
      'progression_hint', ex -> 'progression_hint'
    )));
  end loop;
  return result;
end;
$$;

-- Saves a sent ficha and notifies who receives it. 20 a day per person; the team, 200.
create or replace function public.insert_shared_routine(
  p_from uuid, p_to uuid, p_team boolean, p_name text, p_note text, p_items jsonb, p_exercises jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  nm text := btrim(coalesce(p_name, ''));
  daily integer := case when p_team then 200 else 20 end;
  new_id uuid;
begin
  if char_length(nm) not between 1 and 80 then
    raise exception 'Dê um nome à ficha' using errcode = '22023';
  end if;
  if (select count(*) from public.shared_routines
      where sender = p_from and created_at > now() - interval '1 day') >= daily then
    raise exception 'Limite de fichas enviadas por hoje. Tente amanhã.' using errcode = '22023';
  end if;
  insert into public.shared_routines (sender, recipient, from_team, name, note, items, exercises)
    values (p_from, p_to, p_team, nm, left(nullif(btrim(coalesce(p_note, '')), ''), 300),
            public.clean_routine_items(p_items), public.clean_routine_exercises(p_exercises))
    returning id into new_id;
  perform public.queue_social_push(
    p_to, 'ficha',
    case when p_team then 'O Anilha' else public.display_name_of(p_from) end
      || ' te mandou uma ficha: ' || nm || '.',
    '/avisos');
  return jsonb_build_object('id', new_id);
end;
$$;

-- Friends to send a ficha to.
create or replace function public.my_friends()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', f.friend, 'name', public.display_name_of(f.friend))
           order by public.display_name_of(f.friend)), '[]'::jsonb)
  from (
    select case when x.user_a = auth.uid() then x.user_b else x.user_a end as friend
    from public.friendships x
    where auth.uid() in (x.user_a, x.user_b)
  ) f
  where not public.blocked_between(auth.uid(), f.friend);
$$;

-- A person sends one of their fichas to a friend.
create or replace function public.send_routine(
  p_to uuid, p_name text, p_note text, p_items jsonb, p_exercises jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_uid();
begin
  if not public.are_friends(uid, p_to) then
    return jsonb_build_object('error', 'not_friends');
  end if;
  return public.insert_shared_routine(uid, p_to, false, p_name, p_note, p_items, p_exercises);
end;
$$;

-- The team sends a ficha to anyone, from the management panel. Signed "Anilha".
create or replace function public.admin_send_routine(
  p_to uuid, p_name text, p_note text, p_items jsonb, p_exercises jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_admin();
begin
  if p_to = uid or not exists (select 1 from auth.users where id = p_to) then
    raise exception 'Conta não encontrada' using errcode = 'P0002';
  end if;
  return public.insert_shared_routine(uid, p_to, true, p_name, p_note, p_items, p_exercises);
end;
$$;

-- One sent ficha, for who received it or who sent it.
create or replace function public.shared_routine(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', s.id, 'from_team', s.from_team,
    'sender_name', case when s.from_team then 'Anilha' else public.display_name_of(s.sender) end,
    'name', s.name, 'note', s.note, 'items', s.items, 'exercises', s.exercises,
    'status', s.status, 'created_at', s.created_at, 'mine', s.sender = auth.uid())
  from public.shared_routines s
  where s.id = p_id and auth.uid() in (s.recipient, s.sender);
$$;

-- Accept or decline. Accepting tells a friend who sent it.
create or replace function public.answer_shared_routine(p_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_uid();
  s public.shared_routines;
begin
  update public.shared_routines
    set status = case when p_accept then 'accepted' else 'declined' end, answered_at = now()
    where id = p_id and recipient = uid and status = 'pending'
    returning * into s;
  if s.id is null then
    return jsonb_build_object('error', 'invalid');
  end if;
  if p_accept and not s.from_team then
    perform public.queue_social_push(
      s.sender, 'ficha_aceita',
      public.display_name_of(uid) || ' adicionou sua ficha ' || s.name || '.', '/avisos');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- An answered message also reaches the phone, when notifications from friends are on.
create or replace function public.push_on_ticket_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'respondido' and new.answered_at is distinct from old.answered_at then
    perform public.queue_social_push(
      new.user_id, 'mensagem', 'O Anilha respondeu sua mensagem.', '/mensagens');
  end if;
  return null;
end;
$$;
create trigger tickets_push after update on public.tickets
  for each row execute function public.push_on_ticket_answer();

-- The inbox: fichas received (open ones until answered) and fichas a friend added.
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
    ) all_items
    order by (item ->> 'at')::timestamptz desc
    limit 100
  ) latest;
$$;

-- Panel numbers: fichas sent in 30 days and how many were added.
create or replace function public.admin_overview(p_today date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  perform public.require_admin();
  with act as (
    select * from public.activity_days()
  ), health as (
    select distinct on (c.user_id) c.user_id, c.granted
    from public.consents c where c.kind = 'saude'
    order by c.user_id, c.created_at desc, c.id desc
  )
  select jsonb_build_object(
    'accounts', (select count(*) from auth.users),
    'new_7d', (select count(*) from auth.users u where public.br_day(u.created_at) > p_today - 7),
    'new_30d', (select count(*) from auth.users u where public.br_day(u.created_at) > p_today - 30),
    'active_7d', (select count(distinct a.user_id) from act a where a.day > p_today - 7 and a.day <= p_today),
    'active_30d', (select count(distinct a.user_id) from act a where a.day > p_today - 30 and a.day <= p_today),
    'workouts_7d', (select count(*) from act a where a.kind = 'treino' and a.day > p_today - 7 and a.day <= p_today),
    'cardio_7d', (select count(*) from act a where a.kind = 'cardio' and a.day > p_today - 7 and a.day <= p_today),
    'push', (select count(distinct s.user_id) from public.push_subscriptions s),
    'terms_ok', (select count(distinct c.user_id) from public.consents c
                 where c.kind = 'termos' and c.granted),
    'health_on', (select count(*) from health h where h.granted),
    'health_off', (select count(*) from health h where not h.granted),
    'tickets_open', (select count(*) from public.tickets t where t.status = 'aberto'),
    'privacy_open', (select count(*) from public.tickets t
                     where t.status = 'aberto' and public.privacy_kind(t.kind)),
    'privacy_due', (select min(t.created_at) + interval '15 days' from public.tickets t
                    where t.status = 'aberto' and public.privacy_kind(t.kind)),
    'errors_24h', (select coalesce(sum(e.count), 0) from public.client_errors e
                   where e.last_at > now() - interval '1 day'),
    'error_kinds_7d', (select count(distinct e.message) from public.client_errors e
                       where e.last_at > now() - interval '7 days'),
    'routines_30d', (select count(*) from public.shared_routines s
                     where s.created_at > now() - interval '30 days'),
    'routines_added_30d', (select count(*) from public.shared_routines s
                           where s.created_at > now() - interval '30 days' and s.status = 'accepted'),
    'signups', (
      select jsonb_agg(jsonb_build_object('day', d, 'value', (
        select count(*) from auth.users u where public.br_day(u.created_at) = d)) order by d)
      from (select p_today - 29 + i as d from generate_series(0, 29) i) days),
    'weekly_active', (
      select jsonb_agg(jsonb_build_object('day', w, 'value', (
        select count(distinct a.user_id) from act a where a.day between w and w + 6)) order by w)
      from (select date_trunc('week', p_today)::date - 7 * i as w from generate_series(0, 7) i) weeks)
  ) into result;
  return result;
end;
$$;

-- One account in the panel, now with the fichas the team sent to it.
create or replace function public.admin_user(p_id uuid, p_today date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  if not exists (select 1 from auth.users where id = p_id) then
    raise exception 'Conta não encontrada' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'weeks', (
      select jsonb_agg(jsonb_build_object(
          'day', w,
          'treino', (select count(*) from public.activity_days() a
                     where a.user_id = p_id and a.kind = 'treino' and a.day between w and w + 6),
          'cardio', (select count(*) from public.activity_days() a
                     where a.user_id = p_id and a.kind = 'cardio' and a.day between w and w + 6)
        ) order by w)
      from (select date_trunc('week', p_today)::date - 7 * i as w from generate_series(0, 11) i) weeks),
    'tickets', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', t.id, 'kind', t.kind, 'status', t.status, 'created_at', t.created_at
        ) order by t.created_at desc), '[]'::jsonb)
      from public.tickets t where t.user_id = p_id),
    'consents', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'kind', c.kind, 'version', c.version, 'granted', c.granted, 'at', c.created_at
        ) order by c.created_at desc, c.id desc), '[]'::jsonb)
      from public.consents c where c.user_id = p_id),
    'errors', (
      select coalesce(jsonb_agg(x order by (x ->> 'last_at') desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'message', e.message, 'count', e.count, 'last_at', e.last_at,
          'version', e.version, 'url', e.url) as x
        from public.client_errors e where e.user_id = p_id
        order by e.last_at desc limit 10
      ) recent),
    'routines', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', s.id, 'name', s.name, 'status', s.status, 'created_at', s.created_at
        ) order by s.created_at desc), '[]'::jsonb)
      from public.shared_routines s where s.recipient = p_id and s.from_team)
  );
end;
$$;

-- Daily cleanup, now also for sent fichas: 30 days after the answer, 60 days unanswered.
create or replace function public.purge_old_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t text;
  cutoff bigint := (extract(epoch from now() - interval '30 days') * 1000)::bigint;
  n integer;
  total integer := 0;
begin
  foreach t in array public.synced_tables() loop
    execute format(
      'with gone as (
         delete from public.%I where deleted and updated_at < $1
         returning user_id, server_seq
       ), marked as (
         insert into public.sync_horizons (user_id, horizon)
         select user_id, max(server_seq) from gone group by user_id
         on conflict (user_id) do update
           set horizon = greatest(public.sync_horizons.horizon, excluded.horizon)
       )
       select count(*)::integer from gone', t)
      into n using cutoff;
    total := total + n;
  end loop;
  delete from public.code_attempts where at < now() - interval '1 day';
  delete from public.reminder_log where sent_at < now() - interval '7 days';
  delete from public.group_invites
    where status <> 'pending' and answered_at < now() - interval '30 days';
  delete from public.invites
    where (used_at is not null and used_at < now() - interval '30 days')
       or (used_at is null and expires_at < now() - interval '30 days');
  delete from public.shared_routines
    where (status <> 'pending' and answered_at < now() - interval '30 days')
       or (status = 'pending' and created_at < now() - interval '60 days');
  delete from public.client_errors where last_at < now() - interval '30 days';
  delete from public.push_jobs where created_at < now() - interval '2 days';
  return jsonb_build_object('tombstones', total);
end;
$$;

revoke execute on all functions in schema public from public, anon;
revoke all on all tables in schema public from anon;
revoke execute on function public.clean_routine_items(jsonb) from authenticated;
revoke execute on function public.clean_routine_exercises(jsonb) from authenticated;
revoke execute on function public.insert_shared_routine(uuid, uuid, boolean, text, text, jsonb, jsonb) from authenticated;
revoke execute on function public.push_on_ticket_answer() from authenticated;
revoke execute on function public.purge_old_data() from authenticated;
grant execute on function public.my_friends() to authenticated;
grant execute on function public.send_routine(uuid, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.admin_send_routine(uuid, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.shared_routine(uuid) to authenticated;
grant execute on function public.answer_shared_routine(uuid, boolean) to authenticated;
grant execute on function public.inbox(timestamptz) to authenticated;
grant execute on function public.admin_overview(date) to authenticated;
grant execute on function public.admin_user(uuid, date) to authenticated;
