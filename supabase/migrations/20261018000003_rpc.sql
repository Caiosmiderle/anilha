-- Anilha: RPCs. Sync runs as the caller (row level security applies).
-- Social reads and writes run as definer with explicit checks.

create or replace function public.synced_tables()
returns text[]
language sql
immutable
as $$
  select array[
    'profiles', 'exercises', 'plans', 'routines', 'routine_items', 'sessions',
    'session_items', 'sets', 'runs', 'pain_reports', 'day_overrides', 'records'
  ];
$$;

-- Upserts a batch of rows. Last write wins by updated_at; an older write is ignored.
-- Idempotent: replaying the same batch changes nothing, so offline retries never duplicate.
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
        and attname not in ('user_id', 'id');
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

-- Rows changed since a cursor, across all synced tables, in server order.
create or replace function public.sync_pull(since bigint, max_rows integer default 500)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  q text := '';
  t text;
  out_rows jsonb;
  out_max bigint;
  out_count integer;
begin
  if uid is null then
    raise exception 'Sem sessão' using errcode = '28000';
  end if;
  -- Waits for this user's in-flight pushes, so no committed row is skipped by the cursor.
  perform pg_advisory_xact_lock_shared(hashtext(uid::text));
  foreach t in array public.synced_tables() loop
    q := q || case when q = '' then '' else ' union all ' end || format(
      'select %1$L::text as tbl, x.server_seq as seq, to_jsonb(x) - ''server_seq'' as row
         from public.%1$I x where x.user_id = $1 and x.server_seq > $2', t);
  end loop;
  execute format(
    'select coalesce(jsonb_agg(jsonb_build_object(''table'', tbl, ''row'', row) order by seq), ''[]''::jsonb),
            max(seq), count(*)
       from (select * from (%s) u order by seq limit $3) z', q)
    into out_rows, out_max, out_count
    using uid, since, least(greatest(max_rows, 1), 2000);
  return jsonb_build_object(
    'rows', out_rows,
    'cursor', coalesce(out_max, since),
    'more', out_count >= least(greatest(max_rows, 1), 2000)
  );
end;
$$;

-- Weekly counts of one user. Internal: callable only from other definer functions.
create or replace function public.week_counts(p_user uuid, p_week_start date)
returns table (planned_gym integer, planned_run integer, done_gym integer, done_run integer)
language sql
stable
security definer
set search_path = public
as $$
  with plan as (
    select p.gym_per_week, p.run_per_week from public.plans p
    where p.user_id = p_user and not p.deleted and p.active_from <= p_week_start + 6
    order by p.active_from desc, p.updated_at desc
    limit 1
  )
  select
    coalesce((select gym_per_week from plan), 0),
    coalesce((select run_per_week from plan), 0),
    (select count(*)::integer from public.sessions s
      where s.user_id = p_user and not s.deleted and s.status = 'done'
        and s.local_date between p_week_start and p_week_start + 6),
    (select count(*)::integer from public.runs r
      where r.user_id = p_user and not r.deleted
        and r.local_date between p_week_start and p_week_start + 6);
$$;

create or replace function public.gen_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  b bytea := uuid_send(gen_random_uuid());
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  i integer;
begin
  -- Bytes 6 and 8 carry the uuid version and variant bits; skip them.
  foreach i in array array[0, 1, 2, 3, 4, 5, 10, 11] loop
    code := code || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return code;
end;
$$;

create or replace function public.too_many_attempts(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select count(*) >= 20 from public.code_attempts
  where user_id = uid and at > now() - interval '1 hour';
$$;

create or replace function public.require_uid()
returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Sem sessão' using errcode = '28000';
  end if;
  return uid;
end;
$$;

create or replace function public.display_name_of(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select nullif(display_name, '') from public.profiles
    where user_id = p_user and id = p_user::text and not deleted
  ), 'Sem nome');
$$;

create or replace function public.create_invite()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_uid();
  c text;
  exp timestamptz := now() + interval '7 days';
begin
  if (select count(*) from public.invites where inviter = uid and created_at > now() - interval '1 day') >= 20 then
    return jsonb_build_object('error', 'limite');
  end if;
  loop
    c := public.gen_code();
    begin
      insert into public.invites (code, inviter, expires_at) values (c, uid, exp);
      exit;
    exception when unique_violation then
      -- try another code
    end;
  end loop;
  return jsonb_build_object('code', c, 'expires_at', exp);
end;
$$;

create or replace function public.invite_info(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_uid();
  inv public.invites;
begin
  if public.too_many_attempts(uid) then
    return jsonb_build_object('error', 'tentativas');
  end if;
  select * into inv from public.invites where code = upper(trim(p_code));
  if not found or inv.expires_at < now() or inv.used_by is not null then
    insert into public.code_attempts (user_id) values (uid);
    return jsonb_build_object('error', 'invalido');
  end if;
  if inv.inviter = uid then
    return jsonb_build_object('error', 'proprio');
  end if;
  return jsonb_build_object(
    'inviter_name', public.display_name_of(inv.inviter),
    'already_friends', public.are_friends(uid, inv.inviter)
  );
end;
$$;

create or replace function public.accept_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_uid();
  inv public.invites;
begin
  if public.too_many_attempts(uid) then
    return jsonb_build_object('error', 'tentativas');
  end if;
  select * into inv from public.invites where code = upper(trim(p_code)) for update;
  if not found or inv.expires_at < now() or inv.used_by is not null
     or public.blocked_between(uid, inv.inviter) then
    insert into public.code_attempts (user_id) values (uid);
    return jsonb_build_object('error', 'invalido');
  end if;
  if inv.inviter = uid then
    return jsonb_build_object('error', 'proprio');
  end if;
  insert into public.friendships (user_a, user_b)
    values (least(uid, inv.inviter), greatest(uid, inv.inviter))
    on conflict do nothing;
  update public.invites set used_by = uid, used_at = now() where code = inv.code;
  return jsonb_build_object('friend_id', inv.inviter, 'name', public.display_name_of(inv.inviter));
end;
$$;

create or replace function public.remove_friend(p_friend uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_uid();
begin
  delete from public.friendships
    where user_a = least(uid, p_friend) and user_b = greatest(uid, p_friend);
  delete from public.reactions where (actor = uid and owner = p_friend) or (actor = p_friend and owner = uid);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.block_user(p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_uid();
begin
  if p_target = uid then
    return jsonb_build_object('error', 'proprio');
  end if;
  insert into public.blocks (blocker, blocked) values (uid, p_target) on conflict do nothing;
  perform public.remove_friend(p_target);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.unblock_user(p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_uid();
begin
  delete from public.blocks where blocker = uid and blocked = p_target;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.list_blocked()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.blocked, 'name', public.display_name_of(b.blocked))
    order by b.created_at desc), '[]'::jsonb)
  from public.blocks b where b.blocker = auth.uid();
$$;

-- What friends see: adherence, workouts (type and date) and records, each only when the
-- owner shares it. Loads, reps, distances and notes only with share_details.
create or replace function public.friends_overview(p_week_start date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_uid();
  result jsonb;
begin
  select coalesce(jsonb_agg(item order by item ->> 'name'), '[]'::jsonb) into result
  from (
    select jsonb_build_object(
      'id', fr.friend,
      'name', public.display_name_of(fr.friend),
      'share_details', coalesce(p.share_details, false),
      'adherence', case when coalesce(p.share_adherence, true) then (
        select to_jsonb(w) from public.week_counts(fr.friend, p_week_start) w
      ) end,
      'activities', case when coalesce(p.share_workouts, true) then (
        select coalesce(jsonb_agg(a.obj order by a.local_date desc, a.started desc), '[]'::jsonb)
        from (
          select s.local_date, s.started_at as started, jsonb_build_object(
            'kind', 'session', 'id', s.id, 'local_date', s.local_date, 'title', s.title,
            'reactions', (select count(*) from public.reactions x
              where x.owner = fr.friend and x.target_kind = 'session' and x.target_id = s.id),
            'reacted', exists (select 1 from public.reactions x
              where x.actor = uid and x.owner = fr.friend and x.target_kind = 'session' and x.target_id = s.id)
          ) as obj
          from public.sessions s
          where s.user_id = fr.friend and not s.deleted and s.status = 'done'
            and s.local_date >= p_week_start - 7
          union all
          select r.local_date, 0, jsonb_build_object(
            'kind', 'run', 'id', r.id, 'local_date', r.local_date,
            'title', case r.run_type when 'longo' then 'Corrida longa'
              when 'intervalado' then 'Corrida intervalada' else 'Corrida leve' end,
            'distance_km', case when coalesce(p.share_details, false) then r.distance_km end,
            'reactions', (select count(*) from public.reactions x
              where x.owner = fr.friend and x.target_kind = 'run' and x.target_id = r.id),
            'reacted', exists (select 1 from public.reactions x
              where x.actor = uid and x.owner = fr.friend and x.target_kind = 'run' and x.target_id = r.id)
          )
          from public.runs r
          where r.user_id = fr.friend and not r.deleted and r.local_date >= p_week_start - 7
        ) a
      ) end,
      'records', case when coalesce(p.share_records, true) then (
        select coalesce(jsonb_agg(jsonb_build_object(
          'exercise_name', rc.exercise_name, 'kind', rc.kind, 'local_date', rc.local_date,
          'value', case when coalesce(p.share_details, false) then rc.value end,
          'unit', rc.unit
        ) order by rc.local_date desc), '[]'::jsonb)
        from (
          select * from public.records rc
          where rc.user_id = fr.friend and not rc.deleted and rc.local_date >= p_week_start - 28
          order by rc.local_date desc limit 10
        ) rc
      ) end
    ) as item
    from (
      select case when f.user_a = uid then f.user_b else f.user_a end as friend
      from public.friendships f where uid in (f.user_a, f.user_b)
    ) fr
    left join public.profiles p on p.user_id = fr.friend and p.id = fr.friend::text
    where not public.blocked_between(uid, fr.friend)
  ) q;
  return result;
end;
$$;

-- Runs as the caller: row level security decides what comes back.
create or replace function public.friend_session_details(p_friend uuid, p_session text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(to_jsonb(i) - 'server_seq' order by i.position)
      from public.session_items i
      where i.user_id = p_friend and i.session_id = p_session and not i.deleted
    ), '[]'::jsonb),
    'sets', coalesce((
      select jsonb_agg(to_jsonb(s) - 'server_seq' order by s.position)
      from public.sets s
      where s.user_id = p_friend and s.session_id = p_session and not s.deleted
        and s.completed_at is not null
    ), '[]'::jsonb),
    'exercises', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name))
      from public.exercises e where e.user_id = p_friend and not e.deleted
    ), '[]'::jsonb)
  );
