-- Keep · Habit Tracker — round 5: be in several circles. Safe to re-run.
-- Up to 5 circles per person, up to 6 people per circle. Every action names its circle.
-- The old one-circle functions stay (unchanged) so older app versions keep working.

drop index if exists public.circle_members_one_per_user;
alter table public.circle_events add column if not exists circle_id uuid references public.circles on delete cascade;

-- Am I an active member of circle c?
create or replace function public._member(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.circle_members where circle_id = c and user_id = (select auth.uid()) and status = 'active')
$$;

create or replace function public._circle_count(u uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.circle_members where user_id = u and status = 'active'
$$;

-- ---------- create ----------
create or replace function public.circle_create(circle_name text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); c uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  if public._circle_count(me) >= 5 then raise exception 'You can be in up to 5 circles'; end if;
  insert into public.circles (name, owner)
  values (coalesce(nullif(left(trim(circle_name), 40), ''), public._display_name(me) || '''s circle'), me) returning id into c;
  insert into public.circle_members (circle_id, user_id, status) values (c, me, 'active');
  return c;
end $$;

-- ---------- invite (c null = start a new circle) ----------
create or replace function public.circle_invite_to(c uuid, target uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); st text;
begin
  if me is null then raise exception 'not signed in'; end if;
  if target = me then return 'self'; end if;
  if not exists (select 1 from auth.users where id = target) then return 'not_found'; end if;
  if c is null then c := public.circle_create(null);
  elsif not public._member(c) then return 'not_member'; end if;
  select status into st from public.circle_members where circle_id = c and user_id = target;
  if st = 'active' then return 'already_member'; end if;
  if st = 'invited' then return 'already_invited'; end if;
  if (select count(*) from public.circle_members where circle_id = c) >= 6 then return 'full'; end if;
  if public._circle_count(target) >= 5 then return 'they_have_too_many'; end if;
  insert into public.circle_members (circle_id, user_id, status, invited_by) values (c, target, 'invited', me);
  insert into public.circle_events (to_user, actor, kind, circle_id) values (target, me, 'invited', c);
  return 'invited';
end $$;

-- ---------- answer an invite ----------
create or replace function public.circle_answer(c uuid, accept boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); inviter uuid;
begin
  select invited_by into inviter from public.circle_members where circle_id = c and user_id = me and status = 'invited';
  if not found then return 'no_invite'; end if;
  if accept then
    if public._circle_count(me) >= 5 then return 'too_many'; end if;
    update public.circle_members set status = 'active' where circle_id = c and user_id = me;
    update public.profiles set circle_enabled = true where user_id = me;
  else
    delete from public.circle_members where circle_id = c and user_id = me;
  end if;
  if inviter is not null then
    insert into public.circle_events (to_user, actor, kind, circle_id) values (inviter, me, case when accept then 'accepted' else 'declined' end, c);
  end if;
  update public.circle_events set seen = true where to_user = me and kind = 'invited' and circle_id = c and not seen;
  return 'ok';
end $$;

-- ---------- leave / remove someone / cancel an invite ----------
create or replace function public.circle_leave(c uuid, target uuid default null) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); who uuid := coalesce(target, (select auth.uid()));
begin
  if not public._member(c) then return 'not_member'; end if;
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

-- ---------- goals, links, reactions (circle comes from the goal) ----------
create or replace function public.circle_new_goal(c uuid, goal_name text, goal_emoji text default '🎯') returns uuid
language plpgsql security definer set search_path = '' as $$
declare g uuid;
begin
  if not public._member(c) then raise exception 'not in this circle'; end if;
  if length(trim(goal_name)) = 0 then raise exception 'name required'; end if;
  if (select count(*) from public.circle_goals where circle_id = c) >= 8 then raise exception 'too many goals'; end if;
  insert into public.circle_goals (circle_id, name, emoji, created_by)
  values (c, left(trim(goal_name), 40), left(coalesce(goal_emoji, '🎯'), 8), (select auth.uid())) returning id into g;
  return g;
end $$;

create or replace function public.circle_delete_goal(goal uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); c uuid := (select circle_id from public.circle_goals where id = goal);
begin
  if c is null or not public._member(c) then return 'not_found'; end if;
  delete from public.circle_goals g where g.id = goal
    and (g.created_by = me or exists (select 1 from public.circles where id = c and owner = me));
  return 'ok';
end $$;

create or replace function public.circle_link(goal uuid, habit uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); c uuid := (select circle_id from public.circle_goals where id = goal);
begin
  if c is null or not public._member(c) then return 'not_found'; end if;
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
declare me uuid := (select auth.uid()); c uuid := (select circle_id from public.circle_goals where id = goal);
begin
  if reaction not in ('cheer', 'nudge') or to_whom = me then return 'invalid'; end if;
  if c is null or not public._member(c)
     or not exists (select 1 from public.circle_members where circle_id = c and user_id = to_whom and status = 'active') then
    return 'not_found';
  end if;
  insert into public.circle_reactions (circle_id, goal_id, from_user, to_user, day, kind)
  values (c, goal, me, to_whom, on_day, reaction) on conflict do nothing;
  return 'ok';
end $$;

-- ---------- one circle as JSON (members, goals with 30-day ticks, today's reactions) ----------
create or replace function public._circle_json(c uuid, on_day date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
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
  )
$$;

-- Everything the Circle screen needs: my pending invites and every circle I'm in.
create or replace function public.circle_state_all(on_day date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then return null; end if;
  return jsonb_build_object(
    'me', me,
    'invites', (select coalesce(jsonb_agg(jsonb_build_object(
        'circle_id', m.circle_id, 'circle', ci.name, 'from', public._display_name(m.invited_by),
        'size', (select count(*) from public.circle_members x where x.circle_id = m.circle_id and x.status = 'active')) order by m.created_at), '[]'::jsonb)
      from public.circle_members m join public.circles ci on ci.id = m.circle_id
      where m.user_id = me and m.status = 'invited'),
    'circles', (select coalesce(jsonb_agg(public._circle_json(m.circle_id, on_day) order by m.created_at), '[]'::jsonb)
      from public.circle_members m where m.user_id = me and m.status = 'active'));
end $$;

-- Unseen accept/decline events for me (with the circle's name); marks them seen.
create or replace function public.circle_inbox() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); out jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('kind', e.kind, 'name', public._display_name(e.actor), 'circle', ci.name, 'at', e.created_at) order by e.created_at desc), '[]'::jsonb)
  into out from public.circle_events e left join public.circles ci on ci.id = e.circle_id
  where e.to_user = me and not e.seen and e.kind <> 'invited';
  update public.circle_events set seen = true where to_user = me and not seen and kind <> 'invited';
  return out;
end $$;

revoke all on function public._member(uuid), public._circle_count(uuid), public._circle_json(uuid, date) from public, anon, authenticated;
revoke all on function public.circle_create(text), public.circle_invite_to(uuid, uuid), public.circle_answer(uuid, boolean),
  public.circle_leave(uuid, uuid), public.circle_new_goal(uuid, text, text), public.circle_state_all(date) from public, anon;
grant execute on function public.circle_create(text), public.circle_invite_to(uuid, uuid), public.circle_answer(uuid, boolean),
  public.circle_leave(uuid, uuid), public.circle_new_goal(uuid, text, text), public.circle_state_all(date) to authenticated;
