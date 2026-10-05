-- Lets either member erase the whole couple's shared data.
-- Deleting the couple row cascades to couple_members, daily_states,
-- work_schedules, availability_blocks, plans and weekly_checkins.
-- Profiles (name, zodiac, avatar) belong to each person's own account and are kept,
-- so both people can start a new space or join another one afterwards.
-- NOT yet applied to production: apply once, in order, after review.
create or replace function public.delete_couple_data()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user uuid := (select auth.uid());
  v_couple uuid;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;

  select c.id into v_couple
    from public.couples c
    join public.couple_members m on m.couple_id = c.id
   where m.user_id = v_user
   for update of c;
  if v_couple is null then return; end if;

  delete from public.couples where id = v_couple;
end;
$fn$;

revoke all on function public.delete_couple_data() from public;
revoke all on function public.delete_couple_data() from anon;
grant execute on function public.delete_couple_data() to authenticated;
