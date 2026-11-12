-- Waltér, the training assistant, open to everyone with an account (09/11/2026, Caio).
-- Same daily limit of 60 calls per person (one request takes two or three); the cost and
-- abuse guard stays per user. Admins no longer have a separate beta gate.

create or replace function public.agent_begin_turn()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_uid();
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  used int;
begin
  insert into public.agent_usage (user_id, day, messages) values (uid, today, 1)
  on conflict (user_id, day) do update set messages = public.agent_usage.messages + 1
  returning messages into used;
  if used > 60 then
    raise exception 'Limite de mensagens de hoje' using errcode = 'P0001', hint = 'limite';
  end if;
  return jsonb_build_object('left', 60 - used);
end;
$$;
