-- Announcements with an audience: everyone, or only who set up a plan and never trained.
-- One day after launch, 7 of 8 accounts had a plan and 2 had trained: the panel needs a way
-- to speak to the other 5 without bothering who already trains.

alter table public.announcements
  add column audience text not null default 'todos'
  check (audience in ('todos', 'sem_treino'));

-- Never finished a workout nor logged a run or cardio.
create or replace function public.never_trained(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
      select 1 from public.sessions s
      where s.user_id = p_user and s.status = 'done' and not s.deleted)
    and not exists (
      select 1 from public.runs r where r.user_id = p_user and not r.deleted);
$$;

-- How many accounts an audience reaches now.
create or replace function public.admin_audience_size(p_audience text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return (
    select count(*)::integer from auth.users u
    where coalesce(p_audience, 'todos') = 'todos' or public.never_trained(u.id)
  );
end;
$$;

drop function public.admin_announce(text, text, text, boolean);

create or replace function public.admin_announce(
  p_title text,
  p_body text,
  p_url text,
  p_push boolean,
  p_audience text default 'todos'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_admin();
  t text := btrim(coalesce(p_title, ''));
  b text := btrim(coalesce(p_body, ''));
  u text := nullif(btrim(coalesce(p_url, '')), '');
  aud text := coalesce(p_audience, 'todos');
  new_id uuid;
begin
  if char_length(t) not between 1 and 80 or char_length(b) not between 1 and 500 then
    raise exception 'Título de até 80 e texto de até 500 caracteres' using errcode = '22023';
  end if;
  if u is not null and u !~ '^/[A-Za-z0-9/_-]*$' then
    raise exception 'O link é uma tela do app, como /plano' using errcode = '22023';
  end if;
  if aud not in ('todos', 'sem_treino') then
    raise exception 'Público inválido' using errcode = '22023';
  end if;
  insert into public.announcements (title, body, url, created_by, audience)
    values (t, b, u, uid, aud) returning id into new_id;
  -- Also by notification, to whoever of the audience has notifications on.
  if coalesce(p_push, false) then
    perform public.queue_social_push(s.user_id, 'aviso', t || ': ' || left(b, 140), coalesce(u, '/avisos'))
      from (select distinct user_id from public.push_subscriptions) s
      where aud = 'todos' or public.never_trained(s.user_id);
  end if;
  return jsonb_build_object('id', new_id);
end;
$$;

create or replace function public.admin_announcements()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'title', a.title, 'body', a.body, 'url', a.url,
        'created_at', a.created_at, 'audience', a.audience
      ) order by a.created_at desc), '[]'::jsonb)
    from public.announcements a
  );
end;
$$;

-- The inbox: an announcement for who never trained reaches only them, and leaves the inbox
-- once they train.
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
    ) all_items
    order by (item ->> 'at')::timestamptz desc
    limit 100
  ) latest;
$$;

revoke execute on all functions in schema public from public, anon;
-- Internal: it says whether any account trained, so only server functions call it.
revoke execute on function public.never_trained(uuid) from authenticated;
grant execute on function public.admin_audience_size(text) to authenticated;
grant execute on function public.admin_announce(text, text, text, boolean, text) to authenticated;
grant execute on function public.admin_announcements() to authenticated;
grant execute on function public.inbox(timestamptz) to authenticated;
