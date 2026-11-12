-- Personal integration credentials never enter sync or the Data API.
alter table public.runs drop constraint runs_source_check;
alter table public.runs add constraint runs_source_check check (source in ('manual', 'import', 'crunning'));
alter table public.runs add column started_at bigint;
alter table public.runs add column strava_id text;
alter table public.runs add column source_type text;
alter table public.runs add column treadmill boolean;
alter table public.runs add column external_planned jsonb;
alter table public.runs add column crunning_updated_at timestamptz;

create table public.crunning_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  calls timestamptz[] not null default '{}'
);
create unique index crunning_one_active on public.crunning_tokens(user_id) where revoked_at is null;
alter table public.crunning_tokens enable row level security;
revoke all on public.crunning_tokens from public, anon, authenticated;

create table public.external_plan_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) <= 64),
  updated_at bigint not null,
  deleted boolean not null default false,
  server_seq bigint not null default 0,
  source text check (source = 'crunning'),
  kind text check (kind = 'corrida'),
  origin_id text check (length(origin_id) <= 55),
  local_date date,
  run_type text check (run_type in ('leve', 'longo', 'intervalado')),
  source_type text,
  name text check (length(name) <= 60),
  distance_m numeric check (distance_m > 0),
  duration_sec integer check (duration_sec > 0),
  important boolean,
  status text check (status in ('planejada', 'feita', 'perdida')),
  primary key (user_id, id),
  unique (user_id, source, origin_id)
);
create index external_plan_items_pull_idx on public.external_plan_items(user_id, server_seq);
create trigger external_plan_items_seq before insert or update on public.external_plan_items
for each row execute function public.touch_server_seq();
alter table public.external_plan_items enable row level security;
revoke all on public.external_plan_items from public, anon, authenticated;
grant select on public.external_plan_items to authenticated;
create policy external_plan_owner_read on public.external_plan_items for select to authenticated
using (user_id = (select auth.uid()));

create or replace function public.synced_tables() returns text[] language sql immutable set search_path = public as $$
select array['profiles','exercises','plans','routines','routine_items','sessions','session_items','sets',
 'runs','pain_reports','day_overrides','records','body_logs','external_plan_items'];
$$;

create function public.crunning_generate_token() returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); secret text;
begin
  if uid is null then raise exception 'Sem sessão' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtext(uid::text));
  -- First four bytes of eight cryptographic UUIDs: 32 random bytes, excluding fixed bits.
  select 'anl_' || rtrim(translate(encode(decode(string_agg(substr(gen_random_uuid()::text,1,8), ''), 'hex'), 'base64'), '+/', '-_'), '=')
    into secret from generate_series(1,8);
  update public.crunning_tokens set revoked_at = clock_timestamp() where user_id = uid and revoked_at is null;
  insert into public.crunning_tokens(user_id, token_hash) values (uid, encode(sha256(convert_to(secret,'UTF8')), 'hex'));
  return jsonb_build_object('token', secret);
end;
$$;
create function public.crunning_revoke_token() returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sem sessão' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtext(uid::text));
  update public.crunning_tokens set revoked_at = clock_timestamp() where user_id = uid and revoked_at is null;
end;
$$;
create function public.crunning_token_state() returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sem sessão' using errcode = '28000'; end if;
  return (select jsonb_build_object('created_at',created_at,'last_used_at',last_used_at,'revoked_at',revoked_at)
    from public.crunning_tokens where user_id = auth.uid() order by created_at desc, id desc limit 1);
end;
$$;
revoke all on function public.crunning_generate_token(), public.crunning_revoke_token(), public.crunning_token_state() from public, anon;
grant execute on function public.crunning_generate_token(), public.crunning_revoke_token(), public.crunning_token_state() to authenticated;

