-- The training assistant (the agent). In test with the team first: only admins talk to it.
-- The conversation stays on the phone; here only the usage per day (cost and abuse) and a
-- one-line summary of each request, the queue the team works from: what the assistant
-- solved with the generator, by hand, or could not do yet.

create table public.agent_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  messages int not null default 0,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  primary key (user_id, day)
);
alter table public.agent_usage enable row level security;
revoke all on public.agent_usage from authenticated, anon;

-- nivel: 0 a conversation with no tool, 1 the generator solved it, 2 solved by hand with the
-- generator checking (a missing option in the generator), 3 nothing solved it.
create table public.agent_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  pedido text not null check (char_length(pedido) <= 300),
  categoria text not null check (char_length(categoria) <= 40),
  nivel smallint not null check (nivel between 0 and 3),
  resultado text not null
    check (resultado in ('proposto', 'salvo', 'recusado', 'ja_existia', 'nao_consegui', 'conversa')),
  avisos int not null default 0 check (avisos between 0 and 20),
  status text not null default 'novo' check (status in ('novo', 'planejado', 'feito', 'nao_vamos')),
  status_at timestamptz
);
alter table public.agent_requests enable row level security;
revoke all on public.agent_requests from authenticated, anon;
create index agent_requests_created on public.agent_requests (created_at desc);
create index agent_requests_user on public.agent_requests (user_id, status);

-- Each call to the model: the beta check and today's limit (calls, not conversations: one
-- request takes two or three).
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
  if not exists (select 1 from public.admins a where a.user_id = uid) then
    raise exception 'O assistente ainda está em teste' using errcode = '42501';
  end if;
  insert into public.agent_usage (user_id, day, messages) values (uid, today, 1)
  on conflict (user_id, day) do update set messages = public.agent_usage.messages + 1
  returning messages into used;
  if used > 60 then
    raise exception 'Limite de mensagens de hoje' using errcode = 'P0001', hint = 'limite';
  end if;
  return jsonb_build_object('left', 60 - used);
end;
$$;

