-- The strength snapshot carries the detail of each changed session (exercise, load, reps,
-- seconds, order) and of the planned fichas (sets and rep range), for CRUNNING's own screen.
-- Only the sets of sessions that changed since the cursor travel.
create or replace function public.crunning_exchange(p_hash text, p_operation text, p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  credential public.crunning_tokens; uid uuid; item jsonb; n integer; accepted integer := 0;
  ignored integer := 0; removed integer := 0; rejected jsonb := '[]'; stamp bigint;
  moment timestamptz := clock_timestamp(); since bigint; cursor_seq bigint; result jsonb; changed_ids text[];
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
    -- Sessions that changed since the cursor: only their sets and items travel.
    select coalesce(array_agg(s.id),'{}') into changed_ids from public.sessions s where s.user_id=uid and (since is null or s.server_seq>since
      or exists(select 1 from public.sets x where x.user_id=uid and x.session_id=s.id and x.server_seq>since)
      or exists(select 1 from public.session_items x where x.user_id=uid and x.session_id=s.id and x.server_seq>since)
      or exists(select 1 from public.exercises x where x.user_id=uid and x.server_seq>since));
    select jsonb_build_object('cursor',greatest(cursor_seq,coalesce(since,0))::text,
      'today',coalesce((moment at time zone (select timezone from public.profiles where user_id=uid and not deleted limit 1))::date, moment::date),
      'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'updated_at',greatest(s.updated_at,
        (select max(updated_at) from public.sets where user_id=uid and session_id=s.id),
        (select max(updated_at) from public.session_items where user_id=uid and session_id=s.id),
        (select max(updated_at) from public.exercises where user_id=uid)),
        'partial',exists(select 1 from public.session_items where user_id=uid and session_id=s.id and not deleted and status in ('skipped','not_done','pending')),
        'deleted',s.deleted,'local_date',s.local_date,
        'started_at',s.started_at,'ended_at',s.ended_at,'status',s.status,'title',left(s.title,60),'split_key',s.split_key)) from public.sessions s where s.user_id=uid and s.status='done'), '[]'),
      'sets',coalesce((select jsonb_agg(jsonb_build_object('session_id',x.session_id,'item_id',x.item_id,'exercise_id',x.exercise_id,'position',x.position,'kind',x.kind,
        'load_kg',x.load_kg,'reps',x.reps,'seconds',x.seconds,'completed_at',x.completed_at,'deleted',x.deleted)) from public.sets x where x.user_id=uid and x.session_id = any(changed_ids)),'[]'),
      'session_items',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'session_id',x.session_id,'position',x.position,'deleted',x.deleted)) from public.session_items x where x.user_id=uid and x.session_id = any(changed_ids)),'[]'),
      'exercises',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',left(x.name,60),'primary_group',x.primary_group,'secondary_groups',x.secondary_groups,'muscles',x.muscles)) from public.exercises x where x.user_id=uid),'[]'),
      'plans',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'active_from',x.active_from,'updated_at',x.updated_at,'days',x.days,'rules',x.rules)) from public.plans x where x.user_id=uid and not x.deleted),'[]'),
      'routines',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',left(x.name,60),'split_key',x.split_key,'origin',x.origin)) from public.routines x where x.user_id=uid and not x.deleted and not x.archived),'[]'),
      'routine_items',coalesce((select jsonb_agg(jsonb_build_object('routine_id',x.routine_id,'exercise_id',x.exercise_id,'position',x.position,'sets',x.sets,'target_min',x.target_min,'target_max',x.target_max)) from public.routine_items x where x.user_id=uid and not x.deleted),'[]'),
      'overrides',coalesce((select jsonb_agg(jsonb_build_object('local_date',x.local_date,'action',x.action)) from public.day_overrides x where x.user_id=uid and not x.deleted and x.action in ('rest','run')),'[]'),
      'external_plans',coalesce((select jsonb_agg(jsonb_build_object('deleted',x.deleted,'source',x.source,'kind',x.kind,'local_date',x.local_date,'status',x.status,'important',x.important)) from public.external_plan_items x where x.user_id=uid and not x.deleted and x.local_date >= (moment at time zone 'UTC')::date - 2),'[]'),
      'changed',to_jsonb(changed_ids)) into result;
    return result;
  end if;
  return jsonb_build_object('erro',case when p_operation='invalid' then coalesce(p_payload->>'erro','campos') else 'campos' end);
end;
$$;
revoke all on function public.crunning_exchange(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.crunning_exchange(text,text,jsonb) to service_role;
