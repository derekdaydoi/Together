-- Together database schema
-- Designed for a two-person couple workspace with strict Row Level Security.

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create type public.work_type as enum ('office', 'remote', 'shift', 'off', 'other');
create type public.availability_status as enum ('available', 'busy', 'prefer_alone', 'want_together');
create type public.plan_type as enum ('soft', 'hard');
create type public.plan_status as enum ('proposed', 'confirmed', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Bạn' check (char_length(display_name) between 1 and 60),
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.couples (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Chúng mình' check (char_length(name) between 1 and 80),
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10)),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.couple_members (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (couple_id, user_id)
);
create index couple_members_user_id_idx on public.couple_members(user_id);

create table public.daily_states (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  state_date date not null,
  energy_level smallint not null check (energy_level between 1 and 5),
  closeness_need smallint not null check (closeness_need between 1 and 5),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (couple_id, user_id, state_date)
);
create index daily_states_couple_date_idx on public.daily_states(couple_id, state_date);

create table public.work_schedules (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  work_type public.work_type not null,
  note text check (char_length(note) <= 500),
  repeats_weekly boolean not null default false,
  created_at timestamptz not null default now(),
  constraint work_schedule_time_check check (ends_at > starts_at)
);
create index work_schedules_couple_starts_idx on public.work_schedules(couple_id, starts_at);
create index work_schedules_user_starts_idx on public.work_schedules(user_id, starts_at);

create table public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.availability_status not null,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  constraint availability_time_check check (ends_at > starts_at)
);
create index availability_couple_starts_idx on public.availability_blocks(couple_id, starts_at);
create index availability_user_starts_idx on public.availability_blocks(user_id, starts_at);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  plan_type public.plan_type not null default 'soft',
  status public.plan_status not null default 'proposed',
  location text check (char_length(location) <= 300),
  note text check (char_length(note) <= 800),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_time_check check (ends_at > starts_at)
);
create index plans_couple_starts_idx on public.plans(couple_id, starts_at);

create table public.weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  feeling smallint not null check (feeling between 1 and 3),
  note text check (char_length(note) <= 800),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (couple_id, user_id, week_start)
);
create index weekly_checkins_couple_week_idx on public.weekly_checkins(couple_id, week_start);

create or replace function private.is_couple_member(p_couple_id uuid, p_user_id uuid default auth.uid()) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.couple_members where couple_id = p_couple_id and user_id = p_user_id); $$;
create or replace function private.shares_couple(a uuid, b uuid) returns boolean language sql stable security definer set search_path = public as $$ select a = b or exists (select 1 from public.couple_members ma join public.couple_members mb on mb.couple_id = ma.couple_id where ma.user_id = a and mb.user_id = b); $$;
create or replace function private.both_checked_in(p_couple_id uuid, p_week_start date) returns boolean language sql stable security definer set search_path = public as $$ select count(distinct user_id) >= 2 from public.weekly_checkins where couple_id = p_couple_id and week_start = p_week_start; $$;
grant execute on function private.is_couple_member(uuid, uuid) to authenticated;
grant execute on function private.shares_couple(uuid, uuid) to authenticated;
grant execute on function private.both_checked_in(uuid, date) to authenticated;

create or replace function private.add_couple_owner() returns trigger language plpgsql security definer set search_path = public as $$ begin insert into public.couple_members(couple_id, user_id, role) values (new.id, new.created_by, 'owner'); return new; end; $$;
revoke all on function private.add_couple_owner() from public;
create trigger couples_add_owner after insert on public.couples for each row execute function private.add_couple_owner();
create or replace function private.enforce_two_members() returns trigger language plpgsql security definer set search_path = public as $$ declare member_count integer; begin select count(*) into member_count from public.couple_members where couple_id = new.couple_id; if member_count >= 2 then raise exception 'This couple already has two members'; end if; if exists (select 1 from public.couple_members where user_id = new.user_id) then raise exception 'This user already belongs to a couple'; end if; return new; end; $$;
revoke all on function private.enforce_two_members() from public;
create trigger couple_members_limit before insert on public.couple_members for each row execute function private.enforce_two_members();

