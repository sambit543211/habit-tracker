-- Keep · round 8: amount habits (water). Safe to re-run. Only adds things.

-- A daily target and a step on the habit, e.g. Drink 3L water: target 3000 ml, step 200 ml.
alter table public.habits add column if not exists target int;
alter table public.habits add column if not exists step int;

-- Running total per habit per day ("1.2 L of 3 L").
create table if not exists public.habit_amounts (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  habit_id uuid not null references public.habits on delete cascade,
  amount int not null default 0 check (amount >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, day, habit_id)
);
alter table public.habit_amounts enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'habit_amounts' and policyname = 'own rows') then
    create policy "own rows" on public.habit_amounts for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
end $$;
grant select, insert, update, delete on public.habit_amounts to authenticated;

-- Start fresh also clears water amounts.
create or replace function public.start_fresh(p_day date) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_day < current_date - 1 or p_day > current_date + 7 then raise exception 'pick a day close to today'; end if;
  delete from public.habit_logs where user_id = me;
  delete from public.habit_amounts where user_id = me;
  delete from public.plans where user_id = me and day < p_day;
  delete from public.reflections where user_id = me;
  delete from public.weekly_reviews where user_id = me;
  delete from public.smoke_events where user_id = me;
  delete from public.habits where user_id = me and archived_day is not null;
  update public.habits set created_day = p_day where user_id = me;
  update public.profiles set start_day = p_day where user_id = me;
  return 'ok';
end $$;
