-- Execute only AFTER the updated frontend has been deployed and checked.
-- See QA-RELAUNCH.md for the two-device acceptance test.
begin;
drop trigger if exists plans_guard_hard_confirmation on public.plans;
create trigger plans_guard_hard_confirmation
before insert or update on public.plans
for each row execute function private.guard_hard_plan_confirmation();
commit;
