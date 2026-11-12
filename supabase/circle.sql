-- Keep · Habit Tracker — step 6: Circle (habit sharing). Safe to re-run.
-- Privacy model: the circle tables have RLS ON and NO policies, so the app can
-- never read them directly. Everything goes through the security-definer
-- functions below, which only ever return: names, linked habit names and
-- done / missed / open per day. Plans, notes and miss reasons are never exposed.

alter table public.profiles add column if not exists circle_enabled boolean not null default false;

create table if not exists public.circles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.circle_members (
  circle_id uuid not null references public.circles on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  status text not null check (status in ('invited', 'active')),
  invited_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);
-- One circle per person for now.
create unique index if not exists circle_members_one_per_user on public.circle_members (user_id);
create table if not exists public.circle_goals (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles on delete cascade,
  name text not null,
  emoji text not null default '🎯',
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.circle_links (
  goal_id uuid not null references public.circle_goals on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  habit_id uuid not null references public.habits on delete cascade,
  primary key (goal_id, user_id)
);
create table if not exists public.circle_reactions (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles on delete cascade,
  goal_id uuid not null references public.circle_goals on delete cascade,
  from_user uuid not null references auth.users on delete cascade,
  to_user uuid not null references auth.users on delete cascade,
  day date not null,
  kind text not null check (kind in ('cheer', 'nudge')),
  notified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (from_user, to_user, goal_id, day, kind)
);

alter table public.circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.circle_goals enable row level security;
alter table public.circle_links enable row level security;
alter table public.circle_reactions enable row level security;
revoke all on public.circles, public.circle_members, public.circle_goals, public.circle_links, public.circle_reactions from anon, authenticated;

-- ---------- helpers ----------
create or replace function public._my_circle() returns uuid
language sql stable security definer set search_path = '' as $$
  select circle_id from public.circle_members where user_id = (select auth.uid()) and status = 'active'
$$;

create or replace function public._display_name(u uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(trim(p.display_name), ''), split_part(a.email, '@', 1), 'Someone')
  from auth.users a left join public.profiles p on p.user_id = a.id where a.id = u
$$;

-- ---------- find people ----------
-- Name search shows a masked email; typing someone's full email finds them exactly.
create or replace function public.circle_search(q text)
returns table (user_id uuid, name text, email_hint text)
language sql stable security definer set search_path = '' as $$
  select a.id,
         public._display_name(a.id),
         case when lower(a.email) = lower(trim(q)) then a.email
              else left(split_part(a.email, '@', 1), 3) || '•••@' || split_part(a.email, '@', 2) end
  from auth.users a
  left join public.profiles p on p.user_id = a.id
  where (select auth.uid()) is not null
    and a.id <> (select auth.uid())
    and length(trim(q)) >= 3
    and (lower(a.email) = lower(trim(q)) or p.display_name ilike '%' || replace(replace(trim(q), '%', ''), '_', '') || '%')
  order by (lower(a.email) = lower(trim(q))) desc, 2
  limit 8
$$;

-- ---------- membership ----------
create or replace function public.circle_invite(target uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); c uuid; n int;
begin
  if me is null then raise exception 'not signed in'; end if;
  if target = me then return 'self'; end if;
  if not exists (select 1 from auth.users where id = target) then return 'not_found'; end if;
  select circle_id into c from public.circle_members where user_id = me and status = 'active';
  if c is null then
    if exists (select 1 from public.circle_members where user_id = me) then return 'answer_your_invite_first'; end if;
    insert into public.circles (name, owner) values (public._display_name(me) || '''s circle', me) returning id into c;
    insert into public.circle_members (circle_id, user_id, status) values (c, me, 'active');
  end if;
  if exists (select 1 from public.circle_members where user_id = target) then return 'already_in_a_circle'; end if;
  select count(*) into n from public.circle_members where circle_id = c;
  if n >= 6 then return 'full'; end if;
  insert into public.circle_members (circle_id, user_id, status, invited_by) values (c, target, 'invited', me);
  return 'invited';
end $$;

create or replace function public.circle_respond(accept boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if accept then
    update public.circle_members set status = 'active' where user_id = me and status = 'invited';
    update public.profiles set circle_enabled = true where user_id = me;
  else
    delete from public.circle_members where user_id = me and status = 'invited';
  end if;
  return 'ok';
end $$;

-- Leave (target null) or, as owner, remove someone / cancel an invite.
create or replace function public.circle_remove(target uuid default null) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); c uuid; who uuid;
begin
  c := public._my_circle();
  if c is null then return 'no_circle'; end if;
  who := coalesce(target, me);
  if who <> me and not exists (select 1 from public.circles where id = c and owner = me)
     and not exists (select 1 from public.circle_members where circle_id = c and user_id = who and invited_by = me and status = 'invited') then
    return 'not_allowed';
  end if;
  delete from public.circle_links l using public.circle_goals g where l.goal_id = g.id and g.circle_id = c and l.user_id = who;
  delete from public.circle_members where circle_id = c and user_id = who;
  if not exists (select 1 from public.circle_members where circle_id = c and status = 'active') then
    delete from public.circles where id = c;
  elsif who = (select owner from public.circles where id = c) then
    update public.circles set owner = (select user_id from public.circle_members where circle_id = c and status = 'active' order by created_at limit 1) where id = c;
  end if;
  return 'ok';
end $$;

-- ---------- shared goals ----------
create or replace function public.circle_add_goal(goal_name text, goal_emoji text default '🎯') returns uuid
language plpgsql security definer set search_path = '' as $$
declare c uuid := public._my_circle(); g uuid;
begin
  if c is null then raise exception 'no circle'; end if;
  if length(trim(goal_name)) = 0 then raise exception 'name required'; end if;
  if (select count(*) from public.circle_goals where circle_id = c) >= 8 then raise exception 'too many goals'; end if;
  insert into public.circle_goals (circle_id, name, emoji, created_by)
  values (c, left(trim(goal_name), 40), left(coalesce(goal_emoji, '🎯'), 8), (select auth.uid())) returning id into g;
  return g;
end $$;

create or replace function public.circle_delete_goal(goal uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); c uuid := public._my_circle();
begin
  delete from public.circle_goals g where g.id = goal and g.circle_id = c
    and (g.created_by = me or exists (select 1 from public.circles where id = c and owner = me));
  return 'ok';
end $$;

-- Link one of MY habits to a shared goal (null unlinks).
create or replace function public.circle_link(goal uuid, habit uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); c uuid := public._my_circle();
begin
  if not exists (select 1 from public.circle_goals where id = goal and circle_id = c) then return 'not_found'; end if;
  if habit is null then
    delete from public.circle_links where goal_id = goal and user_id = me;
    return 'unlinked';
  end if;
  if not exists (select 1 from public.habits where id = habit and user_id = me) then return 'not_your_habit'; end if;
  insert into public.circle_links (goal_id, user_id, habit_id) values (goal, me, habit)
  on conflict (goal_id, user_id) do update set habit_id = excluded.habit_id;
  return 'linked';
end $$;

create or replace function public.circle_react(to_whom uuid, goal uuid, on_day date, reaction text) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); c uuid := public._my_circle();
begin
  if reaction not in ('cheer', 'nudge') or to_whom = me then return 'invalid'; end if;
  if not exists (select 1 from public.circle_goals where id = goal and circle_id = c)
     or not exists (select 1 from public.circle_members where circle_id = c and user_id = to_whom and status = 'active') then
    return 'not_found';
  end if;
  insert into public.circle_reactions (circle_id, goal_id, from_user, to_user, day, kind)
  values (c, goal, me, to_whom, on_day, reaction) on conflict do nothing;
  return 'ok';
end $$;

-- ---------- everything the Circle screen needs, in one call ----------
create or replace function public.circle_state(on_day date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); c uuid; inv record; result jsonb;
begin
  if me is null then return null; end if;
  select m.circle_id, m.invited_by, ci.name into inv
  from public.circle_members m join public.circles ci on ci.id = m.circle_id
  where m.user_id = me and m.status = 'invited';
  c := public._my_circle();
  result := jsonb_build_object(
    'me', me,
    'invite', case when inv.circle_id is null then null else jsonb_build_object(
      'circle', inv.name, 'from', public._display_name(inv.invited_by),
      'size', (select count(*) from public.circle_members where circle_id = inv.circle_id and status = 'active')) end,
    'circle', null);
  if c is null then return result; end if;
  return result || jsonb_build_object('circle', jsonb_build_object(
    'id', c,
    'name', (select name from public.circles where id = c),
    'owner', (select owner from public.circles where id = c),
    'members', (select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', m.user_id, 'name', public._display_name(m.user_id), 'status', m.status) order by m.created_at), '[]'::jsonb)
      from public.circle_members m where m.circle_id = c),
    'goals', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'emoji', g.emoji, 'created_by', g.created_by,
        'links', (select coalesce(jsonb_agg(jsonb_build_object(
            'user_id', l.user_id, 'habit_id', l.habit_id, 'habit', h.name,
            -- last 30 days, oldest first: 'd' done, 'm' missed, '-' open / not tracked yet
            'days', (select string_agg(case when d.day < h.created_day then '-' else coalesce(left(hl.status, 1), '-') end, '' order by d.day)
                     from generate_series(on_day - 29, on_day, interval '1 day') as d(day)
                     left join public.habit_logs hl on hl.user_id = l.user_id and hl.habit_id = l.habit_id and hl.day = d.day::date)
          )), '[]'::jsonb)
          from public.circle_links l join public.habits h on h.id = l.habit_id
          join public.circle_members cm on cm.circle_id = c and cm.user_id = l.user_id and cm.status = 'active'
          where l.goal_id = g.id)
      ) order by g.created_at), '[]'::jsonb)
      from public.circle_goals g where g.circle_id = c),
    'reactions', (select coalesce(jsonb_agg(jsonb_build_object(
        'from', r.from_user, 'to', r.to_user, 'goal', r.goal_id, 'kind', r.kind)), '[]'::jsonb)
      from public.circle_reactions r where r.circle_id = c and r.day = on_day)
  ));
end $$;

revoke all on function public._my_circle(), public._display_name(uuid), public.circle_search(text), public.circle_invite(uuid),
  public.circle_respond(boolean), public.circle_remove(uuid), public.circle_add_goal(text, text), public.circle_delete_goal(uuid),
  public.circle_link(uuid, uuid), public.circle_react(uuid, uuid, date, text), public.circle_state(date) from public, anon;
grant execute on function public.circle_search(text), public.circle_invite(uuid), public.circle_respond(boolean), public.circle_remove(uuid),
  public.circle_add_goal(text, text), public.circle_delete_goal(uuid), public.circle_link(uuid, uuid),
  public.circle_react(uuid, uuid, date, text), public.circle_state(date) to authenticated;
