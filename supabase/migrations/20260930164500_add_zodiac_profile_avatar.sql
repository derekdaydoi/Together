-- Persist the 12 Vietnamese zodiac avatars selected during zero-email onboarding.
-- Nullable keeps the migration backwards compatible for existing profiles; the
-- frontend routes owners without a selection back through profile setup.
alter table public.profiles
  add column if not exists avatar_key text;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_avatar_key_valid'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_avatar_key_valid
      check (
        avatar_key is null
        or avatar_key in ('rat','buffalo','tiger','cat','dragon','snake','horse','goat','monkey','rooster','dog','pig')
      );
  end if;
end;
$migration$;
