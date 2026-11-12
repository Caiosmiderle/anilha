-- Run once in production, after the LGPD migration (20261019000010_lgpd.sql).
-- Every day at 03:41 (UTC) the server drops what it no longer needs: deleted rows after
-- 30 days, rate-limit traces, old reminder marks, used or expired invites, the error log
-- after 30 days and the push queue after 2 days. See public.purge_old_data().
select cron.schedule('anilha-retencao', '41 3 * * *', 'select public.purge_old_data()');

-- Check: the job is there and its last runs succeeded.
-- select jobname, schedule, active from cron.job where jobname = 'anilha-retencao';
-- select status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'anilha-retencao')
--   order by start_time desc limit 5;
