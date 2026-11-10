-- Keep · Habit Tracker — step 3: profile, calendar plans, reflections, weekly reviews.
-- Already applied to the project; kept here for reference. Safe to re-run.

alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists wake_time time not null default '08:00';
alter table public.profiles add column if not exists sleep_time time not null default '02:00';

alter table public.plans add column if not exists note text;
alter table public.plans add column if not exists start_time time;
alter table public.plans add column if not exists duration_min int check (duration_min is null or duration_min >= 15);
alter table public.plans add column if not exists remind_offset int check (remind_offset is null or remind_offset between 0 and 240);
alter table public.plans add column if not exists remind_at time;
alter table public.plans add column if not exists obstacle text;
alter table public.plans add column if not exists if_then text;

alter table public.habits add column if not exists pair_with text;

create table if not exists public.reflections (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  text text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table if not exists public.weekly_reviews (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  week_start date not null,
  went_well text,
  change text,
  experiment text,
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

alter table public.reflections enable row level security;
alter table public.weekly_reviews enable row level security;
drop policy if exists "own rows" on public.reflections;
create policy "own rows" on public.reflections for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "own rows" on public.weekly_reviews;
create policy "own rows" on public.weekly_reviews for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop trigger if exists reflections_touch on public.reflections;
create trigger reflections_touch before update on public.reflections for each row execute function public.touch_updated_at();
drop trigger if exists weekly_reviews_touch on public.weekly_reviews;
create trigger weekly_reviews_touch before update on public.weekly_reviews for each row execute function public.touch_updated_at();
