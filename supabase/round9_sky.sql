-- Sky · round 9: weekly habits, repeating plans, Siri key. Already applied. Safe to re-run. Only adds things.
alter table public.habits add column if not exists per_week int;
alter table public.plans add column if not exists repeat_days text;
alter table public.profiles add column if not exists shortcut_key_hash text;
