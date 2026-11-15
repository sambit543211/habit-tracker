-- Streak rule: 'all' = every habit (strict, default), 'most' = at least 80% of habits.
alter table public.profiles
  add column if not exists streak_rule text not null default 'all'
  check (streak_rule in ('all', 'most'));
