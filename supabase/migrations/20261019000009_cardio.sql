-- Cardio besides running: walk, bike, elliptical, swim, rower, stairs and other, in the
-- runs table (it syncs and counts in the week like a run). Old rows have no activity:
-- they are runs. Distance is optional except for a run.

alter table public.runs add column activity text
  check (activity in ('caminhada', 'bike', 'eliptico', 'natacao', 'remo', 'escada', 'outro'));
alter table public.runs alter column distance_km drop not null;
alter table public.runs add constraint runs_run_has_distance
  check (activity is not null or distance_km is not null);

-- Week counts (friends and groups): every run, and other cardio only while it fills a
-- cardio day of the plan; past that it is a bonus, not a deviation. Same rule as the app.
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
  ), cardio as (
    select count(*) filter (where r.activity is null)::integer as runs,
           count(*) filter (where r.activity is not null)::integer as others
    from public.runs r
    where r.user_id = p_user and not r.deleted
      and r.local_date between p_week_start and p_week_start + 6
  )
  select
    coalesce((select gym_per_week from plan), 0),
    coalesce((select run_per_week from plan), 0),
    (select count(*)::integer from public.sessions s
      where s.user_id = p_user and not s.deleted and s.status = 'done'
        and s.local_date between p_week_start and p_week_start + 6),
    (select c.runs + least(c.others, greatest(coalesce((select run_per_week from plan), 0) - c.runs, 0))
      from cardio c);
$$;

-- What friends see in the feed and in a reaction push.
create or replace function public.cardio_title(p_activity text, p_run_type text)
returns text
language sql
immutable
set search_path = public
as $$
  select case coalesce(p_activity, 'corrida')
    when 'corrida' then case p_run_type when 'longo' then 'Corrida longa'
      when 'intervalado' then 'Corrida intervalada' else 'Corrida leve' end
    when 'caminhada' then 'Caminhada'
    when 'bike' then 'Bike'
    when 'eliptico' then 'Elíptico'
    when 'natacao' then 'Natação'
    when 'remo' then 'Remo'
    when 'escada' then 'Escada'
    else 'Cardio' end;
$$;

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
            'title', public.cardio_title(r.activity, r.run_type),
            'activity', coalesce(r.activity, 'corrida'),
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

create or replace function public.push_on_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  what text := 'no seu treino';
  act text;
begin
  if new.target_kind = 'run' then
    select coalesce(activity, 'corrida') into act from public.runs
      where user_id = new.owner and id = new.target_id;
    what := case coalesce(act, 'corrida')
      when 'corrida' then 'na sua corrida'
      when 'caminhada' then 'na sua caminhada'
      when 'bike' then 'na sua bike'
      when 'eliptico' then 'no seu elíptico'
      when 'natacao' then 'na sua natação'
      when 'remo' then 'no seu remo'
      when 'escada' then 'na sua escada'
      else 'no seu cardio' end;
  end if;
  perform public.queue_social_push(
    new.owner, 'reacao',
    public.display_name_of(new.actor) || ' mandou um boa ' || what || '.',
    '/avisos');
  return null;
end;
$$;

revoke execute on all functions in schema public from public, anon;
revoke all on all tables in schema public from anon;
revoke execute on function public.push_on_reaction() from authenticated;
revoke execute on function public.week_counts(uuid, date) from authenticated;
