-- Sky · round 11: combo habits (2–3 parts with weights). Already applied. Safe to re-run. Only adds things.
alter table public.habits add column if not exists parts jsonb;      -- [{id, name, weight, from?}]
alter table public.habit_logs add column if not exists parts jsonb;  -- ids of the parts done that day
-- Circle: _circle_json now reports a part-done combo day as 'p' (orange, still keeps the streak).
-- Live definition was updated with CREATE OR REPLACE (see round10_circle_water.sql for the full body; the
-- 'days' expression adds: when status = 'done' and the done parts' weights < 100 then 'p').
