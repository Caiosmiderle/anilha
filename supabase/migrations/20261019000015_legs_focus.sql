-- Legs focus: the reminder names the new fichas ("Hoje tem anterior de coxa às 18:00").
-- The five-ficha split (chest, back, arms) gets its names too; before, it said "treino".
create or replace function public.split_label(p_key text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_key
    when 'costas_biceps' then 'costas e bíceps'
    when 'peito_triceps' then 'peito e tríceps'
    when 'perna' then 'perna'
    when 'ombro_abdomen' then 'ombro e abdômen'
    when 'corpo_inteiro_a' then 'corpo inteiro A'
    when 'corpo_inteiro_b' then 'corpo inteiro B'
    when 'superior_a' then 'superior A'
    when 'superior_b' then 'superior B'
    when 'inferior_a' then 'inferior A'
    when 'inferior_b' then 'inferior B'
    when 'empurrar' then 'empurrar'
    when 'puxar' then 'puxar'
    when 'peito' then 'peito'
    when 'costas' then 'costas'
    when 'bracos' then 'braços'
    when 'anterior' then 'anterior de coxa'
    when 'posterior' then 'posterior de coxa'
    when 'gluteos' then 'glúteos'
    when 'posterior_gluteos' then 'posterior e glúteos'
    when 'superiores' then 'parte de cima'
    when 'superiores_b' then 'parte de cima B'
    else 'treino'
  end;
$$;
