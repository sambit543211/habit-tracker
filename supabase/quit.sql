-- Keep · Habit Tracker — step 5: quit-smoking mode. Safe to re-run. Already applied.
alter table public.profiles add column if not exists quit jsonb;

create table if not exists public.smoke_events (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  at timestamptz not null default now(),
  kind text not null check (kind in ('smoked', 'craving_passed')),
  trigger text
);
create index if not exists smoke_events_user_day_idx on public.smoke_events (user_id, day);
alter table public.smoke_events enable row level security;
drop policy if exists "own rows" on public.smoke_events;
create policy "own rows" on public.smoke_events for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
