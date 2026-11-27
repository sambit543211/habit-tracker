-- Sky · round 14: receipts + entry times for Money, and quitting together in Circle.
-- Safe to re-run. Only adds things.

-- 1. Money: when an entry was last changed, and its receipt photo (a path in the "receipts" bucket).
alter table public.expenses add column if not exists edited_at timestamptz;
alter table public.expenses add column if not exists receipt text;

-- 2. Receipt photos: a private bucket. Each person can only see and change files in their own folder (<user id>/…).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'receipts: own files') then
    create policy "receipts: own files" on storage.objects for all to authenticated
      using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text)
      with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
end $$;

-- 3. Circle: members who chose "Share with my circles" in Quit show their quit progress.
--    Only counts per day are shared: d = smoke-free, p = fewer than before, m = as many as before, - = not started.
create or replace function public._circle_json(c uuid, on_day date) returns jsonb
language sql stable security definer set search_path = '' as $function$
  select jsonb_build_object(
    'id', c,
    'name', (select name from public.circles where id = c),
    'owner', (select owner from public.circles where id = c),
    'members', (select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', m.user_id, 'name', public._display_name(m.user_id), 'status', m.status,
        'notify', exists (select 1 from public.push_subscriptions ps where ps.user_id = m.user_id)
                  and coalesce((select pr.reminders_enabled and pr.nudges_enabled from public.profiles pr where pr.user_id = m.user_id), false)
        ) order by m.created_at), '[]'::jsonb)
      from public.circle_members m where m.circle_id = c),
    'goals', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'emoji', g.emoji, 'created_by', g.created_by,
        'links', (select coalesce(jsonb_agg(jsonb_build_object(
            'user_id', l.user_id, 'habit_id', l.habit_id, 'habit', h.name,
            'amount', (select ha.amount from public.habit_amounts ha where ha.user_id = l.user_id and ha.habit_id = l.habit_id and ha.day = on_day),
            'days', (select string_agg(
                       case
                         when d.day < h.created_day then '-'
                         when hl.status = 'done' and jsonb_typeof(h.parts) = 'array' and jsonb_typeof(hl.parts) = 'array'
                              and (select coalesce(sum((p->>'weight')::int), 0) from jsonb_array_elements(h.parts) p where hl.parts ? (p->>'id')) < 100
                           then 'p'
                         else coalesce(left(hl.status, 1), '-')
                       end, '' order by d.day)
                     from generate_series(on_day - 29, on_day, interval '1 day') as d(day)
                     left join public.habit_logs hl on hl.user_id = l.user_id and hl.habit_id = l.habit_id and hl.day = d.day::date)
          )), '[]'::jsonb)
          from public.circle_links l join public.habits h on h.id = l.habit_id
          join public.circle_members cm on cm.circle_id = c and cm.user_id = l.user_id and cm.status = 'active'
          where l.goal_id = g.id)
      ) order by g.created_at), '[]'::jsonb)
      from public.circle_goals g where g.circle_id = c),
    'quit', (select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'baseline', (pr.quit->>'baseline')::int,
        'today', (select count(*) from public.smoke_events se where se.user_id = m.user_id and se.kind = 'smoked' and se.day = on_day),
        'cravings', (select count(*) from public.smoke_events se where se.user_id = m.user_id and se.kind = 'craving_passed' and se.day = on_day),
        'last_at', (select max(se.at) from public.smoke_events se where se.user_id = m.user_id and se.kind = 'smoked'),
        'start', pr.quit->>'startDay',
        'days', (select string_agg(
                   case
                     when d.day::date < (pr.quit->>'startDay')::date then '-'
                     when coalesce(n.cnt, 0) = 0 then 'd'
                     when n.cnt < (pr.quit->>'baseline')::int then 'p'
                     else 'm'
                   end, '' order by d.day)
                 from generate_series(on_day - 29, on_day, interval '1 day') as d(day)
                 left join lateral (select count(*) as cnt from public.smoke_events se
                                    where se.user_id = m.user_id and se.kind = 'smoked' and se.day = d.day::date) n on true)
        ) order by m.created_at), '[]'::jsonb)
      from public.circle_members m join public.profiles pr on pr.user_id = m.user_id
      where m.circle_id = c and m.status = 'active'
        and pr.quit->>'enabled' = 'true' and pr.quit->>'share' = 'true'
        and (pr.quit->>'baseline') ~ '^\d+$' and (pr.quit->>'startDay') ~ '^\d{4}-\d{2}-\d{2}$'),
    'reactions', (select coalesce(jsonb_agg(jsonb_build_object(
        'from', r.from_user, 'to', r.to_user, 'goal', r.goal_id, 'kind', r.kind, 'msg', r.message, 'at', r.created_at, 'times', r.times)
        order by r.created_at), '[]'::jsonb)
      from public.circle_reactions r where r.circle_id = c and r.day = on_day)
  )
$function$;
revoke all on function public._circle_json(uuid, date) from public, anon, authenticated;
