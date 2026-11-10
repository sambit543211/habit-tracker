-- Keep · Habit Tracker — database schema (step 1)
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- Every table is protected by Row Level Security: a signed-in user can only
-- read and write their own rows.

-- ---------- Profiles (per-user settings) ----------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users on delete cascade,
  start_day date,
  onboarded boolean not null default false,
  timezone text not null default 'UTC',
  evening_reminder time default '21:00',
  morning_reminder time default '08:30',
  streak_reminder time default '22:30',
  reminders_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ---------- Habits ----------
create table if not exists public.habits (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  cue text,
  tiny text,
  remind_at time,
  created_day date not null,
  archived_day date,
  updated_at timestamptz not null default now()
);
create index if not exists habits_user_idx on public.habits (user_id);

-- ---------- Habit logs (one row per habit per day) ----------
create table if not exists public.habit_logs (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  habit_id uuid not null references public.habits on delete cascade,
  status text not null check (status in ('done', 'missed')),
  miss jsonb,
  at timestamptz not null default now(),
  primary key (user_id, day, habit_id)
);

-- ---------- Plans (to-dos for a given day) ----------
create table if not exists public.plans (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  day date not null,
  must boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'done', 'missed', 'carried')),
  miss jsonb,
  carry_count int not null default 0,
  carried_to uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists plans_user_day_idx on public.plans (user_id, day);

-- ---------- Push subscriptions (one per device) ----------
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- ---------- Sent-notification log (prevents duplicate nudges) ----------
create table if not exists public.notification_log (
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,
  day date not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, day)
);

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;
alter table public.plans enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_log enable row level security;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'habits', 'habit_logs', 'plans', 'push_subscriptions'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;
-- notification_log has no policy on purpose: only the server (service role) touches it.

-- ---------- Keep updated_at fresh ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists habits_touch on public.habits;
create trigger habits_touch before update on public.habits for each row execute function public.touch_updated_at();
drop trigger if exists plans_touch on public.plans;
create trigger plans_touch before update on public.plans for each row execute function public.touch_updated_at();
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