$$;

create or replace function public.set_reaction(p_owner uuid, p_kind text, p_target text, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_uid();
  shares boolean;
  exists_target boolean;
begin
  if not public.are_friends(uid, p_owner) then
    return jsonb_build_object('error', 'nao_amigo');
  end if;
  select coalesce(share_workouts, true) into shares from public.profiles
    where user_id = p_owner and id = p_owner::text;
  if shares is false then
    return jsonb_build_object('error', 'privado');
  end if;
  if p_kind = 'session' then
    select exists (select 1 from public.sessions where user_id = p_owner and id = p_target and not deleted and status = 'done')
      into exists_target;
  elsif p_kind = 'run' then
    select exists (select 1 from public.runs where user_id = p_owner and id = p_target and not deleted)
      into exists_target;
  else
    return jsonb_build_object('error', 'tipo');
  end if;
  if not exists_target then
    return jsonb_build_object('error', 'nao_encontrado');
  end if;
  if p_on then
    insert into public.reactions (actor, owner, target_kind, target_id)
      values (uid, p_owner, p_kind, p_target) on conflict do nothing;
  else
    delete from public.reactions
      where actor = uid and owner = p_owner and target_kind = p_kind and target_id = p_target;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.reactions_received(p_since date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'actor_id', r.actor,
    'actor_name', public.display_name_of(r.actor),
    'target_kind', r.target_kind,
    'target_id', r.target_id,
    'created_at', r.created_at
  ) order by r.created_at desc), '[]'::jsonb)
  from public.reactions r
  where r.owner = auth.uid() and r.created_at >= p_since
    and public.are_friends(r.actor, r.owner);