-- Only the Edge Function can call this API. It supplies a SHA-256, never an account id.
-- Authentication, revocation, sliding limit, and writes share the same transaction.
create function public.crunning_exchange(p_hash text, p_operation text, p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  credential public.crunning_tokens; uid uuid; item jsonb; n integer; accepted integer := 0;
  ignored integer := 0; removed integer := 0; rejected jsonb := '[]'; stamp bigint;
  moment timestamptz := clock_timestamp(); since bigint; cursor_seq bigint; result jsonb;
begin
  select user_id into uid from public.crunning_tokens where token_hash = p_hash and revoked_at is null;
  if uid is null then return '{"erro":"token"}'; end if;
  perform pg_advisory_xact_lock(hashtext(uid::text));
  select * into credential from public.crunning_tokens where token_hash = p_hash and revoked_at is null for update;
  if not found then return '{"erro":"token"}'; end if;
  credential.calls := array(select t from unnest(credential.calls) t where t > moment - interval '1 hour');
  if cardinality(credential.calls) >= 60 then return '{"erro":"limite"}'; end if;
  update public.crunning_tokens set calls = array_append(credential.calls, moment), last_used_at = moment where id = credential.id;
  stamp := floor(extract(epoch from moment)*1000)::bigint;

  if p_operation = 'corridas' then
    for item in select value from jsonb_array_elements(p_payload->'itens') loop
      begin
        -- A tombstone has no run data and must never insert a placeholder row.
        if item->'apagado' = 'true'::jsonb then
          update public.runs as old set deleted=true,
            updated_at=floor(extract(epoch from (item->>'atualizado_em')::timestamptz)*1000)::bigint,
            crunning_updated_at=(item->>'atualizado_em')::timestamptz
          where old.user_id=uid and old.id='crunning-'||(item->>'origem_id')
            and coalesce(old.crunning_updated_at,to_timestamp(old.updated_at/1000.0)) < (item->>'atualizado_em')::timestamptz;
        else
        insert into public.runs as old(user_id,id,updated_at,deleted,local_date,distance_km,duration_sec,run_type,rpe,source,external_id,activity,started_at,strava_id,source_type,treadmill,external_planned,crunning_updated_at)
        values(uid,'crunning-'||(item->>'origem_id'),floor(extract(epoch from (item->>'atualizado_em')::timestamptz)*1000)::bigint,
          coalesce((item->>'apagado')::boolean,false),(item->>'data_local')::date,round((item->>'distancia_m')::numeric/1000,2),
          (item->>'duracao_movimento_s')::integer,item->>'tipo',(item->>'esforco')::integer,'crunning','crunning:'||(item->>'origem_id'),null,
          floor(extract(epoch from (item->>'inicio')::timestamptz)*1000)::bigint,item->>'strava_id',item->>'tipo_origem',(item->>'esteira')::boolean,item->'planejado',(item->>'atualizado_em')::timestamptz)
        on conflict(user_id,id) do update set updated_at=excluded.updated_at,deleted=excluded.deleted,local_date=excluded.local_date,
          distance_km=excluded.distance_km,duration_sec=excluded.duration_sec,run_type=excluded.run_type,rpe=excluded.rpe,
          source=excluded.source,external_id=excluded.external_id,activity=null,started_at=excluded.started_at,strava_id=excluded.strava_id,
          source_type=excluded.source_type,treadmill=excluded.treadmill,external_planned=excluded.external_planned,crunning_updated_at=excluded.crunning_updated_at
        where coalesce(old.crunning_updated_at,to_timestamp(old.updated_at/1000.0)) < excluded.crunning_updated_at;
        end if;
        get diagnostics n = row_count;
        accepted := accepted+n; ignored := ignored+1-n;
      exception when others then
        rejected := rejected || jsonb_build_object('origem_id',item->>'origem_id','motivo','campos');
      end;
    end loop;
    return jsonb_build_object('aceitos',accepted,'ignorados',ignored,'rejeitados',rejected);
  elsif p_operation = 'planejados' then
    -- The v1 snapshot has no sender timestamp: serialize snapshots by receipt time.
    select greatest(stamp,coalesce(max(updated_at)+1,stamp)) into stamp from public.external_plan_items where user_id=uid;
    update public.external_plan_items set deleted=true,updated_at=stamp
      where user_id=uid and source='crunning' and not deleted and local_date between (p_payload->>'de')::date and (p_payload->>'ate')::date
        and origin_id not in (select value->>'origem_id' from jsonb_array_elements(p_payload->'itens'));
    get diagnostics removed = row_count;
    for item in select value from jsonb_array_elements(p_payload->'itens') loop
      insert into public.external_plan_items(user_id,id,updated_at,source,kind,origin_id,local_date,run_type,source_type,name,distance_m,duration_sec,important,status)
      values(uid,'crunning:'||(item->>'origem_id'),stamp,'crunning','corrida',item->>'origem_id',(item->>'data_local')::date,item->>'tipo',
        item->>'tipo_origem',item->>'nome',(item->>'distancia_m')::numeric,(item->>'duracao_s')::integer,(item->>'importante')::boolean,item->>'status')
      on conflict(user_id,id) do update set updated_at=excluded.updated_at,deleted=false,local_date=excluded.local_date,run_type=excluded.run_type,
        source_type=excluded.source_type,name=excluded.name,distance_m=excluded.distance_m,duration_sec=excluded.duration_sec,important=excluded.important,status=excluded.status;
      accepted := accepted+1;
    end loop;
    return jsonb_build_object('gravados',accepted,'apagados',removed);
  elsif p_operation = 'forca' then
    since := nullif(p_payload->>'desde','')::bigint;
    -- The cursor includes child edits. All writes for the account use this advisory lock.
    select coalesce(max(seq),0) into cursor_seq from (
      select server_seq seq from public.sessions where user_id=uid union all
      select server_seq from public.sets where user_id=uid union all
      select server_seq from public.session_items where user_id=uid union all
      select server_seq from public.exercises where user_id=uid
    ) q;
    select jsonb_build_object('cursor',greatest(cursor_seq,coalesce(since,0))::text,
      'today',coalesce((moment at time zone (select timezone from public.profiles where user_id=uid and not deleted limit 1))::date, moment::date),
      'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'updated_at',greatest(s.updated_at,
        (select max(updated_at) from public.sets where user_id=uid and session_id=s.id),
        (select max(updated_at) from public.session_items where user_id=uid and session_id=s.id),
        (select max(updated_at) from public.exercises where user_id=uid)),
        'partial',exists(select 1 from public.session_items where user_id=uid and session_id=s.id and not deleted and status in ('skipped','not_done','pending')),
        'deleted',s.deleted,'local_date',s.local_date,
        'started_at',s.started_at,'ended_at',s.ended_at,'status',s.status,'title',left(s.title,60),'split_key',s.split_key)) from public.sessions s where s.user_id=uid and s.status='done'), '[]'),
      'sets',coalesce((select jsonb_agg(jsonb_build_object('session_id',x.session_id,'exercise_id',x.exercise_id,'kind',x.kind,'completed_at',x.completed_at,'deleted',x.deleted)) from public.sets x where x.user_id=uid),'[]'),
      'exercises',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'primary_group',x.primary_group,'secondary_groups',x.secondary_groups,'muscles',x.muscles)) from public.exercises x where x.user_id=uid),'[]'),
      'plans',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'active_from',x.active_from,'updated_at',x.updated_at,'days',x.days,'rules',x.rules)) from public.plans x where x.user_id=uid and not x.deleted),'[]'),
      'routines',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',left(x.name,60),'split_key',x.split_key,'origin',x.origin)) from public.routines x where x.user_id=uid and not x.deleted and not x.archived),'[]'),
      'routine_items',coalesce((select jsonb_agg(jsonb_build_object('routine_id',x.routine_id,'exercise_id',x.exercise_id)) from public.routine_items x where x.user_id=uid and not x.deleted),'[]'),
      'overrides',coalesce((select jsonb_agg(jsonb_build_object('local_date',x.local_date,'action',x.action)) from public.day_overrides x where x.user_id=uid and not x.deleted and x.action in ('rest','run')),'[]'),
      'changed',coalesce((select jsonb_agg(s.id) from public.sessions s where s.user_id=uid and (since is null or s.server_seq>since
        or exists(select 1 from public.sets x where x.user_id=uid and x.session_id=s.id and x.server_seq>since)
        or exists(select 1 from public.session_items x where x.user_id=uid and x.session_id=s.id and x.server_seq>since)
        or exists(select 1 from public.exercises x where x.user_id=uid and x.server_seq>since))),'[]')) into result;
    return result;
  end if;
  return jsonb_build_object('erro',case when p_operation='invalid' then coalesce(p_payload->>'erro','campos') else 'campos' end);
end;
$$;
revoke all on function public.crunning_exchange(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.crunning_exchange(text,text,jsonb) to service_role;
