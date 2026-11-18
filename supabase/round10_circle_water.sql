-- Sky · round 10: Circle shows each friend's water today. Already applied. Safe to re-run.
-- Same as before, plus 'amount' (ml today from habit_amounts) on every linked habit.
CREATE OR REPLACE FUNCTION public._circle_json(c uuid, on_day date)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
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
        'from', r.from_user, 'to', r.to_user, 'goal', r.goal_id, 'kind', r.kind, 'msg', r.message, 'at', r.created_at, 'times', r.times)
        order by r.created_at), '[]'::jsonb)
      from public.circle_reactions r where r.circle_id = c and r.day = on_day)
  )
$function$;
