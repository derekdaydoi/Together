-- One-time, high-entropy invitations. Existing couples remain readable.
-- A seven-day window also applies to existing outstanding invitations.
alter table public.couples
  add column if not exists invite_expires_at timestamptz,
  add column if not exists invite_used_at timestamptz;

alter table public.couples
  alter column invite_code set default upper(encode(extensions.gen_random_bytes(16), 'hex')),
  alter column invite_expires_at set default (now() + interval '7 days');

update public.couples c set invite_expires_at = now() + interval '7 days'
where invite_expires_at is null;
update public.couples c set invite_used_at = now()
where invite_used_at is null and
  (select count(*) from public.couple_members m where m.couple_id=c.id)>=2;

alter table public.couples alter column invite_expires_at set not null;

-- The only redemption entry point locks the parent couple row; concurrent
-- join attempts cannot consume one token twice. Client has no direct member
-- INSERT permission. auth.uid() comes from the validated JWT, not a parameter.
create or replace function public.redeem_couple_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user uuid := (select auth.uid());
  v_couple uuid;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_code is null or p_code !~ '^[A-Fa-f0-9]{10,32}$' then
    raise exception 'Invalid invitation' using errcode='22023';
  end if;
  if exists(select 1 from public.couple_members where user_id=v_user) then
    raise exception 'Already connected' using errcode='23505';
  end if;

  select id into v_couple from public.couples
   where invite_code = upper(p_code)
     and invite_expires_at > now()
     and invite_used_at is null
   for update;
  if v_couple is null then raise exception 'Invitation expired or unavailable' using errcode='22023'; end if;
  if (select count(*) from public.couple_members where couple_id=v_couple) <> 1 then
    raise exception 'Couple is unavailable' using errcode='22023';
  end if;

  insert into public.couple_members(couple_id,user_id,role)
  values(v_couple,v_user,'member');
  update public.couples set invite_used_at=now() where id=v_couple;
  return v_couple;
end;
$fn$;

revoke all on function public.redeem_couple_invite(text) from public;
revoke all on function public.redeem_couple_invite(text) from anon;
grant execute on function public.redeem_couple_invite(text) to authenticated;

-- Owner may replace an outstanding code without creating another couple.
-- Locking also serializes regeneration against a concurrent redemption.
create or replace function public.rotate_couple_invite()
returns table(invite_code text, invite_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $fn$
declare v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select c.id into v_id from public.couples c
    join public.couple_members m on m.couple_id=c.id
    where m.user_id=(select auth.uid()) and m.role='owner'
    for update of c;
  if v_id is null then raise exception 'Only an owner can renew an invitation' using errcode='42501'; end if;
  if (select count(*) from public.couple_members where couple_id=v_id) <> 1 then
    raise exception 'Couple already connected' using errcode='22023';
  end if;
  return query update public.couples c
    set invite_code=upper(encode(extensions.gen_random_bytes(16),'hex')),
        invite_expires_at=now()+interval '7 days', invite_used_at=null
    where c.id=v_id
    returning c.invite_code,c.invite_expires_at;
end;
$fn$;
revoke all on function public.rotate_couple_invite() from public;
revoke all on function public.rotate_couple_invite() from anon;
grant execute on function public.rotate_couple_invite() to authenticated;
