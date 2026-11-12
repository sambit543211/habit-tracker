-- Step 7: rolled-over plans remember their first day. Safe to re-run. Already applied.
alter table public.plans add column if not exists origin_day date;
