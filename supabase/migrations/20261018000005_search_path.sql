-- Anilha: pin search_path on the two helper functions that did not set it (Supabase advisor).
alter function public.synced_tables() set search_path = public;
alter function public.split_label(text) set search_path = public;
