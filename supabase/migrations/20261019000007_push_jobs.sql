-- Notifications beyond the daily reminder: the end of a rest, and what friends do
-- (a reaction, an invite to a group, an invite used, someone joining your group).
-- Jobs wait in a queue with the time to send; a dispatcher (pg_cron, every few seconds,
-- see supabase/setup/push_dispatch.sql) calls the send-reminders edge function only
-- when something is due. Preferences live in profiles.reminders: "rest" and "social",
-- both on unless turned off.

create table public.push_jobs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('rest', 'social')),
  topic text not null check (char_length(topic) <= 30),
  due_at timestamptz not null,
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) <= 200),
  url text not null default '/' check (char_length(url) <= 200),
  tag text not null check (char_length(tag) <= 40),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index push_jobs_due_idx on public.push_jobs (due_at) where sent_at is null;
create index push_jobs_user_idx on public.push_jobs (user_id, kind, created_at);

-- RLS on and no policy: only the functions below touch it.
alter table public.push_jobs enable row level security;

create or replace function public.wants_push(p_user uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select coalesce((p.reminders ->> p_kind)::boolean, true)
    from public.profiles p
    where p.user_id = p_user and p.id = p_user::text and not p.deleted
  ), true);
$$;

-- The end of the rest, scheduled by the phone when a rest starts. One per person:
-- a new rest replaces the old one.
create or replace function public.schedule_rest_alert(p_due timestamptz, p_title text, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_uid();
begin
  delete from public.push_jobs where user_id = uid and kind = 'rest' and sent_at is null;
  if not public.wants_push(uid, 'rest') then
    return jsonb_build_object('ok', false, 'motivo', 'desligado');
  end if;
  if p_due < now() - interval '10 seconds' or p_due > now() + interval '20 minutes' then
    return jsonb_build_object('error', 'horario');
  end if;
  insert into public.push_jobs (user_id, kind, topic, due_at, title, body, url, tag)
  values (uid, 'rest', 'descanso', p_due, left(coalesce(nullif(trim(p_title), ''), 'Descanso acabou'), 80),
          left(coalesce(p_body, ''), 200), '/', 'anilha-descanso');
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.cancel_rest_alert()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.push_jobs where user_id = public.require_uid() and kind = 'rest' and sent_at is null;
  return jsonb_build_object('ok', true);
end;
$$;

-- A social notification now, unless turned off or one of the same topic went out
-- in the last 10 minutes (the inbox has the rest).
create or replace function public.queue_social_push(p_user uuid, p_topic text, p_body text, p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null or not public.wants_push(p_user, 'social') then
    return;
  end if;
  if exists (
    select 1 from public.push_jobs
    where user_id = p_user and kind = 'social' and topic = p_topic
      and created_at > now() - interval '10 minutes'
  ) then
    return;
  end if;
  insert into public.push_jobs (user_id, kind, topic, due_at, title, body, url, tag)
  values (p_user, 'social', p_topic, now(), 'Anilha', left(p_body, 200), p_url, 'anilha-amigos');
end;
$$;

create or replace function public.push_on_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.queue_social_push(
    new.owner, 'reacao',
    public.display_name_of(new.actor) || ' mandou um boa ' ||
      case when new.target_kind = 'run' then 'na sua corrida' else 'no seu treino' end || '.',
    '/avisos');
  return null;
end;
$$;

create or replace function public.push_on_group_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  gname text;
begin
  select name into gname from public.groups where id = new.group_id;
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.queue_social_push(
      new.invitee, 'convite_grupo',
      public.display_name_of(new.inviter) || ' chamou você para o grupo ' || gname || '.',
      '/avisos');
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status = 'pending' then
    perform public.queue_social_push(
      new.inviter, 'entrou_grupo',
      public.display_name_of(new.invitee) || ' entrou em ' || gname || '.',
      '/amigos/grupo/' || new.group_id);
  end if;
  return null;
end;
$$;

create or replace function public.push_on_invite_used()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.used_by is not null and old.used_by is null then
    perform public.queue_social_push(
      new.inviter, 'amigo_novo',
      public.display_name_of(new.used_by) || ' aceitou seu convite. Agora vocês são amigos.',
      '/amigos');
  end if;
  return null;
end;
$$;

create trigger reactions_push after insert on public.reactions
  for each row execute function public.push_on_reaction();
create trigger group_invites_push after insert or update on public.group_invites
  for each row execute function public.push_on_group_invite();
create trigger invites_push after update on public.invites
  for each row execute function public.push_on_invite_used();

-- Claims what is due and returns it with the subscriptions to notify. Jobs of people
-- without a subscription are dropped. Old jobs are cleaned. Service role only.
create or replace function public.claim_push_jobs(p_now timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  with due as (
    select id from public.push_jobs
    where sent_at is null and due_at <= p_now
    order by due_at
    limit 200
    for update skip locked
  ), marked as (
    update public.push_jobs j set sent_at = p_now
    from due where j.id = due.id
    returning j.user_id, j.title, j.body, j.url, j.tag
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
    'title', m.title, 'body', m.body, 'url', m.url, 'tag', m.tag
  )), '[]'::jsonb)
  into result
  from marked m
  join public.push_subscriptions s on s.user_id = m.user_id;
  delete from public.push_jobs where created_at < p_now - interval '2 days';
  return result;
end;
$$;

-- Sync: update only the columns the device sent. A phone still on an older version
-- does not know newer columns, and must not wipe them.
create or replace function public.sync_push(changes jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ch jsonb;
  t text;
  r jsonb;
  cols text;
  n integer;
  applied integer := 0;
  stale integer := 0;
  rejected jsonb := '[]'::jsonb;
begin
  if uid is null then
    raise exception 'Sem sessão' using errcode = '28000';
  end if;
  if jsonb_typeof(changes) <> 'array' then
    raise exception 'Formato inválido' using errcode = '22023';
  end if;
  if jsonb_array_length(changes) > 500 then
    raise exception 'Lote grande demais' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext(uid::text));

  for ch in select value from jsonb_array_elements(changes) loop
    t := ch ->> 'table';
    r := ch -> 'row';
    if t is null or not (t = any (public.synced_tables())) or jsonb_typeof(r) <> 'object' then
      rejected := rejected || jsonb_build_object('table', t, 'id', r ->> 'id', 'error', 'tabela');
      continue;
    end if;
    r := r || jsonb_build_object('user_id', uid, 'server_seq', 0);
    select string_agg(format('%1$I = excluded.%1$I', attname), ', ')
      into cols
      from pg_attribute
      where attrelid = format('public.%I', t)::regclass
        and attnum > 0 and not attisdropped
        and attname not in ('user_id', 'id')
        and (attname = 'server_seq' or r ? attname);
    begin
      execute format(
        'insert into public.%1$I as cur
           select * from jsonb_populate_record(null::public.%1$I, $1)
         on conflict (user_id, id) do update set %2$s
           where cur.updated_at <= excluded.updated_at',
        t, cols)
        using r;
      get diagnostics n = row_count;
      if n > 0 then
        applied := applied + 1;
      else
        stale := stale + 1;
      end if;
    exception when others then
      rejected := rejected || jsonb_build_object('table', t, 'id', r ->> 'id', 'error', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('applied', applied, 'stale', stale, 'rejected', rejected);
end;
$$;

revoke execute on all functions in schema public from public, anon;
revoke all on all tables in schema public from anon;
revoke execute on function public.wants_push(uuid, text) from authenticated;
revoke execute on function public.queue_social_push(uuid, text, text, text) from authenticated;
revoke execute on function public.claim_push_jobs(timestamptz) from authenticated;
revoke execute on function public.push_on_reaction() from authenticated;
revoke execute on function public.push_on_group_invite() from authenticated;
revoke execute on function public.push_on_invite_used() from authenticated;
grant execute on function public.schedule_rest_alert(timestamptz, text, text) to authenticated;
grant execute on function public.cancel_rest_alert() to authenticated;
grant execute on function public.sync_push(jsonb) to authenticated;
grant execute on function public.claim_push_jobs(timestamptz) to service_role;
