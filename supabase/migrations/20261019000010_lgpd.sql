-- LGPD: consent records, a message box for data requests and support, health data only
-- with consent, and retention (deleted rows leave the server after 30 days).

-- 1. Consent. Append only: the latest row of each kind is the current choice, and the
-- history is the proof the controller must keep (LGPD art. 8, par. 2).
create table public.consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('termos', 'saude')),
  version text not null check (char_length(version) between 1 and 20),
  granted boolean not null,
  created_at timestamptz not null default now()
);
create index consents_user_idx on public.consents (user_id, kind, created_at desc);
alter table public.consents enable row level security;
-- The owner reads it: sync_push runs as the caller and checks the health choice.
create policy consents_owner_read on public.consents for select to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update, delete on public.consents from authenticated;

-- A deleted health record keeps no health value: the tombstone only carries the deletion
-- to the other devices.
alter table public.pain_reports alter column joint drop not null;
alter table public.pain_reports add constraint pain_reports_joint_kept
  check (deleted or joint is not null);

-- Health data of one person: weight and waist, pain reports, joints to spare. Deleted on
-- the server; the tombstones reach the other devices on their next pull.
create or replace function public.drop_health_data(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  update public.body_logs
    set deleted = true, weight_kg = null, waist_cm = null, note = null,
        updated_at = greatest(updated_at + 1, now_ms)
    where user_id = p_user
      and (not deleted or weight_kg is not null or waist_cm is not null or note is not null);
  update public.pain_reports
    set deleted = true, joint = null, updated_at = greatest(updated_at + 1, now_ms)
    where user_id = p_user and (not deleted or joint is not null);
  update public.day_overrides
    set deleted = true, value = null, updated_at = greatest(updated_at + 1, now_ms)
    where user_id = p_user and action = 'spare_joint' and (not deleted or value is not null);
  -- Workout items and the profile keep their updated_at: an edit still waiting on a
  -- phone (a set, a new name) must not lose to this cleanup.
  update public.session_items set pain_joint = null
    where user_id = p_user and pain_joint is not null;
  update public.profiles
    set onboarding = jsonb_set(onboarding, '{spare_joints}', '[]'::jsonb)
    where user_id = p_user
      and jsonb_typeof(onboarding -> 'spare_joints') = 'array'
      and jsonb_array_length(onboarding -> 'spare_joints') > 0;
end;
$$;

-- Records a choice. Terms cannot be refused here: refusing means not using the app.
-- Revoking health consent deletes the health data right away (art. 8, par. 5; art. 16).
create or replace function public.record_consent(p_kind text, p_version text, p_granted boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_uid();
begin
  if p_kind is null or p_kind not in ('termos', 'saude') or p_granted is null
     or p_version is null or char_length(p_version) not between 1 and 20 then
    raise exception 'Pedido inválido' using errcode = '22023';
  end if;
  if p_kind = 'termos' and not p_granted then
    raise exception 'Para usar o app é preciso aceitar os termos' using errcode = '22023';
  end if;
  if (select count(*) from public.consents
      where user_id = uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Muitas mudanças hoje. Tente amanhã.' using errcode = '22023';
  end if;
  insert into public.consents (user_id, kind, version, granted)
    values (uid, p_kind, p_version, p_granted);
  if p_kind = 'saude' and not p_granted then
    perform public.drop_health_data(uid);
  end if;
  return public.consent_state();
end;
$$;

-- The current choice of each kind (null when never asked).
create or replace function public.consent_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_uid();
begin
  return jsonb_build_object(
    'termos', (
      select jsonb_build_object('version', c.version, 'granted', c.granted, 'at', c.created_at)
      from public.consents c where c.user_id = uid and c.kind = 'termos'
      order by c.created_at desc, c.id desc limit 1),
    'saude', (
      select jsonb_build_object('version', c.version, 'granted', c.granted, 'at', c.created_at)
      from public.consents c where c.user_id = uid and c.kind = 'saude'
      order by c.created_at desc, c.id desc limit 1)
  );
end;
$$;

-- Every choice ever made, for the data export.
create or replace function public.consent_history()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'kind', kind, 'version', version, 'granted', granted, 'at', created_at
    ) order by created_at, id), '[]'::jsonb)
  from public.consents where user_id = auth.uid();
$$;

-- 2. Messages to the controller: data requests (LGPD art. 18) and support. The answer
-- shows up in the app. Each person sees only their own messages.
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'acesso', 'correcao', 'exclusao', 'portabilidade', 'compartilhamento', 'revogacao',
    'privacidade', 'problema', 'sugestao', 'outro'
  )),
  message text not null check (char_length(message) between 1 and 2000),
  app_version text check (char_length(app_version) <= 40),
  user_agent text check (char_length(user_agent) <= 300),
  status text not null default 'aberto' check (status in ('aberto', 'respondido')),
  answer text check (char_length(answer) between 1 and 4000),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  check ((status = 'respondido') = (answer is not null and answered_at is not null))
);
create index tickets_user_idx on public.tickets (user_id, created_at desc);
create index tickets_status_idx on public.tickets (status, created_at);
alter table public.tickets enable row level security;

