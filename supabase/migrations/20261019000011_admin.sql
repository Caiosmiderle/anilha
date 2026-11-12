-- Management panel. Only accounts listed in public.admins get in, checked on the server
-- in every function; nothing here is readable otherwise. It shows what running the app
-- needs (accounts, activity counts, messages, errors) and never health data or the
-- content of workouts (LGPD: necessity; see docs/LGPD.md).

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from authenticated;

-- Whether the caller is an admin: the app shows the panel link only then.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

create or replace function public.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_uid();
begin
  if not exists (select 1 from public.admins a where a.user_id = uid) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return uid;
end;
$$;

-- Days with a finished workout or a cardio session, per person. Brazil's calendar for
-- the account dates, like the app.
create or replace function public.activity_days()
returns table (user_id uuid, day date, kind text)
language sql
stable
security definer
set search_path = public
as $$
  select s.user_id, s.local_date, 'treino'::text
    from public.sessions s where not s.deleted and s.status = 'done'
  union all
  select r.user_id, r.local_date, 'cardio'::text
    from public.runs r where not r.deleted;
$$;

create or replace function public.br_day(p_at timestamptz)
returns date
language sql
immutable
set search_path = public
as $$
  select (p_at at time zone 'America/Sao_Paulo')::date;
$$;

-- Requests about personal data: 15 days to answer (LGPD art. 19, II).
create or replace function public.privacy_kind(p_kind text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_kind in (
    'acesso', 'correcao', 'exclusao', 'portabilidade', 'compartilhamento', 'revogacao', 'privacidade'
  );
$$;

-- Numbers of the whole app, for the overview. p_today is the admin's local day.
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

-- Every account with what support and follow-up need: no health data, no workout content.
create or replace function public.admin_users()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return (
    with per as (
      select a.user_id,
        count(*) filter (where a.kind = 'treino') as workouts,
        count(*) filter (where a.kind = 'cardio') as cardio,
        min(a.day) as first_day,
        max(a.day) as last_day,
        count(distinct date_trunc('week', a.day)) as weeks
      from public.activity_days() a
      group by a.user_id
    ), health as (
      select distinct on (c.user_id) c.user_id, c.granted
      from public.consents c where c.kind = 'saude'
      order by c.user_id, c.created_at desc, c.id desc
    ), terms as (
      select distinct on (c.user_id) c.user_id, c.version
      from public.consents c where c.kind = 'termos'
      order by c.user_id, c.created_at desc, c.id desc
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'name', nullif(p.display_name, ''),
        'created_at', u.created_at,
        'last_sign_in_at', u.last_sign_in_at,
        'plan', exists (select 1 from public.plans pl where pl.user_id = u.id and not pl.deleted),
        'workouts', coalesce(per.workouts, 0),
        'cardio', coalesce(per.cardio, 0),
        'first_day', per.first_day,
        'last_day', per.last_day,
        'weeks', coalesce(per.weeks, 0),
        'friends', (select count(*) from public.friendships f where u.id in (f.user_a, f.user_b)),
        'push', exists (select 1 from public.push_subscriptions s where s.user_id = u.id),
        'health', h.granted,
        'terms', t.version,
        'open_tickets', (select count(*) from public.tickets k
                         where k.user_id = u.id and k.status = 'aberto'),
        'admin', exists (select 1 from public.admins ad where ad.user_id = u.id)
      ) order by u.created_at desc), '[]'::jsonb)
    from auth.users u
    left join public.profiles p on p.user_id = u.id and not p.deleted
    left join per on per.user_id = u.id
    left join health h on h.user_id = u.id
    left join terms t on t.user_id = u.id
  );
end;
$$;

-- One account: activity by week, messages, consent history and recent errors.
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
      ) recent)
  );
end;
$$;

-- Messages, the open ones first (oldest first: they are closest to the deadline).
create or replace function public.admin_tickets()
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
        'id', t.id, 'user_id', t.user_id, 'email', u.email, 'name', nullif(p.display_name, ''),
        'kind', t.kind, 'message', t.message, 'status', t.status, 'answer', t.answer,
        'created_at', t.created_at, 'answered_at', t.answered_at,
        'app_version', t.app_version, 'user_agent', t.user_agent
      ) order by (t.status = 'aberto') desc,
                 case when t.status = 'aberto' then t.created_at end,
                 t.answered_at desc), '[]'::jsonb)
    from public.tickets t
    join auth.users u on u.id = t.user_id
    left join public.profiles p on p.user_id = t.user_id and not p.deleted
  );
end;
$$;

-- Answers (or answers again) a message; the person sees it in the app and in the inbox.
create or replace function public.admin_answer_ticket(p_id uuid, p_answer text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a text := btrim(coalesce(p_answer, ''));
begin
  perform public.require_admin();
  if char_length(a) not between 1 and 4000 then
    raise exception 'Escreva a resposta (até 4.000 caracteres)' using errcode = '22023';
  end if;
  update public.tickets set status = 'respondido', answer = a, answered_at = now()
    where id = p_id;
  if not found then
    raise exception 'Mensagem não encontrada' using errcode = 'P0002';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- App errors grouped by message: how often, how many people, the latest details.
create or replace function public.admin_errors()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return (
    select coalesce(jsonb_agg(g order by (g ->> 'last_at') desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'message', e.message,
        'count', sum(e.count),
        'people', count(distinct e.user_id),
        'first_at', min(e.created_at),
        'last_at', max(e.last_at),
        'version', (array_agg(e.version order by e.last_at desc))[1],
        'url', (array_agg(e.url order by e.last_at desc))[1],
        'stack', (array_agg(e.stack order by e.last_at desc))[1]
      ) as g
      from public.client_errors e
      group by e.message
      order by max(e.last_at) desc
      limit 100
    ) grouped
  );
end;
$$;

revoke execute on all functions in schema public from public, anon;
revoke all on all tables in schema public from anon;
revoke execute on function public.require_admin() from authenticated;
revoke execute on function public.activity_days() from authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_overview(date) to authenticated;
grant execute on function public.admin_users() to authenticated;
grant execute on function public.admin_user(uuid, date) to authenticated;
grant execute on function public.admin_tickets() to authenticated;
grant execute on function public.admin_answer_ticket(uuid, text) to authenticated;
grant execute on function public.admin_errors() to authenticated;
