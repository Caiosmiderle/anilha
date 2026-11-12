-- Anilha: reminders by web push. Opt-in, at most one per day, at the times the user set.
-- A scheduler (pg_cron, see supabase/setup/reminders_cron.sql) calls the send-reminders
-- edge function, which claims what is due here and sends it.

create table public.push_subscriptions (
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null check (char_length(endpoint) between 10 and 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now(),
  primary key (user_id, endpoint)
);
alter table public.push_subscriptions enable row level security;
create policy push_own on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- One row per user and day: the "at most one notification per day" rule lives here.
create table public.reminder_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  local_date date not null,
  kind text not null check (kind in ('treino', 'vespera_corrida')),
  sent_at timestamptz not null default now(),
  primary key (user_id, local_date)
);
alter table public.reminder_log enable row level security;

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := public.require_uid();
begin
  if (select count(*) from public.push_subscriptions where user_id = uid) >= 10 then
    delete from public.push_subscriptions where user_id = uid
      and created_at = (select min(created_at) from public.push_subscriptions where user_id = uid);
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values (uid, p_endpoint, p_p256dh, p_auth)
    on conflict (user_id, endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.push_subscriptions where user_id = public.require_uid() and endpoint = p_endpoint;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.split_label(p_key text)
returns text
language sql
immutable
as $$
  select case p_key
    when 'costas_biceps' then 'costas e bíceps'
    when 'peito_triceps' then 'peito e tríceps'
    when 'perna' then 'perna'
    when 'ombro_abdomen' then 'ombro e abdômen'
    when 'corpo_inteiro_a' then 'corpo inteiro A'
    when 'corpo_inteiro_b' then 'corpo inteiro B'
    when 'superior_a' then 'superior A'
    when 'superior_b' then 'superior B'
    when 'inferior_a' then 'inferior A'
    when 'inferior_b' then 'inferior B'
    when 'empurrar' then 'empurrar'
    when 'puxar' then 'puxar'
    else 'treino'
  end;
$$;

-- Claims reminders due at p_now (one per user and day) and returns them with the
-- subscriptions to notify. Service role only.
create or replace function public.claim_due_reminders(p_now timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb := '[]'::jsonb;
  r record;
  local_ts timestamp;
  local_day date;
  local_t time;
  dow integer;
  today_day jsonb;
  tomorrow_day jsonb;
  plan_days jsonb;
  gym_t time;
  eve_t time;
  kind text;
  title text;
  body text;
begin
  for r in
    select p.user_id, p.timezone, p.reminders
    from public.profiles p
    where not p.deleted and coalesce((p.reminders ->> 'enabled')::boolean, false)
      and exists (select 1 from public.push_subscriptions s where s.user_id = p.user_id)
  loop
    begin
      local_ts := p_now at time zone r.timezone;
    exception when others then
      local_ts := p_now at time zone 'America/Sao_Paulo';
    end;
    local_day := local_ts::date;
    local_t := local_ts::time;
    if exists (select 1 from public.reminder_log l where l.user_id = r.user_id and l.local_date = local_day) then
      continue;
    end if;
    select pl.days into plan_days from public.plans pl
      where pl.user_id = r.user_id and not pl.deleted and pl.active_from <= local_day
      order by pl.active_from desc, pl.updated_at desc limit 1;
    if plan_days is null then
      continue;
    end if;
    dow := extract(isodow from local_day)::integer - 1;
    today_day := plan_days -> dow;
    tomorrow_day := plan_days -> ((dow + 1) % 7);
    gym_t := coalesce(nullif(r.reminders ->> 'gym_time', ''), '05:30')::time;
    eve_t := coalesce(nullif(r.reminders ->> 'run_eve_time', ''), '21:00')::time;
    kind := null;

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

create or replace function public.drop_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;

-- VAPID keys and the cron secret live in Supabase Vault, never in the repository.
create or replace function public.get_push_config()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg jsonb;
begin
  execute $q$
    select jsonb_object_agg(name, decrypted_secret)
    from vault.decrypted_secrets
    where name in ('anilha_vapid_public', 'anilha_vapid_private', 'anilha_vapid_subject', 'anilha_cron_secret')
  $q$ into cfg;
  return coalesce(cfg, '{}'::jsonb);
end;
$$;

revoke execute on all functions in schema public from public, anon;
revoke execute on function public.claim_due_reminders(timestamptz) from authenticated;
revoke execute on function public.drop_push_subscription(text) from authenticated;
revoke execute on function public.get_push_config() from authenticated;
grant execute on function public.claim_due_reminders(timestamptz) to service_role;
grant execute on function public.drop_push_subscription(text) to service_role;
grant execute on function public.get_push_config() to service_role;
revoke all on all tables in schema public from anon;
