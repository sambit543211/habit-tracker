-- Keep · Habit Tracker — round 6: nudges as real notifications. Safe to re-run.
-- Run it all at once in the SQL Editor (Supabase → SQL Editor → New query → paste → Run).

-- ---------- settings (Me → Settings → Reminders) ----------
alter table public.profiles
  add column if not exists nudges_enabled boolean not null default true,
  add column if not exists cheers_enabled boolean not null default true,
  add column if not exists office_hours boolean not null default true,
  add column if not exists office_start time not null default '10:00',
  add column if not exists office_end time not null default '17:00',
  add column if not exists muted_circles uuid[] not null default '{}';

-- ---------- a short message with each nudge / cheer ----------
alter table public.circle_reactions add column if not exists message text;

-- "Hima did Gym after your nudge"
alter table public.circle_events drop constraint if exists circle_events_kind_check;
alter table public.circle_events add constraint circle_events_kind_check check (kind in ('invited', 'accepted', 'declined', 'nudge_worked'));
alter table public.circle_events add column if not exists goal_id uuid references public.circle_goals on delete cascade;

-- ---------- instant delivery: wake the push function as soon as something social happens ----------
create or replace function public._ping_push() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://ybzfvipjezwoyfjnqxmg.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-secret', (select value from public.app_secrets where name = 'cron_secret')),
    body := '{"only":"social"}'::jsonb);
  return null;
end $$;
revoke all on function public._ping_push() from public, anon, authenticated;

drop trigger if exists ping_on_reaction on public.circle_reactions;
create trigger ping_on_reaction after insert on public.circle_reactions
  for each statement execute function public._ping_push();
drop trigger if exists ping_on_event on public.circle_events;
create trigger ping_on_event after insert on public.circle_events
  for each statement execute function public._ping_push();

-- ---------- nudge / cheer with an optional message ----------
create or replace function public.circle_react(to_whom uuid, goal uuid, on_day date, reaction text, msg text) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); c uuid := (select circle_id from public.circle_goals where id = goal);
begin
  if reaction not in ('cheer', 'nudge') or to_whom = me then return 'invalid'; end if;
  if c is null or not public._member(c)
     or not exists (select 1 from public.circle_members where circle_id = c and user_id = to_whom and status = 'active') then
    return 'not_found';
  end if;
  -- No point nudging someone who already did it.
  if reaction = 'nudge' and exists (
    select 1 from public.circle_links l
    join public.habit_logs hl on hl.user_id = l.user_id and hl.habit_id = l.habit_id and hl.day = on_day and hl.status = 'done'
    where l.goal_id = goal and l.user_id = to_whom) then
    return 'already_done';
  end if;
  insert into public.circle_reactions (circle_id, goal_id, from_user, to_user, day, kind, message)
  values (c, goal, me, to_whom, on_day, reaction, nullif(left(trim(coalesce(msg, '')), 80), ''))
  on conflict do nothing;
  return case when found then 'ok' else 'already_sent' end;
end $$;

-- Nudge everyone in the goal who hasn't done it today. Returns how many were nudged.
create or replace function public.circle_nudge_all(goal uuid, on_day date, msg text) returns int
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); c uuid := (select circle_id from public.circle_goals where id = goal); n int;
begin
  if c is null or not public._member(c) then return 0; end if;
  insert into public.circle_reactions (circle_id, goal_id, from_user, to_user, day, kind, message)
  select c, goal, me, l.user_id, on_day, 'nudge', nullif(left(trim(coalesce(msg, '')), 80), '')
  from public.circle_links l
  join public.circle_members cm on cm.circle_id = c and cm.user_id = l.user_id and cm.status = 'active'
  where l.goal_id = goal and l.user_id <> me
    and not exists (select 1 from public.habit_logs hl where hl.user_id = l.user_id and hl.habit_id = l.habit_id and hl.day = on_day and hl.status = 'done')
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.circle_react(uuid, uuid, date, text, text), public.circle_nudge_all(uuid, date, text) from public, anon;
grant execute on function public.circle_react(uuid, uuid, date, text, text), public.circle_nudge_all(uuid, date, text) to authenticated;

-- ---------- "Your nudge worked": done within 3 hours of a nudge ----------
create or replace function public._nudge_worked() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'done' then return new; end if;
  insert into public.circle_events (to_user, actor, kind, circle_id, goal_id)
  select distinct r.from_user, new.user_id, 'nudge_worked', r.circle_id, r.goal_id
  from public.circle_reactions r
  join public.circle_links l on l.goal_id = r.goal_id and l.user_id = new.user_id and l.habit_id = new.habit_id
  where r.to_user = new.user_id and r.kind = 'nudge' and r.day = new.day and r.created_at > now() - interval '3 hours'
    and not exists (select 1 from public.circle_events e
                    where e.kind = 'nudge_worked' and e.to_user = r.from_user and e.actor = new.user_id
                      and e.goal_id = r.goal_id and e.created_at > now() - interval '20 hours');
  return new;
end $$;
revoke all on function public._nudge_worked() from public, anon, authenticated;
drop trigger if exists nudge_worked on public.habit_logs;
create trigger nudge_worked after insert or update of status on public.habit_logs
  for each row execute function public._nudge_worked();

-- ---------- reactions now carry their message and time ----------
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
        'from', r.from_user, 'to', r.to_user, 'goal', r.goal_id, 'kind', r.kind, 'msg', r.message, 'at', r.created_at)
        order by r.created_at), '[]'::jsonb)
      from public.circle_reactions r where r.circle_id = c and r.day = on_day)
  )
$$;
revoke all on function public._circle_json(uuid, date) from public, anon, authenticated;

-- In-app toasts: accepted / declined / nudge worked (with circle and goal names).
create or replace function public.circle_inbox() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); out jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('kind', e.kind, 'name', public._display_name(e.actor), 'circle', ci.name, 'goal', g.name, 'at', e.created_at)
         order by e.created_at desc), '[]'::jsonb)
  into out from public.circle_events e
  left join public.circles ci on ci.id = e.circle_id
  left join public.circle_goals g on g.id = e.goal_id
  where e.to_user = me and not e.seen and e.kind <> 'invited';
  update public.circle_events set seen = true where to_user = me and not seen and kind <> 'invited';
  return out;
end $$;
