-- This exact migration was ALREADY APPLIED to Supabase as version 20261001075015.
-- Store history for repeatable environments; do not reapply manually in production.
drop policy if exists "checkins_update_self" on public.weekly_checkins;
create policy "checkins_update_self" on public.weekly_checkins
for update to authenticated
using (
  (select auth.uid()) = user_id
  and private.is_couple_member(couple_id)
  and not private.both_checked_in(couple_id, week_start)
)
with check ((select auth.uid()) = user_id and private.is_couple_member(couple_id));

create or replace function public.leave_unpaired_couple()
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

  if (select count(*) from public.couple_members where couple_id = v_couple) <> 1 then
    raise exception 'Couple already connected' using errcode='22023';
  end if;

  delete from public.couples where id = v_couple;
end;
$fn$;

revoke all on function public.leave_unpaired_couple() from public;
revoke all on function public.leave_unpaired_couple() from anon;
grant execute on function public.leave_unpaired_couple() to authenticated;
