/**
 * Pure mapping + diffing between the local store shape and database rows.
 * Kept free of I/O so it can be unit-tested.
 */
import type { Data, Habit, HabitLog, Plan } from '../types';

export interface HabitRow {
  id: string;
  user_id: string;
  name: string;
  cue: string | null;
  tiny: string | null;
  created_day: string;
  archived_day: string | null;
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
}

export const habitToRow = (h: Habit, user_id: string): HabitRow => ({
  id: h.id,
  user_id,
  name: h.name,
  cue: h.cue ?? null,
  tiny: h.tiny ?? null,
  created_day: h.createdDay,
  archived_day: h.archivedDay ?? null,
});

export const rowToHabit = (r: HabitRow): Habit => ({
  id: r.id,
  name: r.name,
  cue: r.cue ?? undefined,
  tiny: r.tiny ?? undefined,
  createdDay: r.created_day,
  archivedDay: r.archived_day ?? undefined,
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
});

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
  | { table: 'habit_logs'; kind: 'delete'; key: string; day: string; habit_id: string };

interface Snapshot extends Data {
  onboarded: boolean;
}

/** Compute the database operations needed to go from `prev` to `next`. */
export function diff(prev: Snapshot, next: Snapshot, user_id: string, timezone: string): Op[] {
  const ops: Op[] = [];

  if (prev.startDay !== next.startDay || prev.onboarded !== next.onboarded) {
    ops.push({
      table: 'profiles',
      kind: 'upsert',
      key: 'profiles',
      row: { user_id, start_day: next.startDay ?? null, onboarded: next.onboarded, timezone },
    });
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

  return ops;
}

/** Every row in a snapshot, as upserts — used to upload local data to an empty account. */
export function fullUpload(s: Snapshot, user_id: string, timezone: string): Op[] {
  const empty: Snapshot = { habits: [], plans: [], logs: {}, startDay: undefined, onboarded: false };
  return diff(empty, s, user_id, timezone);
}