$$;

create or replace function public.create_group(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_uid();
  gid uuid;
  c text;
begin
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 60 then
    return jsonb_build_object('error', 'nome');
  end if;
  if (select count(*) from public.groups where owner = uid) >= 10 then
    return jsonb_build_object('error', 'limite');
  end if;
  loop
    c := public.gen_code();
    begin
      insert into public.groups (name, owner, join_code) values (trim(p_name), uid, c) returning id into gid;
      exit;
    exception when unique_violation then
      -- try another code
    end;
  end loop;
  insert into public.group_members (group_id, user_id) values (gid, uid);
  return jsonb_build_object('id', gid, 'join_code', c);
end;
$$;

create or replace function public.join_group(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_uid();
  g public.groups;
begin
  if public.too_many_attempts(uid) then
    return jsonb_build_object('error', 'tentativas');
  end if;
  select * into g from public.groups where join_code = upper(trim(p_code));
  if not found then
    insert into public.code_attempts (user_id) values (uid);
    return jsonb_build_object('error', 'invalido');
  end if;
  if (select count(*) from public.group_members where group_id = g.id) >= 50 then
    return jsonb_build_object('error', 'cheio');
  end if;
  insert into public.group_members (group_id, user_id) values (g.id, uid) on conflict do nothing;
  return jsonb_build_object('id', g.id, 'name', g.name);
end;
$$;

create or replace function public.leave_group(p_group uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_uid();
begin
  delete from public.group_members where group_id = p_group and user_id = uid;
  delete from public.groups g where g.id = p_group
    and not exists (select 1 from public.group_members m where m.group_id = g.id);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.my_groups()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'name', g.name, 'join_code', g.join_code, 'is_owner', g.owner = auth.uid(),
    'members', (select count(*) from public.group_members x where x.group_id = g.id)
  ) order by g.created_at), '[]'::jsonb)
  from public.groups g
  join public.group_members m on m.group_id = g.id and m.user_id = auth.uid();