create or replace function public.agent_end_turn(p_input int, p_output int)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.agent_usage
     set input_tokens = input_tokens + greatest(0, p_input),
         output_tokens = output_tokens + greatest(0, p_output)
   where user_id = auth.uid() and day = (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- One line per request, written by the phone when the assistant answers.
create or replace function public.agent_log_request(
  p_pedido text, p_categoria text, p_nivel int, p_resultado text, p_avisos int
)
returns uuid
language sql
volatile
security definer
set search_path = public
as $$
  insert into public.agent_requests (user_id, pedido, categoria, nivel, resultado, avisos)
  values (
    public.require_uid(), left(p_pedido, 300), left(p_categoria, 40), p_nivel, p_resultado,
    least(greatest(p_avisos, 0), 20)
  )
  returning id;
$$;

-- Saved or declined: the proposal's fate.
create or replace function public.agent_set_result(p_id uuid, p_resultado text)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.agent_requests set resultado = p_resultado
   where id = p_id and user_id = auth.uid();
$$;

-- Management panel: the queue, newest first.
create or replace function public.admin_agent_requests()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', q.id, 'at', q.created_at, 'name', public.display_name_of(q.user_id),
      'pedido', q.pedido, 'categoria', q.categoria, 'nivel', q.nivel,
      'resultado', q.resultado, 'avisos', q.avisos, 'status', q.status
    ) order by q.created_at desc)
    from (select * from public.agent_requests order by created_at desc limit 500) q
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_agent_request_status(p_id uuid, p_status text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  update public.agent_requests set status = p_status, status_at = now() where id = p_id;
end;
$$;

-- The inbox gets one more kind: what you asked the assistant is now in the app.
create or replace function public.inbox(p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(item order by (item ->> 'at')::timestamptz desc), '[]'::jsonb)
  from (
    select item from (
      -- A friend reacted to a workout or a run.
      select jsonb_build_object(
        'kind', 'reaction', 'at', r.created_at, 'actor_id', r.actor,
        'actor_name', public.display_name_of(r.actor),
        'target_kind', r.target_kind, 'target_id', r.target_id
      ) as item
      from public.reactions r
      where r.owner = auth.uid() and r.created_at >= p_since
        and public.are_friends(r.actor, r.owner)
      union all
      -- An invite to a group: open ones can be answered here.
      select jsonb_build_object(
        'kind', 'group_invite', 'at', i.created_at, 'id', i.id, 'status', i.status,
        'actor_id', i.inviter, 'actor_name', public.display_name_of(i.inviter),
        'group_id', i.group_id, 'group_name', g.name
      )
      from public.group_invites i
      join public.groups g on g.id = i.group_id
      where i.invitee = auth.uid()
        and (i.status = 'pending' or i.created_at >= p_since)
        and not public.blocked_between(i.inviter, i.invitee)
      union all
      -- A friend you invited to a group joined it.
      select jsonb_build_object(
        'kind', 'group_joined', 'at', i.answered_at,
        'actor_id', i.invitee, 'actor_name', public.display_name_of(i.invitee),
        'group_id', i.group_id, 'group_name', g.name
      )
      from public.group_invites i
      join public.groups g on g.id = i.group_id
      where i.inviter = auth.uid() and i.status = 'accepted' and i.answered_at >= p_since
      union all
      -- Someone used your friend invite.
      select jsonb_build_object(
        'kind', 'friend', 'at', v.used_at,
        'actor_id', v.used_by, 'actor_name', public.display_name_of(v.used_by)
      )
      from public.invites v
      where v.inviter = auth.uid() and v.used_by is not null and v.used_at >= p_since
        and public.are_friends(v.inviter, v.used_by)
      union all
      -- Your message got an answer.
      select jsonb_build_object(
        'kind', 'ticket_answer', 'at', t.answered_at, 'id', t.id, 'ticket_kind', t.kind
      )
      from public.tickets t
      where t.user_id = auth.uid() and t.status = 'respondido' and t.answered_at >= p_since
      union all
      -- A ficha sent to you: open ones can be answered here.
      select jsonb_build_object(
        'kind', 'routine', 'at', s.created_at, 'id', s.id, 'status', s.status,
        'actor_id', case when s.from_team then null else s.sender end,
        'actor_name', case when s.from_team then 'Anilha' else public.display_name_of(s.sender) end,
        'name', s.name, 'from_team', s.from_team
      )
      from public.shared_routines s
      where s.recipient = auth.uid()
        and (s.status = 'pending' or s.created_at >= p_since)
        and (s.from_team or not public.blocked_between(s.sender, s.recipient))
      union all
      -- A friend added a ficha you sent.
      select jsonb_build_object(
        'kind', 'routine_accepted', 'at', s.answered_at, 'id', s.id,
        'actor_id', s.recipient, 'actor_name', public.display_name_of(s.recipient),
        'name', s.name
      )
      from public.shared_routines s
      where s.sender = auth.uid() and not s.from_team and s.status = 'accepted'
        and s.answered_at >= p_since
      union all
      -- News from the team, after this account was created.
      select jsonb_build_object(
        'kind', 'announcement', 'at', a.created_at, 'id', a.id,
        'title', a.title, 'body', a.body, 'url', a.url
      )
      from public.announcements a
      where a.created_at >= p_since
        and a.created_at >= (select u.created_at - interval '1 day' from auth.users u where u.id = auth.uid())
        and (a.audience = 'todos' or public.never_trained(auth.uid()))
      union all
      -- What you asked the assistant and it could not do: now the app does it.
      select jsonb_build_object(
        'kind', 'agent_done', 'at', q.status_at, 'id', q.id, 'pedido', q.pedido
      )
      from public.agent_requests q
      where q.user_id = auth.uid() and q.status = 'feito' and q.status_at >= p_since
    ) all_items
    order by (item ->> 'at')::timestamptz desc
    limit 100
  ) latest;
$$;

revoke execute on all functions in schema public from public, anon;
revoke execute on function public.never_trained(uuid) from authenticated;
grant execute on function public.agent_begin_turn() to authenticated;
grant execute on function public.agent_end_turn(int, int) to authenticated;
grant execute on function public.agent_log_request(text, text, int, text, int) to authenticated;
grant execute on function public.agent_set_result(uuid, text) to authenticated;
grant execute on function public.admin_agent_requests() to authenticated;
grant execute on function public.admin_agent_request_status(uuid, text) to authenticated;
grant execute on function public.inbox(timestamptz) to authenticated;
