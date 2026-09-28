-- Include couple_id in the old WAL row so Realtime can evaluate the existing
-- couple_id filters for DELETE events before reducing the RLS payload to its PK.
-- Preserve the existing RLS policies, grants and publication membership.
alter table public.work_schedules replica identity full;
alter table public.availability_blocks replica identity full;