$$;

-- Weekly challenge: share of the plan done, capped at 100%.
-- Doing 5 of 3 never ranks above doing 3 of 3.
create or replace function public.group_ranking(p_group uuid, p_week_start date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_uid();
  result jsonb;
begin
  if not exists (select 1 from public.group_members where group_id = p_group and user_id = uid) then
    return jsonb_build_object('error', 'nao_membro');
  end if;
  with counts as (
    select m.user_id, public.display_name_of(m.user_id) as name, w.*
    from public.group_members m
    cross join lateral public.week_counts(m.user_id, p_week_start) w
    where m.group_id = p_group
      and (m.user_id = uid or not public.blocked_between(uid, m.user_id))
  ), scored as (
    select *,
      case when planned_gym + planned_run = 0 then 0::numeric
        else round((least(done_gym, planned_gym) + least(done_run, planned_run))::numeric
          / (planned_gym + planned_run), 4)
      end as pct
    from counts
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', user_id, 'name', name, 'is_me', user_id = uid,
      'planned_gym', planned_gym, 'planned_run', planned_run,
      'done_gym', done_gym, 'done_run', done_run,
      'pct', pct, 'position', pos
    ) order by pos, name), '[]'::jsonb)
    into result
  from (select *, rank() over (order by pct desc) as pos from scored) ranked;
  return jsonb_build_object('members', result);
end;
$$;

-- Deletes the account and, by cascade, every row of the user.
create or replace function public.delete_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_uid();
begin
  delete from auth.users where id = uid;
  return jsonb_build_object('ok', true);
end;
$$;

-- Privileges: nothing is callable by anonymous users; internals are callable by no one.
revoke execute on all functions in schema public from public, anon;
revoke execute on function public.week_counts(uuid, date) from authenticated;
revoke execute on function public.blocked_between(uuid, uuid) from authenticated;
revoke execute on function public.are_friends(uuid, uuid) from authenticated;
revoke execute on function public.too_many_attempts(uuid) from authenticated;
revoke execute on function public.display_name_of(uuid) from authenticated;
revoke execute on function public.touch_server_seq() from authenticated;
revoke all on all tables in schema public from anon;
