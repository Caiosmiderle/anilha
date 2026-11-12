-- Anilha: friends, groups, reactions and the row level security that protects them.
-- Privacy lives here, not in the interface: detail tables (sessions, items, sets, runs,
-- exercises) are readable by a friend only when the owner turned on share_details.

create table public.friendships (
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index friendships_b_idx on public.friendships (user_b);

create table public.blocks (
  blocker uuid not null references auth.users (id) on delete cascade,
  blocked uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
create index blocks_blocked_idx on public.blocks (blocked);

create table public.invites (
  code text primary key check (code ~ '^[A-Z0-9]{8}$'),
  inviter uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz
);
create index invites_inviter_idx on public.invites (inviter, created_at);

create table public.code_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index code_attempts_idx on public.code_attempts (user_id, at);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  owner uuid not null references auth.users (id) on delete cascade,
  join_code text not null unique check (join_code ~ '^[A-Z0-9]{8}$'),
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

create table public.reactions (
  actor uuid not null references auth.users (id) on delete cascade,
  owner uuid not null references auth.users (id) on delete cascade,
  target_kind text not null check (target_kind in ('session', 'run')),
  target_id text not null check (char_length(target_id) <= 64),
  created_at timestamptz not null default now(),
  primary key (actor, owner, target_kind, target_id),
  check (actor <> owner)
);
create index reactions_owner_idx on public.reactions (owner, created_at);

alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
alter table public.invites enable row level security;
alter table public.code_attempts enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.reactions enable row level security;

-- Helpers. Definer functions read the social graph without exposing it.

create or replace function public.blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocks
    where (blocker = a and blocked = b) or (blocker = b and blocked = a)
  );
$$;

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select a is not null and b is not null and a <> b
    and exists (
      select 1 from public.friendships
      where user_a = least(a, b) and user_b = greatest(a, b)
    )
    and not public.blocked_between(a, b);
$$;

-- True when the caller owns the rows or is a friend the owner shares details with.
create or replace function public.can_see_details(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select owner = auth.uid() or (
    public.are_friends(auth.uid(), owner)
    and coalesce((
      select p.share_details from public.profiles p
      where p.user_id = owner and p.id = owner::text and not p.deleted
    ), false)
  );
$$;

create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members where group_id = gid and user_id = auth.uid()
  );
$$;

-- Policies on synced tables.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'plans', 'routines', 'routine_items', 'pain_reports', 'day_overrides', 'records'
  ] loop
    execute format(
      'create policy %1$I_owner on public.%1$I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
  foreach t in array array['exercises', 'sessions', 'session_items', 'sets', 'runs'] loop
    execute format(
      'create policy %1$I_owner on public.%1$I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format(
      'create policy %1$I_friend_details on public.%1$I for select to authenticated
         using (public.can_see_details(user_id))', t);
  end loop;
end;
$$;

-- Policies on social tables. Writes go through the RPCs below.
create policy friendships_read on public.friendships for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));
create policy friendships_delete on public.friendships for delete to authenticated
  using ((select auth.uid()) in (user_a, user_b));

create policy blocks_own on public.blocks for all to authenticated
  using (blocker = (select auth.uid())) with check (blocker = (select auth.uid()));

create policy invites_own on public.invites for select to authenticated
  using (inviter = (select auth.uid()));

create policy groups_members_read on public.groups for select to authenticated
  using (public.is_group_member(id));

create policy group_members_read on public.group_members for select to authenticated
  using (public.is_group_member(group_id));
create policy group_members_leave on public.group_members for delete to authenticated
  using (user_id = (select auth.uid()));

create policy reactions_read on public.reactions for select to authenticated
  using ((select auth.uid()) in (actor, owner));
create policy reactions_delete on public.reactions for delete to authenticated
  using (actor = (select auth.uid()));
