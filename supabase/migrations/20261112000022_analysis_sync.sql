-- Analyses and ficha reviews follow the account between the iPhone and the site.
-- Additive only: a new table with RLS and three new functions. Nothing existing changes:
-- synced_tables(), sync_push/pull, purge_old_data and delete_account stay as they are.
-- Account deletion removes these rows by the foreign key (on delete cascade).
--
-- One row per local key: 'analysis:<session id>' or 'review:<routine id>'. The payload is
-- what the device keeps under that key, without the undo snapshot (undo stays on the device
-- that saved). No health data: the analysis and review contexts never carry pain or joints.

create table public.analysis_sync (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (id ~ '^(analysis|review):[0-9a-zA-Z_-]{1,64}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 262144),
  updated_at bigint not null check (updated_at > 0),
  server_seq bigint not null default 0,
  primary key (user_id, id)
);
create index analysis_sync_pull_idx on public.analysis_sync (user_id, server_seq);
create trigger analysis_sync_seq before insert or update on public.analysis_sync
for each row execute function public.touch_server_seq();

alter table public.analysis_sync enable row level security;
revoke all on public.analysis_sync from public, anon, authenticated;
grant select, insert, update, delete on public.analysis_sync to authenticated;
create policy analysis_sync_owner_read on public.analysis_sync for select to authenticated
  using (user_id = (select auth.uid()));
create policy analysis_sync_owner_insert on public.analysis_sync for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy analysis_sync_owner_update on public.analysis_sync for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy analysis_sync_owner_delete on public.analysis_sync for delete to authenticated
  using (user_id = (select auth.uid()));

-- Last writer wins by the client's clock, like the other synced tables. Returns the keys kept.
create function public.analysis_push(items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  item jsonb;
  kept jsonb := '[]'::jsonb;
  n integer;
begin
  if uid is null then
    raise exception 'Sem sessão' using errcode = '28000';
  end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 50 then
    raise exception 'Lote inválido' using errcode = '22023';
  end if;
  for item in select * from jsonb_array_elements(items) loop
    if jsonb_typeof(item) <> 'object' or jsonb_typeof(item->'payload') <> 'object'
       or jsonb_typeof(item->'updated_at') <> 'number' then
      raise exception 'Item inválido' using errcode = '22023';
    end if;
    insert into public.analysis_sync as old (user_id, id, payload, updated_at)
    values (uid, item->>'id', item->'payload', (item->>'updated_at')::bigint)
    on conflict (user_id, id) do update
      set payload = excluded.payload, updated_at = excluded.updated_at
      where old.updated_at < excluded.updated_at;
    get diagnostics n = row_count;
    if n > 0 then kept := kept || to_jsonb(item->>'id'); end if;
  end loop;
  return jsonb_build_object('kept', kept);
end;
$$;

create function public.analysis_pull(since bigint, max_rows integer default 200)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with page as (
    select id, payload, updated_at, server_seq
      from public.analysis_sync
     where user_id = auth.uid() and server_seq > since
     order by server_seq
     limit least(greatest(max_rows, 1), 500)
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'payload', payload, 'updated_at', updated_at)
                                        order by server_seq) from page), '[]'::jsonb),
    'cursor', coalesce((select max(server_seq) from page), since),
    'more', (select count(*) from page) >= least(greatest(max_rows, 1), 500)
  );
$$;

-- Removes every synced analysis and review of the caller (used by "apagar análises").
create function public.analysis_forget()
returns integer
language sql
security invoker
set search_path = public
as $$
  with gone as (delete from public.analysis_sync where user_id = auth.uid() returning 1)
  select count(*)::integer from gone;
$$;

revoke execute on function public.analysis_push(jsonb) from public, anon;
revoke execute on function public.analysis_pull(bigint, integer) from public, anon;
revoke execute on function public.analysis_forget() from public, anon;
grant execute on function public.analysis_push(jsonb) to authenticated;
grant execute on function public.analysis_pull(bigint, integer) to authenticated;
grant execute on function public.analysis_forget() to authenticated;
