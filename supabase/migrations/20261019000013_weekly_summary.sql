-- Weekly summary by notification: Sunday at 20:00 (the person's time zone), the week done
-- against the plan. It has its own slot in the reminder log, so it never takes the place
-- of the training reminder (still at most one a day). On by default for whoever turned the
-- training reminder on; its own switch in Ajustes (reminders.weekly).

alter table public.reminder_log drop constraint reminder_log_kind_check;
alter table public.reminder_log add constraint reminder_log_kind_check
  check (kind in ('treino', 'vespera_corrida', 'semana'));
alter table public.reminder_log drop constraint reminder_log_pkey;
alter table public.reminder_log add primary key (user_id, local_date, kind);

create or replace function public.claim_due_reminders(p_now timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb := '[]'::jsonb;
  r record;
  wk record;
  local_ts timestamp;
  local_day date;
  local_t time;
  dow integer;
  today_day jsonb;
  tomorrow_day jsonb;
  plan_days jsonb;
  gym_t time;
  eve_t time;
  week_t constant time := '20:00';
  daily_on boolean;
  weekly_on boolean;
  parts text[];
  kind text;
  title text;
  body text;
begin
  for r in
    select p.user_id, p.timezone, p.reminders
    from public.profiles p
    where not p.deleted
      and (coalesce((p.reminders ->> 'enabled')::boolean, false)
           or coalesce((p.reminders ->> 'weekly')::boolean, false))
      and exists (select 1 from public.push_subscriptions s where s.user_id = p.user_id)
  loop
    begin
      local_ts := p_now at time zone r.timezone;
    exception when others then
      local_ts := p_now at time zone 'America/Sao_Paulo';
    end;
    local_day := local_ts::date;
    local_t := local_ts::time;
    daily_on := coalesce((r.reminders ->> 'enabled')::boolean, false);
    weekly_on := coalesce((r.reminders ->> 'weekly')::boolean, daily_on);
    select pl.days into plan_days from public.plans pl
      where pl.user_id = r.user_id and not pl.deleted and pl.active_from <= local_day
      order by pl.active_from desc, pl.updated_at desc limit 1;
    if plan_days is null then
      continue;
    end if;
    dow := extract(isodow from local_day)::integer - 1;
    kind := null;

    -- The training reminder, at most one a day: workout today or run tomorrow.
    if daily_on and not exists (
      select 1 from public.reminder_log l
      where l.user_id = r.user_id and l.local_date = local_day
        and l.kind in ('treino', 'vespera_corrida')
    ) then
      today_day := plan_days -> dow;
      tomorrow_day := plan_days -> ((dow + 1) % 7);
      gym_t := coalesce(nullif(r.reminders ->> 'gym_time', ''), '05:30')::time;
      eve_t := coalesce(nullif(r.reminders ->> 'run_eve_time', ''), '21:00')::time;
      if today_day ->> 'kind' = 'gym'
         and local_t >= gym_t and local_t < gym_t + interval '20 minutes'
         and not exists (select 1 from public.sessions s where s.user_id = r.user_id and not s.deleted
                         and s.local_date = local_day and s.status = 'done')
         and not exists (select 1 from public.day_overrides o where o.user_id = r.user_id and not o.deleted
                         and o.local_date = local_day and o.action = 'rest') then
        kind := 'treino';
        title := 'Treino de hoje';
        body := format('Hoje tem %s às %s.', public.split_label(today_day ->> 'split_key'), today_day ->> 'time');
      elsif tomorrow_day ->> 'kind' = 'run'
         and local_t >= eve_t and local_t < eve_t + interval '20 minutes' then
        kind := 'vespera_corrida';
        title := 'Corrida amanhã';
        body := format('Amanhã tem corrida às %s. Deixe a roupa separada.', tomorrow_day ->> 'time');
      end if;
    end if;

    -- Sunday evening: the week done against the plan.
    if kind is null and weekly_on and dow = 6
       and local_t >= week_t and local_t < week_t + interval '20 minutes'
       and not exists (select 1 from public.reminder_log l
                       where l.user_id = r.user_id and l.local_date = local_day and l.kind = 'semana') then
      select * into wk from public.week_counts(r.user_id, local_day - 6);
      if wk.planned_gym + wk.planned_run > 0 then
        parts := array[]::text[];
        if wk.planned_gym > 0 then
          parts := parts || format('%s de %s %s', wk.done_gym, wk.planned_gym,
                                   case when wk.planned_gym = 1 then 'treino' else 'treinos' end);
        end if;
        if wk.planned_run > 0 then
          parts := parts || format('%s de %s %s', wk.done_run, wk.planned_run,
                                   case when wk.planned_run = 1 then 'corrida' else 'corridas' end);
        end if;
        kind := 'semana';
        if wk.done_gym + wk.done_run = 0 then
          title := 'Uma semana nova amanhã';
          body := 'Nenhum treino registrado nesta semana. Veja o plano da próxima.';
        elsif wk.done_gym >= wk.planned_gym and wk.done_run >= wk.planned_run then
          title := 'Semana fechada';
          body := 'Você fez ' || array_to_string(parts, ' e ') || '. Veja o resumo.';
        else
          title := 'Resumo da semana';
          body := 'Você fez ' || array_to_string(parts, ' e ') || '. Veja o resumo e o foco da próxima.';
        end if;
      end if;
    end if;

    if kind is not null then
      insert into public.reminder_log (user_id, local_date, kind) values (r.user_id, local_day, kind)
        on conflict do nothing;
      if found then
        result := result || coalesce((
          select jsonb_agg(jsonb_build_object(
            'user_id', s.user_id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
            'title', title, 'body', body, 'url', '/', 'kind', kind, 'local_date', local_day))
          from public.push_subscriptions s where s.user_id = r.user_id
        ), '[]'::jsonb);
      end if;
    end if;
  end loop;
  return result;
end;
$$;

revoke execute on all functions in schema public from public, anon;
revoke all on all tables in schema public from anon;
revoke execute on function public.claim_due_reminders(timestamptz) from authenticated;