alter table public.profiles enable row level security; alter table public.couples enable row level security; alter table public.couple_members enable row level security; alter table public.daily_states enable row level security; alter table public.work_schedules enable row level security; alter table public.availability_blocks enable row level security; alter table public.plans enable row level security; alter table public.weekly_checkins enable row level security;
create policy "profiles_select_self_or_partner" on public.profiles for select to authenticated using (private.shares_couple((select auth.uid()), id));
create policy "profiles_insert_self" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_self" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "couples_select_member" on public.couples for select to authenticated using (private.is_couple_member(id));
create policy "couples_insert_creator" on public.couples for insert to authenticated with check ((select auth.uid()) = created_by);
create policy "couples_update_member" on public.couples for update to authenticated using (private.is_couple_member(id)) with check (private.is_couple_member(id));
create policy "members_select_same_couple" on public.couple_members for select to authenticated using (private.is_couple_member(couple_id));
create policy "daily_select_member" on public.daily_states for select to authenticated using (private.is_couple_member(couple_id));
create policy "daily_insert_self" on public.daily_states for insert to authenticated with check (private.is_couple_member(couple_id) and (select auth.uid()) = user_id);
create policy "daily_update_self" on public.daily_states for update to authenticated using ((select auth.uid()) = user_id and private.is_couple_member(couple_id)) with check ((select auth.uid()) = user_id and private.is_couple_member(couple_id));
create policy "daily_delete_self" on public.daily_states for delete to authenticated using ((select auth.uid()) = user_id and private.is_couple_member(couple_id));
create policy "work_select_member" on public.work_schedules for select to authenticated using (private.is_couple_member(couple_id));
create policy "work_insert_self" on public.work_schedules for insert to authenticated with check (private.is_couple_member(couple_id) and (select auth.uid()) = user_id);
create policy "work_update_self" on public.work_schedules for update to authenticated using ((select auth.uid()) = user_id and private.is_couple_member(couple_id)) with check ((select auth.uid()) = user_id and private.is_couple_member(couple_id));
create policy "work_delete_self" on public.work_schedules for delete to authenticated using ((select auth.uid()) = user_id and private.is_couple_member(couple_id));
create policy "availability_select_member" on public.availability_blocks for select to authenticated using (private.is_couple_member(couple_id));
create policy "availability_insert_self" on public.availability_blocks for insert to authenticated with check (private.is_couple_member(couple_id) and (select auth.uid()) = user_id);
create policy "availability_update_self" on public.availability_blocks for update to authenticated using ((select auth.uid()) = user_id and private.is_couple_member(couple_id)) with check ((select auth.uid()) = user_id and private.is_couple_member(couple_id));
create policy "availability_delete_self" on public.availability_blocks for delete to authenticated using ((select auth.uid()) = user_id and private.is_couple_member(couple_id));
create policy "plans_select_member" on public.plans for select to authenticated using (private.is_couple_member(couple_id));
create policy "plans_insert_member" on public.plans for insert to authenticated with check (private.is_couple_member(couple_id) and (select auth.uid()) = created_by);
create policy "plans_update_member" on public.plans for update to authenticated using (private.is_couple_member(couple_id)) with check (private.is_couple_member(couple_id));
create policy "plans_delete_creator" on public.plans for delete to authenticated using ((select auth.uid()) = created_by and private.is_couple_member(couple_id));
create policy "checkins_select_private_then_reveal" on public.weekly_checkins for select to authenticated using ((select auth.uid()) = user_id or (private.is_couple_member(couple_id) and private.both_checked_in(couple_id, week_start)));
create policy "checkins_insert_self" on public.weekly_checkins for insert to authenticated with check (private.is_couple_member(couple_id) and (select auth.uid()) = user_id);
create policy "checkins_update_self" on public.weekly_checkins for update to authenticated using ((select auth.uid()) = user_id and private.is_couple_member(couple_id)) with check ((select auth.uid()) = user_id and private.is_couple_member(couple_id));

grant select, insert, update on public.profiles to authenticated; grant select, insert, update on public.couples to authenticated; grant select on public.couple_members to authenticated; grant select, insert, update, delete on public.daily_states to authenticated; grant select, insert, update, delete on public.work_schedules to authenticated; grant select, insert, update, delete on public.availability_blocks to authenticated; grant select, insert, update, delete on public.plans to authenticated; grant select, insert, update on public.weekly_checkins to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']) on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy "avatars_select_self_or_partner" on storage.objects for select to authenticated using (bucket_id = 'avatars' and owner_id is not null and private.shares_couple((select auth.uid()), owner_id::uuid));
create policy "avatars_insert_own_folder" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars_update_own" on storage.objects for update to authenticated using (bucket_id = 'avatars' and owner_id = (select auth.uid())::text) with check (bucket_id = 'avatars' and owner_id = (select auth.uid())::text);
create policy "avatars_delete_own" on storage.objects for delete to authenticated using (bucket_id = 'avatars' and owner_id = (select auth.uid())::text);

alter publication supabase_realtime add table public.daily_states; alter publication supabase_realtime add table public.work_schedules; alter publication supabase_realtime add table public.availability_blocks; alter publication supabase_realtime add table public.plans; alter publication supabase_realtime add table public.weekly_checkins;
