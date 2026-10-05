-- Lets a member erase only their OWN entries inside the shared couple space:
-- daily states, work schedules, availability blocks and weekly check-ins.
-- Shared plans, the partner's data, the couple itself and the profile are untouched.
-- (Check-ins have no DELETE policy and are locked once revealed, hence a definer function.)
-- NOT yet applied to production: apply once, in order, after review.
create or replace function public.delete_my_couple_data()
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

  select m.couple_id into v_couple
    from public.couple_members m
   where m.user_id = v_user;
  if v_couple is null then return; end if;

  delete from public.daily_states       where couple_id = v_couple and user_id = v_user;
  delete from public.work_schedules     where couple_id = v_couple and user_id = v_user;
  delete from public.availability_blocks where couple_id = v_couple and user_id = v_user;
  delete from public.weekly_checkins    where couple_id = v_couple and user_id = v_user;
end;
$fn$;

revoke all on function public.delete_my_couple_data() from public;
revoke all on function public.delete_my_couple_data() from anon;
grant execute on function public.delete_my_couple_data() to authenticated;
