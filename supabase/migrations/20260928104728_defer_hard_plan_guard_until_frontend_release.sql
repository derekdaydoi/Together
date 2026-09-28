-- Temporary compatibility migration: the existing live web client writes hard
-- plans directly as confirmed. Preserve that behavior until the new web app is
-- actually deployed. The full guard function remains available in the DB.
drop trigger if exists plans_guard_hard_confirmation on public.plans;
