-- Keep · Habit Tracker — step 4: smarter reminders, streak shields, partner. Safe to re-run.
alter table public.profiles add column if not exists brief_reminder boolean not null default true;
alter table public.profiles add column if not exists lastcall_reminder boolean not null default true;
alter table public.profiles add column if not exists paused_reminders text[] not null default '{}';
alter table public.profiles add column if not exists streak_shields boolean not null default true;
alter table public.profiles add column if not exists partner_name text;

-- Did the user open the app after a nudge? Used to pause nudges that keep being ignored.
alter table public.notification_log add column if not exists acted boolean not null default false;

create or replace function public.mark_notifications_acted()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notification_log
     set acted = true
   where user_id = (select auth.uid())
     and acted = false
     and sent_at > now() - interval '3 hours';
$$;
revoke all on function public.mark_notifications_acted() from public, anon;
grant execute on function public.mark_notifications_acted() to authenticated;
