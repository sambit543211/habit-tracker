import type { Data, Habit, Plan, ReasonCode } from '../types';
import { addDays, range, weekday } from './date';

export const habitsOn = (data: Data, day: string): Habit[] =>
  data.habits.filter((h) => h.createdDay <= day && (!h.archivedDay || day < h.archivedDay));

export const plansOn = (data: Data, day: string): Plan[] =>
  data.plans.filter((p) => p.day === day);

export interface DayStats {
  habitsTotal: number;
  habitsDone: number;
  habitsMissed: number;
  plansTotal: number;
  plansDone: number;
  plansMissed: number;
  pending: number;
  habitPct: number | null;
  planPct: number | null;
  /** Efficacy 0–1: 50% habits + 50% plans. Falls back to whichever side exists. */
  score: number | null;
  perfectHabits: boolean;
}

export function dayStats(data: Data, day: string): DayStats {
  const habits = habitsOn(data, day);
  const log = data.logs[day] ?? {};
  let habitsDone = 0;
  let habitsMissed = 0;
  for (const h of habits) {
    const s = log[h.id]?.status;
    if (s === 'done') habitsDone++;
    else if (s === 'missed') habitsMissed++;
  }
  const plans = plansOn(data, day);
  const plansDone = plans.filter((p) => p.status === 'done').length;
  const plansMissed = plans.filter((p) => p.status === 'missed' || p.status === 'carried').length;

  const habitPct = habits.length ? habitsDone / habits.length : null;
  const planPct = plans.length ? plansDone / plans.length : null;
  const score =
    habitPct !== null && planPct !== null ? (habitPct + planPct) / 2 : (habitPct ?? planPct);

  return {
    habitsTotal: habits.length,
    habitsDone,
    habitsMissed,
    plansTotal: plans.length,
    plansDone,
    plansMissed,
    pending: habits.length - habitsDone - habitsMissed + (plans.length - plansDone - plansMissed),
    habitPct,
    planPct,
    score,
    perfectHabits: habits.length > 0 && habitsDone === habits.length,
  };
}

/**
 * Strict streak: consecutive days on which EVERY habit was done.
 * Today only extends the streak once complete, and an unfinished today
 * doesn't break it yet (you still have until the 2 am cutoff).
 *
 * Streak shields (optional): every 7 perfect days in a row earns a shield
 * (max 2 held). A missed day spends one instead of resetting the streak —
 * the day doesn't count, but the chain survives.
 */
export const SHIELD_EVERY = 7;
export const SHIELD_MAX = 2;

export function streak(data: Data, today: string, useShields = false) {
  const out = { current: 0, best: 0, todayDone: false, shields: 0, shieldedDays: [] as string[], toNextShield: SHIELD_EVERY };
  if (!data.startDay) return out;
  let run = 0;
  let best = 0;
  let shields = 0;
  let sinceEarn = 0;
  for (const d of range(data.startDay, today)) {
    if (dayStats(data, d).perfectHabits) {
      run++;
      best = Math.max(best, run);
      if (useShields && shields < SHIELD_MAX && ++sinceEarn >= SHIELD_EVERY) {
        shields++;
        sinceEarn = 0;
      }
    } else if (d !== today) {
      if (useShields && shields > 0 && run > 0) {
        shields--;
        out.shieldedDays.push(d);
      } else {
        run = 0;
        sinceEarn = 0;
      }
    }
  }
  out.current = run;
  out.best = best;
  out.shields = shields;
  out.toNextShield = shields >= SHIELD_MAX ? 0 : SHIELD_EVERY - sinceEarn;
  out.todayDone = dayStats(data, today).perfectHabits;
  return out;
}

/** Per-habit strict streak, same rules as `streak`. */
export function habitStreak(data: Data, habit: Habit, today: string) {
  let run = 0;
  for (const d of range(habit.createdDay, today)) {
    if (data.logs[d]?.[habit.id]?.status === 'done') run++;
    else if (d !== today) run = 0;
  }
  return run;
}

/** Completion rate of a habit over the last `n` days (excluding unfinished today). */
export function habitRate(data: Data, habit: Habit, today: string, n = 30) {
  const from = [addDays(today, -n), habit.createdDay].sort()[1];
  const days = from < today ? range(from, addDays(today, -1)) : [];
  if (!days.length) return null;
  const done = days.filter((d) => data.logs[d]?.[habit.id]?.status === 'done').length;
  return done / days.length;
}

export interface OpenItem {
  day: string;
  kind: 'habit' | 'plan';
  id: string;
}

/** Items left unresolved on past days (within `lookback` days). */
export function openPastItems(data: Data, today: string, lookback = 7): OpenItem[] {
  if (!data.startDay) return [];
  const from = [addDays(today, -lookback), data.startDay].sort()[1];
  const yesterday = addDays(today, -1);
  if (from > yesterday) return [];
  const out: OpenItem[] = [];
  for (const day of range(from, yesterday)) {
    for (const h of habitsOn(data, day)) {
      if (!data.logs[day]?.[h.id]) out.push({ day, kind: 'habit', id: h.id });
    }
    for (const p of plansOn(data, day)) {
      if (p.status === 'pending') out.push({ day, kind: 'plan', id: p.id });
    }
  }
  return out;
}

/** Average number of plans completed per planned day, over the last `n` days. */
export function planCapacity(data: Data, today: string, n = 14) {
  const days = range(addDays(today, -n), addDays(today, -1)).filter(
    (d) => plansOn(data, d).length > 0,
  );
  if (days.length < 3) return null;
  const done = days.reduce((s, d) => s + dayStats(data, d).plansDone, 0);
  return done / days.length;
}

export function reasonCounts(data: Data, from: string, to: string) {
  const counts = {} as Record<ReasonCode, number>;
  const bump = (r?: ReasonCode) => {
    if (r) counts[r] = (counts[r] ?? 0) + 1;
  };
  for (const [day, logs] of Object.entries(data.logs)) {
    if (day < from || day > to) continue;
    for (const l of Object.values(logs)) if (l.status === 'missed') bump(l.miss?.reason);
  }
  for (const p of data.plans) {
    if (p.day >= from && p.day <= to && (p.status === 'missed' || p.status === 'carried'))
      bump(p.miss?.reason);
  }
  return counts;
}

/** Average efficacy per weekday over the given window. */
export function weekdayAverages(data: Data, from: string, to: string) {
  const sums = Array(7).fill(0) as number[];
  const counts = Array(7).fill(0) as number[];
  for (const d of range(from, to)) {
    const s = dayStats(data, d).score;
    if (s === null) continue;
    sums[weekday(d)] += s;
    counts[weekday(d)]++;
  }
  return sums.map((s, i) => (counts[i] ? s / counts[i] : null));
}
