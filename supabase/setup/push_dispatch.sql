-- Run once in production, after reminders_cron.sql and the push_jobs migration.
-- Every 5 seconds pg_cron checks the notification queue; the edge function is called
-- only when something is due, so idle seconds cost one cheap query.
create or replace function public.dispatch_push_jobs()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.push_jobs where sent_at is null and due_at <= now()) then
    perform net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'anilha_project_url')
        || '/functions/v1/send-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anilha_cron_secret')
      ),
      body := '{"jobs": true}'::jsonb
    );
  end if;
end;
$$;
revoke execute on function public.dispatch_push_jobs() from public, anon, authenticated;

select cron.schedule('anilha-avisos', '5 seconds', 'select public.dispatch_push_jobs()');

-- pg_cron logs every run; keep two days of it.
select cron.schedule(
  'anilha-limpa-cron',
  '17 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '2 days'$$
);
