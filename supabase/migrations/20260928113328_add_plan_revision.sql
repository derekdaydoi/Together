-- Apply before the revision-aware frontend. This does not activate the separate
-- hard-plan guard; its post-release activation remains an explicit rollout step.
alter table public.plans
  add column revision integer not null default 1
  constraint plans_revision_positive check (revision > 0);

-- Every successful UPDATE invalidates previously read versions, including
-- status-only changes, no-op writes and writes made directly through PostgREST.
-- Ignore supplied values even for callers with broader column privileges.
create or replace function private.set_plan_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
  else
    new.revision := old.revision + 1;
  end if;
  return new;
end;
$$;

revoke all on function private.set_plan_revision() from public;

create trigger plans_set_revision
before insert or update on public.plans
for each row execute function private.set_plan_revision();

-- The existing column-level UPDATE grant deliberately excludes revision.
-- Clients read it but never write it: append WHERE revision = expected_revision
-- to confirm/edit/cancel requests and treat zero returned rows as a conflict.
