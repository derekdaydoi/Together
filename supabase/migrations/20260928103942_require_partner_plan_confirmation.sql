-- A hard plan becomes confirmed only when the OTHER couple member accepts it.
-- Works with the existing member-only plans UPDATE policy; no public RPC needed.
create or replace function private.guard_hard_plan_confirmation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $guard$
begin
  if tg_op = 'INSERT' then
    if new.plan_type = 'hard' and new.status = 'confirmed' then
      raise exception 'A hard plan needs the partner confirmation';
    end if;
    return new;
  end if;

  -- Members can cancel an invitation, but a partner cannot rewrite a hard plan.
  if old.plan_type = 'hard'
    and (select auth.uid()) is distinct from old.created_by
    and row(new.title, new.starts_at, new.ends_at, new.location, new.note, new.plan_type)
      is distinct from row(old.title, old.starts_at, old.ends_at, old.location, old.note, old.plan_type)
  then
    raise exception 'Only the proposing member can edit a hard plan';
  end if;

  if new.plan_type = 'hard' and new.status = 'confirmed' then
    if old.status is distinct from 'confirmed' then
      if old.status <> 'proposed' or old.plan_type <> 'hard' or (select auth.uid()) = old.created_by then
        raise exception 'Only the other member can confirm a pending hard plan';
      end if;
      if row(new.title, new.starts_at, new.ends_at, new.location, new.note, new.plan_type)
        is distinct from row(old.title, old.starts_at, old.ends_at, old.location, old.note, old.plan_type)
      then
        raise exception 'Confirm the original proposal without editing it';
      end if;
    elsif row(new.title, new.starts_at, new.ends_at, new.location, new.note, new.plan_type)
        is distinct from row(old.title, old.starts_at, old.ends_at, old.location, old.note, old.plan_type)
    then
      raise exception 'Reopen the plan for confirmation before editing';
    end if;
  end if;
  return new;
end;
$guard$;

revoke all on function private.guard_hard_plan_confirmation() from public;
drop trigger if exists plans_guard_hard_confirmation on public.plans;
create trigger plans_guard_hard_confirmation
before insert or update on public.plans
for each row execute function private.guard_hard_plan_confirmation();
