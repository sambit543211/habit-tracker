/**
 * Pure mapping + diffing between the local store shape and database rows.
 * Kept free of I/O so it can be unit-tested.
 */
import { DEFAULT_PROFILE, type Data, type Habit, type HabitLog, type Plan, type Profile, type Reminders, type WeeklyReview } from '../types';
import type { Snapshot } from './merge';

export interface HabitRow {
  id: string;
  user_id: string;
  name: string;
  cue: string | null;
  tiny: string | null;
  created_day: string;
  archived_day: string | null;
  remind_at: string | null;
  pair_with: string | null;
}

export interface PlanRow {
  id: string;
  user_id: string;
  title: string;
  day: string;
  must: boolean;
  status: Plan['status'];
  miss: Plan['miss'] | null;
  carry_count: number;
  carried_to: string | null;
  created_at: string;
  note: string | null;
  start_time: string | null;
  duration_min: number | null;
  remind_offset: number | null;
  remind_at: string | null;
  obstacle: string | null;
  if_then: string | null;
}

export interface ReflectionRow {
  user_id: string;
  day: string;
  text: string;
}

export interface ReviewRow {
  user_id: string;
  week_start: string;
  went_well: string | null;
  change: string | null;
  experiment: string | null;
}

export interface LogRow {
  user_id: string;
  day: string;
  habit_id: string;
  status: HabitLog['status'];
  miss: HabitLog['miss'] | null;
  at: string;
}

export interface ProfileRow {
  user_id: string;
  start_day: string | null;
  onboarded: boolean;
  timezone: string;
  reminders_enabled?: boolean;
  morning_reminder?: string | null;
  evening_reminder?: string | null;
  streak_reminder?: string | null;
  display_name?: string | null;
  wake_time?: string;
  sleep_time?: string;
}

/** Postgres returns "HH:MM:SS"; the app uses "HH:MM". */
export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);

export const profileToRow = (s: Snapshot, user_id: string, timezone: string): ProfileRow => {
  const row: ProfileRow = { user_id, start_day: s.startDay ?? null, onboarded: s.onboarded, timezone };
  if (s.reminders) {
    row.reminders_enabled = s.reminders.enabled;
    row.morning_reminder = s.reminders.morning;
    row.evening_reminder = s.reminders.evening;
    row.streak_reminder = s.reminders.streak;
  }
  if (s.profile) {
    row.display_name = s.profile.name?.trim() || null;
    row.wake_time = s.profile.wake;
    row.sleep_time = s.profile.sleep;
  }
  return row;
};

export const rowToProfile = (r: ProfileRow): Profile => ({
  name: r.display_name ?? undefined,
  wake: hhmm(r.wake_time) ?? DEFAULT_PROFILE.wake,
  sleep: hhmm(r.sleep_time) ?? DEFAULT_PROFILE.sleep,
});

export const rowToReminders = (r: ProfileRow): Reminders => ({
  enabled: r.reminders_enabled ?? true,
  morning: hhmm(r.morning_reminder),
  evening: hhmm(r.evening_reminder),
  streak: hhmm(r.streak_reminder),
});

export const habitToRow = (h: Habit, user_id: string): HabitRow => ({
  id: h.id,
  user_id,
  name: h.name,
  cue: h.cue ?? null,
  tiny: h.tiny ?? null,
  created_day: h.createdDay,
  archived_day: h.archivedDay ?? null,
  remind_at: h.remindAt ?? null,
  pair_with: h.pairWith ?? null,
});

export const rowToHabit = (r: HabitRow): Habit => ({
  id: r.id,
  name: r.name,
  cue: r.cue ?? undefined,
  tiny: r.tiny ?? undefined,
  createdDay: r.created_day,
  archivedDay: r.archived_day ?? undefined,
  remindAt: hhmm(r.remind_at) ?? undefined,
  pairWith: r.pair_with ?? undefined,
});

export const planToRow = (p: Plan, user_id: string): PlanRow => ({
  id: p.id,
  user_id,
  title: p.title,
  day: p.day,
  must: p.must,
  status: p.status,
  miss: p.miss ?? null,
  carry_count: p.carryCount,
  carried_to: p.carriedTo ?? null,
  created_at: new Date(p.createdAt).toISOString(),
  note: p.note || null,
  start_time: p.start ?? null,
  duration_min: p.start ? Math.max(15, p.duration ?? 15) : null,
  remind_offset: p.remindOffset ?? null,
  remind_at: p.remindAt ?? null,
  obstacle: p.obstacle || null,
  if_then: p.ifThen || null,
});

export const rowToPlan = (r: PlanRow): Plan => ({
  id: r.id,
  title: r.title,
  day: r.day,
  must: r.must,
  status: r.status,
  miss: r.miss ?? undefined,
  carryCount: r.carry_count,
  carriedTo: r.carried_to ?? undefined,
  createdAt: new Date(r.created_at).getTime(),
  note: r.note ?? undefined,
  start: hhmm(r.start_time) ?? undefined,
  duration: r.duration_min ?? undefined,
  remindOffset: r.remind_offset ?? undefined,
  remindAt: hhmm(r.remind_at) ?? undefined,
  obstacle: r.obstacle ?? undefined,
  ifThen: r.if_then ?? undefined,
});

export const rowsToReflections = (rows: ReflectionRow[]) =>
  Object.fromEntries(rows.map((r) => [r.day, r.text])) as Record<string, string>;

