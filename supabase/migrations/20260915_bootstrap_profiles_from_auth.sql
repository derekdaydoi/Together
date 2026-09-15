-- Keep a public profile in sync with every Supabase Auth user.
-- This removes a fragile dependency on the browser callback completing before
-- the rest of Together can load.

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), 'Bạn')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

insert into public.profiles(id, display_name)
select id, coalesce(nullif(raw_user_meta_data ->> 'display_name', ''), 'Bạn')
from auth.users
on conflict (id) do nothing;
