-- Direct invites to a group, from a member to a friend, and the inbox of the app:
-- reactions, group invites, a friend who used your invite, a friend who joined your group.

create table public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  inviter uuid not null references auth.users (id) on delete cascade,
  invitee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  check (inviter <> invitee)
);
-- One open invite per person and group; answered ones stay as history.
create unique index group_invites_open_idx on public.group_invites (group_id, invitee)
  where status = 'pending';
create index group_invites_invitee_idx on public.group_invites (invitee, created_at);
create index group_invites_inviter_idx on public.group_invites (inviter, created_at);

-- RLS on and no policy: only the functions below read or write it.
alter table public.group_invites enable row level security;

-- Friends of the caller with their state in the group: member, invited or free.
create or replace function public.group_invite_candidates(p_group uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_uid();
begin
  if not exists (select 1 from public.group_members where group_id = p_group and user_id = uid) then
    return jsonb_build_object('error', 'nao_membro');
  end if;
  return jsonb_build_object('friends', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', f.friend,
      'name', public.display_name_of(f.friend),
      'state', case
        when exists (select 1 from public.group_members m
                     where m.group_id = p_group and m.user_id = f.friend) then 'membro'
        when exists (select 1 from public.group_invites i
                     where i.group_id = p_group and i.invitee = f.friend
                       and i.status = 'pending') then 'convidado'
        else 'livre'
      end
    ) order by public.display_name_of(f.friend))
    from (
      select case when user_a = uid then user_b else user_a end as friend
      from public.friendships
      where user_a = uid or user_b = uid
    ) f
    where not public.blocked_between(uid, f.friend)
  ), '[]'::jsonb));
end;
$$;

create or replace function public.invite_to_group(p_group uuid, p_friend uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_uid();
begin
  if not exists (select 1 from public.group_members where group_id = p_group and user_id = uid) then
    return jsonb_build_object('error', 'nao_membro');
  end if;
  if not public.are_friends(uid, p_friend) then
    return jsonb_build_object('error', 'nao_amigo');
  end if;
  if exists (select 1 from public.group_members where group_id = p_group and user_id = p_friend) then
    return jsonb_build_object('error', 'ja_membro');
  end if;
  if (select count(*) from public.group_members where group_id = p_group) >= 50 then
    return jsonb_build_object('error', 'cheio');
  end if;
  if (select count(*) from public.group_invites
      where inviter = uid and created_at > now() - interval '1 day') >= 30 then
    return jsonb_build_object('error', 'limite');
  end if;
  insert into public.group_invites (group_id, inviter, invitee)
    values (p_group, uid, p_friend)
    on conflict (group_id, invitee) where status = 'pending' do nothing;
  return jsonb_build_object('ok', true, 'name', public.display_name_of(p_friend));
end;
$$;

create or replace function public.answer_group_invite(p_invite uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.require_uid();
  inv public.group_invites;
  gname text;
begin
  select * into inv from public.group_invites
    where id = p_invite and invitee = uid and status = 'pending'
    for update;
  if not found then
    return jsonb_build_object('error', 'invalido');
  end if;
  select name into gname from public.groups where id = inv.group_id;
  if p_accept then
    if (select count(*) from public.group_members where group_id = inv.group_id) >= 50 then
      return jsonb_build_object('error', 'cheio');
    end if;
    insert into public.group_members (group_id, user_id) values (inv.group_id, uid)
      on conflict do nothing;
  end if;
  update public.group_invites
    set status = case when p_accept then 'accepted' else 'declined' end, answered_at = now()
    where id = inv.id;
  return jsonb_build_object('ok', true, 'group_id', inv.group_id, 'name', gname);
end;
$$;

-- Everything that happened to the caller since a date, newest first, at most 100.
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
    ) all_items
    order by (item ->> 'at')::timestamptz desc
    limit 100
  ) latest;
$$;

revoke execute on all functions in schema public from public, anon;
revoke all on all tables in schema public from anon;
grant execute on function public.group_invite_candidates(uuid) to authenticated;
grant execute on function public.invite_to_group(uuid, uuid) to authenticated;
grant execute on function public.answer_group_invite(uuid, boolean) to authenticated;
grant execute on function public.inbox(timestamptz) to authenticated;
