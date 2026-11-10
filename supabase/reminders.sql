-- Keep · Habit Tracker — reminders (step 2). Safe to re-run.
-- 1. A server-only secrets table (RLS on, no policies, no grants).
-- 2. An RPC that exposes only the VAPID *public* key to signed-in users.
-- 3. A pg_cron job calling the send-reminders Edge Function every 5 minutes.

create table if not exists public.app_secrets (
  name text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

-- Random scheduler password, generated inside the database (never seen by anyone).
insert into public.app_secrets (name, value)
values ('cron_secret', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

create or replace function public.get_vapid_public_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$ select value from public.app_secrets where name = 'vapid_public' $$;
revoke all on function public.get_vapid_public_key() from public, anon;
grant execute on function public.get_vapid_public_key() to authenticated;

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('send-reminders') where exists (select 1 from cron.job where jobname = 'send-reminders');

select cron.schedule(
  'send-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://ybzfvipjezwoyfjnqxmg.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.app_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
