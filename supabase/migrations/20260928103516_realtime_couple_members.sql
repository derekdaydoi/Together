-- Match the additive production migration that enables live partner-join updates.
-- The membership table retains its existing RLS policies.
do $migration$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'couple_members'
  ) then
    alter publication supabase_realtime add table public.couple_members;
  end if;
end;
$migration$;
