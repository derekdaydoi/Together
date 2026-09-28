-- INSERT ... RETURNING is checked by SELECT RLS before the AFTER INSERT
-- membership trigger runs. The immutable creator can see their own new row.
-- Existing column grants prevent browser clients from changing created_by.
alter policy "couples_select_member" on public.couples
using ((select auth.uid()) = created_by or private.is_couple_member(id));

-- Preserve the release gate: replace the function, but do not create/enable its
-- trigger here. The post-release activation script still controls rollout.
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

  -- Protect both directions: otherwise a partner can rewrite someone else's
  -- soft plan into a hard proposal, then "accept" their own invented proposal.
  if (old.plan_type = 'hard' or new.plan_type = 'hard')
    and (select auth.uid()) is distinct from old.created_by
    and row(new.title, new.starts_at, new.ends_at, new.location, new.note, new.plan_type)
      is distinct from row(old.title, old.starts_at, old.ends_at, old.location, old.note, old.plan_type)
  then
    raise exception 'Only the proposing member can edit a hard plan';
  end if;

  -- Only the author may propose again after cancellation or confirmation.
  -- Either member can still withdraw agreement explicitly by cancelling.
  if (old.plan_type = 'hard' or new.plan_type = 'hard')
    and (
      (old.status = 'cancelled' and new.status <> 'cancelled')
      or (old.status = 'confirmed' and new.status = 'proposed')
    )
    and (select auth.uid()) is distinct from old.created_by
  then
    raise exception 'Only the proposing member can reopen a hard plan';
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

-- Auth metadata is user-controlled. An oversized display_name must not make
-- the auth.users INSERT fail because profiles has a 60-character constraint.
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
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 'Bạn'), 60)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public;
