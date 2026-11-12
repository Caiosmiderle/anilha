-- Run once in the Supabase SQL editor after deploying the send-reminders function.
-- Replace the three values in angle brackets. Secrets go to Vault, never to the repository.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('<URL DO PROJETO, ex.: https://abcd.supabase.co>', 'anilha_project_url');
select vault.create_secret('<SEGREDO ALEATORIO LONGO>', 'anilha_cron_secret');
select vault.create_secret('<VAPID PUBLIC KEY>', 'anilha_vapid_public');
select vault.create_secret('<VAPID PRIVATE KEY>', 'anilha_vapid_private');
select vault.create_secret('mailto:voce@email.com', 'anilha_vapid_subject');

select cron.schedule(
  'anilha-lembretes',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'anilha_project_url') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anilha_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
