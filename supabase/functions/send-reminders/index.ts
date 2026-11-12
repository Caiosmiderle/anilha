// Supabase Edge Function (Deno). Two callers, both with the cron secret:
// - pg_cron every 15 minutes, body {}: claims due training reminders (at most one per
//   user and day) and sends them.
// - the push dispatcher every few seconds, body {"jobs": true}, only when something is
//   due: claims the queue (end of rest, friends' activity) and sends it.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

interface Due {
  endpoint: string;
  p256dh: string;
  auth: string;
  title: string;
  body: string;
  url: string;
  tag?: string;
}

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );
  const { data: cfg, error: cfgError } = await supabase.rpc('get_push_config');
  if (cfgError || !cfg?.anilha_cron_secret)
    return new Response('sem configuração', { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${cfg.anilha_cron_secret}`) {
    return new Response('proibido', { status: 403 });
  }
  webpush.setVapidDetails(
    cfg.anilha_vapid_subject ?? 'mailto:contato@anilha.app',
    cfg.anilha_vapid_public,
    cfg.anilha_vapid_private,
  );

  let jobs = false;
  try {
    jobs = Boolean((await req.json())?.jobs);
  } catch {
    jobs = false;
  }
  const { data: due, error } = jobs
    ? await supabase.rpc('claim_push_jobs', { p_now: new Date().toISOString() })
    : await supabase.rpc('claim_due_reminders', { p_now: new Date().toISOString() });
  if (error) return new Response(error.message, { status: 500 });

  let sent = 0;
  for (const r of (due ?? []) as Due[]) {
    try {
      await webpush.sendNotification(
        { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
        JSON.stringify({ title: r.title, body: r.body, url: r.url, tag: r.tag }),
        // The end of a rest is worthless a few minutes later.
        { TTL: jobs ? 300 : 3600, urgency: jobs ? 'high' : 'normal' },
      );
      sent += 1;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await supabase.rpc('drop_push_subscription', { p_endpoint: r.endpoint });
      }
    }
  }
  return Response.json({ mode: jobs ? 'fila' : 'lembretes', due: (due ?? []).length, sent });
});