export const rowsToReviews = (rows: ReviewRow[]) =>
  Object.fromEntries(
    rows.map((r) => [
      r.week_start,
      { wentWell: r.went_well ?? undefined, change: r.change ?? undefined, experiment: r.experiment ?? undefined } as WeeklyReview,
    ]),
  );

export const logToRow = (day: string, habit_id: string, l: HabitLog, user_id: string): LogRow => ({
  user_id,
  day,
  habit_id,
  status: l.status,
  miss: l.miss ?? null,
  at: new Date(l.at || Date.now()).toISOString(),
});

export const rowsToLogs = (rows: LogRow[]): Data['logs'] => {
  const logs: Data['logs'] = {};
  for (const r of rows) {
    (logs[r.day] ??= {})[r.habit_id] = {
      status: r.status,
      miss: r.miss ?? undefined,
      at: new Date(r.at).getTime(),
    };
  }
  return logs;
};

// ---------- Outbox operations ----------

export type Op =
  | { table: 'profiles'; kind: 'upsert'; key: string; row: ProfileRow }
  | { table: 'habits'; kind: 'upsert'; key: string; row: HabitRow }
  | { table: 'habits'; kind: 'delete'; key: string; id: string }
  | { table: 'plans'; kind: 'upsert'; key: string; row: PlanRow }
  | { table: 'plans'; kind: 'delete'; key: string; id: string }
  | { table: 'habit_logs'; kind: 'upsert'; key: string; row: LogRow }
  | { table: 'habit_logs'; kind: 'delete'; key: string; day: string; habit_id: string }
  | { table: 'reflections'; kind: 'upsert'; key: string; row: ReflectionRow }
  | { table: 'reflections'; kind: 'delete'; key: string; day: string }
  | { table: 'weekly_reviews'; kind: 'upsert'; key: string; row: ReviewRow };

/** Compute the database operations needed to go from `prev` to `next`. */
export function diff(prev: Snapshot, next: Snapshot, user_id: string, timezone: string): Op[] {
  const ops: Op[] = [];

  if (
    prev.startDay !== next.startDay ||
    prev.onboarded !== next.onboarded ||
    prev.reminders !== next.reminders ||
    prev.profile !== next.profile
  ) {
    ops.push({ table: 'profiles', kind: 'upsert', key: 'profiles', row: profileToRow(next, user_id, timezone) });
  }

  if (prev.habits !== next.habits) {
    const before = new Map(prev.habits.map((h) => [h.id, h]));
    for (const h of next.habits) {
      if (before.get(h.id) !== h) ops.push({ table: 'habits', kind: 'upsert', key: `habits:${h.id}`, row: habitToRow(h, user_id) });
      before.delete(h.id);
    }
    for (const id of before.keys()) ops.push({ table: 'habits', kind: 'delete', key: `habits:${id}`, id });
  }

  if (prev.plans !== next.plans) {
    const before = new Map(prev.plans.map((p) => [p.id, p]));
    for (const p of next.plans) {
      if (before.get(p.id) !== p) ops.push({ table: 'plans', kind: 'upsert', key: `plans:${p.id}`, row: planToRow(p, user_id) });
      before.delete(p.id);
    }
    for (const id of before.keys()) ops.push({ table: 'plans', kind: 'delete', key: `plans:${id}`, id });
  }

  if (prev.logs !== next.logs) {
    const days = new Set([...Object.keys(prev.logs), ...Object.keys(next.logs)]);
    for (const day of days) {
      const a = prev.logs[day] ?? {};
      const b = next.logs[day] ?? {};
      if (a === b) continue;
      for (const habit_id of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const key = `habit_logs:${day}:${habit_id}`;
        if (!b[habit_id]) ops.push({ table: 'habit_logs', kind: 'delete', key, day, habit_id });
        else if (a[habit_id] !== b[habit_id])
          ops.push({ table: 'habit_logs', kind: 'upsert', key, row: logToRow(day, habit_id, b[habit_id], user_id) });
      }
    }
  }

  if (prev.reflections !== next.reflections) {
    const a = prev.reflections ?? {};
    const b = next.reflections ?? {};
    for (const day of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const key = `reflections:${day}`;
      if (!b[day]) ops.push({ table: 'reflections', kind: 'delete', key, day });
      else if (a[day] !== b[day]) ops.push({ table: 'reflections', kind: 'upsert', key, row: { user_id, day, text: b[day] } });
    }
  }

  if (prev.weeklyReviews !== next.weeklyReviews) {
    const a = prev.weeklyReviews ?? {};
    const b = next.weeklyReviews ?? {};
    for (const [week_start, r] of Object.entries(b)) {
      if (a[week_start] === r) continue;
      ops.push({
        table: 'weekly_reviews',
        kind: 'upsert',
        key: `weekly_reviews:${week_start}`,
        row: { user_id, week_start, went_well: r.wentWell || null, change: r.change || null, experiment: r.experiment || null },
      });
    }
  }

  return ops;
}

/** Every row in a snapshot, as upserts — used to upload local data to an empty account. */
export function fullUpload(s: Snapshot, user_id: string, timezone: string): Op[] {
  const empty: Snapshot = { habits: [], plans: [], logs: {}, startDay: undefined, onboarded: false };
  return diff(empty, s, user_id, timezone);
}