-- At most 5 messages a day. The browser description goes only with problem reports.
create or replace function public.create_ticket(
  p_kind text, p_message text, p_version text, p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_uid();
  msg text := btrim(coalesce(p_message, ''));
  new_id uuid;
begin
  if p_kind is null or p_kind not in (
    'acesso', 'correcao', 'exclusao', 'portabilidade', 'compartilhamento', 'revogacao',
    'privacidade', 'problema', 'sugestao', 'outro'
  ) then
    raise exception 'Assunto inválido' using errcode = '22023';
  end if;
  if char_length(msg) not between 1 and 2000 then
    raise exception 'Escreva de 1 a 2.000 caracteres' using errcode = '22023';
  end if;
  if (select count(*) from public.tickets
      where user_id = uid and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Limite de 5 mensagens por dia. Tente amanhã.' using errcode = '22023';
  end if;
  insert into public.tickets (user_id, kind, message, app_version, user_agent)
    values (uid, p_kind, msg, left(p_version, 40),
            case when p_kind = 'problema' then left(p_user_agent, 300) end)
    returning id into new_id;
  return jsonb_build_object('id', new_id);
end;
$$;

create or replace function public.my_tickets()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'kind', kind, 'message', message, 'status', status, 'answer', answer,
      'created_at', created_at, 'answered_at', answered_at
    ) order by created_at desc), '[]'::jsonb)
  from public.tickets where user_id = auth.uid();
$$;

-- The inbox also tells when a message got an answer.
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
    ) all_items
    order by (item ->> 'at')::timestamptz desc
    limit 100
  ) latest;
$$;

-- 3. Sync. Deleted health records go up without their values; once health consent is
-- revoked, new health data from any phone is refused.
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
  no_health boolean;
  health_row boolean;
  gone boolean;
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
  no_health := coalesce((
    select not c.granted from public.consents c
    where c.user_id = uid and c.kind = 'saude'
    order by c.created_at desc, c.id desc limit 1), false);

  for ch in select value from jsonb_array_elements(changes) loop
    t := ch ->> 'table';
    r := ch -> 'row';
    if t is null or not (t = any (public.synced_tables())) or jsonb_typeof(r) <> 'object' then
      rejected := rejected || jsonb_build_object('table', t, 'id', r ->> 'id', 'error', 'tabela');
      continue;
    end if;
    health_row := t in ('body_logs', 'pain_reports')
      or (t = 'day_overrides' and r ->> 'action' = 'spare_joint');
    gone := coalesce(r ->> 'deleted', 'false') = 'true';
    if health_row and no_health and not gone then
      rejected := rejected || jsonb_build_object('table', t, 'id', r ->> 'id', 'error', 'saude');
      continue;
    end if;
    if health_row and gone then
      r := r || case t
        when 'body_logs' then '{"weight_kg": null, "waist_cm": null, "note": null}'::jsonb
        when 'pain_reports' then '{"joint": null}'::jsonb
        else '{"value": null}'::jsonb
      end;
    end if;
    if no_health and t = 'session_items' and r ? 'pain_joint' then
      r := r || '{"pain_joint": null}'::jsonb;
    end if;
    if no_health and t = 'profiles' and jsonb_typeof(r -> 'onboarding' -> 'spare_joints') = 'array' then
      r := jsonb_set(r, '{onboarding,spare_joints}', '[]'::jsonb);
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

-- 4. Retention. Deleted rows (tombstones) stay 30 days so every phone learns about the
-- deletion, then leave the server. horizon is the newest server_seq removed for a person:
-- a phone whose cursor is behind it missed deletions and asks for the list of ids.
create table public.sync_horizons (
  user_id uuid primary key references auth.users (id) on delete cascade,
  horizon bigint not null
);
alter table public.sync_horizons enable row level security;
create policy sync_horizons_owner_read on public.sync_horizons for select to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update, delete on public.sync_horizons from authenticated;

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
    'more', out_count >= least(greatest(max_rows, 1), 2000),
    'horizon', coalesce((select h.horizon from public.sync_horizons h where h.user_id = uid), 0)
  );
end;
$$;

-- Every id the server still has for the caller, by table.
create or replace function public.sync_ids()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  t text;
  ids jsonb;
  result jsonb := '{}'::jsonb;
begin
  if uid is null then
    raise exception 'Sem sessão' using errcode = '28000';
  end if;
  foreach t in array public.synced_tables() loop
    execute format(
      'select coalesce(jsonb_agg(x.id), ''[]''::jsonb) from public.%I x where x.user_id = $1', t)
      into ids using uid;
    result := result || jsonb_build_object(t, ids);
  end loop;
  return result;
end;
$$;

-- Daily cleanup (pg_cron, supabase/setup/retention.sql). Nothing personal is kept past
-- its use: tombstones after 30 days, rate-limit traces after a day, reminder marks after
-- a week, answered or expired invites after 30 days, the error log after 30 days.
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
  delete from public.client_errors where last_at < now() - interval '30 days';
  delete from public.push_jobs where created_at < now() - interval '2 days';
  return jsonb_build_object('tombstones', total);
end;
$$;

-- Privileges: nothing for anonymous users; internals for no one.
revoke execute on all functions in schema public from public, anon;
revoke all on all tables in schema public from anon;
revoke execute on function public.drop_health_data(uuid) from authenticated;
revoke execute on function public.purge_old_data() from authenticated;
grant execute on function public.record_consent(text, text, boolean) to authenticated;
grant execute on function public.consent_state() to authenticated;
grant execute on function public.consent_history() to authenticated;
grant execute on function public.create_ticket(text, text, text, text) to authenticated;
grant execute on function public.my_tickets() to authenticated;
grant execute on function public.inbox(timestamptz) to authenticated;
grant execute on function public.sync_push(jsonb) to authenticated;
grant execute on function public.sync_pull(bigint, integer) to authenticated;
grant execute on function public.sync_ids() to authenticated;
