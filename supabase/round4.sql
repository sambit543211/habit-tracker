-- Keep · Habit Tracker — round 4. Safe to re-run.
-- 1. Habit order (drag to reorder on Me)
-- 2. Start fresh: wipe history and start counting from a chosen day
-- 3. Circle events: "X invited you", "X accepted / declined your invite"

-- ---------- 1. habit order ----------
alter table public.habits add column if not exists position int;
update public.habits h set position = o.rn
from (select id, row_number() over (partition by user_id order by created_day, name) as rn from public.habits) o
where o.id = h.id and h.position is null;

-- ---------- 2. start fresh ----------
-- Keeps your habits (and plans from p_day on); deletes every check-in, earlier plan,
-- reflection, weekly review and smoke log; habits and the account start counting on p_day.
create or replace function public.start_fresh(p_day date) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_day < current_date - 1 or p_day > current_date + 7 then raise exception 'pick a day close to today'; end if;
  delete from public.habit_logs where user_id = me;
  delete from public.plans where user_id = me and day < p_day;
  delete from public.reflections where user_id = me;
  delete from public.weekly_reviews where user_id = me;
  delete from public.smoke_events where user_id = me;
  delete from public.habits where user_id = me and archived_day is not null;
  update public.habits set created_day = p_day where user_id = me;
  update public.profiles set start_day = p_day where user_id = me;
  return 'ok';
end $$;
revoke all on function public.start_fresh(date) from public, anon;
grant execute on function public.start_fresh(date) to authenticated;

-- ---------- 3. circle events ----------
create table if not exists public.circle_events (
  id bigint generated always as identity primary key,
  to_user uuid not null references auth.users on delete cascade,
  actor uuid references auth.users on delete set null,
  kind text not null check (kind in ('invited', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  pushed boolean not null default false,
  seen boolean not null default false
);
create index if not exists circle_events_to_user on public.circle_events (to_user) where not seen;
alter table public.circle_events enable row level security;
revoke all on public.circle_events from anon, authenticated;

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
  insert into public.circle_events (to_user, actor, kind) values (target, me, 'invited');
  return 'invited';
end $$;

create or replace function public.circle_respond(accept boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); inviter uuid;
begin
  select invited_by into inviter from public.circle_members where user_id = me and status = 'invited';
  if accept then
    update public.circle_members set status = 'active' where user_id = me and status = 'invited';
    update public.profiles set circle_enabled = true where user_id = me;
  else
    delete from public.circle_members where user_id = me and status = 'invited';
  end if;
  if inviter is not null then
    insert into public.circle_events (to_user, actor, kind) values (inviter, me, case when accept then 'accepted' else 'declined' end);
  end if;
  -- The invite has been answered: drop its "invited" notice.
  update public.circle_events set seen = true where to_user = me and kind = 'invited' and not seen;
  return 'ok';
end $$;

-- Unseen events for me, newest first; marks them seen.
create or replace function public.circle_inbox() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); out jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('kind', e.kind, 'name', public._display_name(e.actor), 'at', e.created_at) order by e.created_at desc), '[]'::jsonb)
  into out from public.circle_events e where e.to_user = me and not e.seen and e.kind <> 'invited';
  update public.circle_events set seen = true where to_user = me and not seen and kind <> 'invited';
  return out;
end $$;

revoke all on function public.circle_invite(uuid), public.circle_respond(boolean), public.circle_inbox() from public, anon;
grant execute on function public.circle_invite(uuid), public.circle_respond(boolean), public.circle_inbox() to authenticated;
