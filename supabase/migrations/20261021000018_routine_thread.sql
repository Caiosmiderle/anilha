-- A conversa por amigo: as fichas que um mandou para o outro, nos dois sentidos, em ordem.
-- Não há texto livre: cada item é uma ficha enviada (com o recado que já vinha nela) e o que
-- quem recebeu fez com ela. Só entre amigos, sem bloqueio, e sem as fichas da equipe.
-- As últimas 60, da mais antiga para a mais nova.
create or replace function public.routine_thread(p_friend uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(t.item order by t.at), '[]'::jsonb)
  from (
    select s.created_at as at, jsonb_build_object(
      'id', s.id,
      'mine', s.sender = auth.uid(),
      'name', s.name,
      'note', s.note,
      'exercises', jsonb_array_length(s.items),
      'status', s.status,
      'created_at', s.created_at,
      'answered_at', s.answered_at
    ) as item
    from public.shared_routines s
    where not s.from_team
      and (
        (s.sender = auth.uid() and s.recipient = p_friend)
        or (s.sender = p_friend and s.recipient = auth.uid())
      )
      and public.are_friends(auth.uid(), p_friend)
      and not public.blocked_between(auth.uid(), p_friend)
    order by s.created_at desc
    limit 60
  ) t;
$$;

revoke execute on function public.routine_thread(uuid) from public, anon;
grant execute on function public.routine_thread(uuid) to authenticated;
