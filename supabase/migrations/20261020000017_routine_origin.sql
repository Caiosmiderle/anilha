-- Where each routine came from. A new plan replaces only the plan's own fichas; the ones the
-- person created, received from a friend or added from the library stay. Before this, a new
-- plan archived every active routine (a user lost "Costa do fildo" on 20/10/2026, restored).
-- Nullable, like every new column of a synced table: rows written by older app versions have
-- no origin and the app infers it the same way as below.

alter table public.routines
  add column if not exists origin text
  check (origin is null or origin in ('plano', 'pessoa', 'pronta', 'recebida'));

-- Existing rows: the generator's reason has always been "N exercícios, M séries de trabalho.";
-- copies from the library and from friends have their own ids and reasons; the rest was made
-- by the person. updated_at moves so every phone pulls the origin.
update public.routines
   set origin = case
         when id like 'pronta-%' or reason = 'Ficha pronta do Anilha' then 'pronta'
         when id like 'recebida-%' or reason like 'Enviada %' then 'recebida'
         when reason ~ '^[0-9]+ exercícios, [0-9]+ séries de trabalho\.$' then 'plano'
         else 'pessoa'
       end,
       updated_at = (extract(epoch from now()) * 1000)::bigint
 where origin is null;
