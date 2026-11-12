-- Local stand-in for the pieces of Supabase the migrations rely on: the auth schema,
-- auth.uid(), the anon/authenticated/service_role roles and their default privileges.
-- Used only by the local dev server and the database tests (PGlite). Never deployed.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text not null unique,
  created_at timestamptz not null default now()
);
-- Supabase sets it at every login; the management panel shows it.
alter table auth.users add column if not exists last_sign_in_at timestamptz;

create table if not exists auth.refresh_tokens (
  token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked boolean not null default false
);
-- When a refresh rotated it: like Supabase, it still works for 10 seconds, so calls that
-- refresh at the same time do not sign the person out.
alter table auth.refresh_tokens add column if not exists revoked_at timestamptz;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ),
    ''
  )::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;

-- Same defaults Supabase applies to objects created in public.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
