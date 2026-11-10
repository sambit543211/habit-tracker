import type { Plan, Profile } from '../types';

/** "HH:MM" → minutes after midnight */
export const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** minutes (any value, wraps past midnight) → "HH:MM" */
export const fromMin = (m: number) => {
  const w = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(w / 60)).padStart(2, '0')}:${String(w % 60).padStart(2, '0')}`;
};

/** "18:30" → "6:30 pm" */
export const fmtTime = (t: string) => {
  const m = toMin(t);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${mm ? `:${String(mm).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`;
};

export const fmtDuration = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
};

/** Length of the waking window in minutes (sleep may be after midnight). */
export const windowLength = (p: Profile) => {
  const len = (toMin(p.sleep) - toMin(p.wake) + 1440) % 1440;
  return len === 0 ? 1440 : len;
};

/** Minutes from wake time to `t`, following the day across midnight. */
export const sinceWake = (t: string, p: Profile) => (toMin(t) - toMin(p.wake) + 1440) % 1440;

export const isTimed = (pl: Plan): pl is Plan & { start: string } => !!pl.start;

export const planDuration = (pl: Plan) => Math.max(15, pl.duration ?? 15);

/** Timed plans that still occupy the calendar (dropped / moved ones don't). */
export const activeBlocks = (plans: Plan[]) =>
  plans.filter((p) => isTimed(p) && p.status !== 'missed' && p.status !== 'carried') as (Plan & { start: string })[];

/**
 * Planned vs free minutes inside the waking window. Overlapping blocks are
 * only counted once.
 */
export function timeBudget(plans: Plan[], profile: Profile) {
  const total = windowLength(profile);
  const intervals = activeBlocks(plans)
    .map((p) => {
      const s = sinceWake(p.start, profile);
      return [s, Math.min(total, s + planDuration(p))] as const;
    })
    .filter(([s]) => s < total)
    .sort((a, b) => a[0] - b[0]);
  let planned = 0;
  let curS = -1;
  let curE = -1;
  let overlaps = 0;
  for (const [s, e] of intervals) {
    if (s < curE) {
      overlaps++;
      curE = Math.max(curE, e);
    } else {
      if (curE > curS) planned += curE - curS;
      curS = s;
      curE = e;
    }
  }
  if (curE > curS) planned += curE - curS;
  return { total, planned, free: Math.max(0, total - planned), overlaps };
}

/** Free time left from `nowSinceWake` until bed. */
export function freeFromNow(plans: Plan[], profile: Profile, nowSinceWake: number) {
  const total = windowLength(profile);
  if (nowSinceWake >= total) return 0;
  const busy = activeBlocks(plans)
    .filter((p) => p.status === 'pending')
    .map((p) => {
      const s = Math.max(nowSinceWake, sinceWake(p.start, profile));
      return [s, Math.min(total, sinceWake(p.start, profile) + planDuration(p))] as const;
    })
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  let used = 0;
  let end = nowSinceWake;
  for (const [s, e] of busy) {
    const from = Math.max(s, end);
    if (e > from) used += e - from;
    end = Math.max(end, e);
  }
  return Math.max(0, total - nowSinceWake - used);
}

/** Side-by-side columns for overlapping blocks (like a calendar day view). */
export function layoutBlocks<T extends { start: string; duration?: number }>(items: T[], profile: Profile) {
  const sorted = items
    .map((it) => ({ it, s: sinceWake(it.start, profile), e: sinceWake(it.start, profile) + Math.max(15, it.duration ?? 15) }))
    .sort((a, b) => a.s - b.s || b.e - a.e);
  const out: { it: T; s: number; e: number; col: number; cols: number }[] = [];
  let group: typeof out = [];
  let groupEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...group.map((g) => g.col + 1));
    for (const g of group) g.cols = cols;
    out.push(...group);
    group = [];
  };
  for (const x of sorted) {
    if (x.s >= groupEnd && group.length) flush();
    const used = new Set(group.filter((g) => g.e > x.s).map((g) => g.col));
    let col = 0;
    while (used.has(col)) col++;
    group.push({ ...x, col, cols: 1 });
    groupEnd = Math.max(groupEnd, x.e);
  }
  if (group.length) flush();
  return out;
}

/** Monday of the week containing `day` (YYYY-MM-DD). */
export const weekStart = (day: string) => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const greeting = (hour: number) =>
  hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 17 ? 'Good afternoon' : hour >= 17 && hour < 22 ? 'Good evening' : 'Late night';
