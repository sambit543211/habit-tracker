/**
 * Quit-smoking logic. Two paths:
 * - cold: smoke as usual until the quit date, then zero.
 * - reduce: a daily limit that steps down each week to zero on the quit date.
 *   (A trial found abrupt quitting succeeded more often than gradual — Lindson-Hawley
 *   et al., 2016 — so the reduce path always ends in a firm quit date.)
 */
import type { QuitSettings, SmokeEvent, SmokeTrigger } from '../types';
import { addDays, fromKey, range } from './date';

const dayDiff = (a: string, b: string) => Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / 86400_000);

/** Allowed cigarettes on a given day. */
export function limitOn(q: QuitSettings, day: string): number {
  if (day >= q.quitDate) return 0;
  if (q.mode === 'cold') return q.baseline;
  const total = Math.max(1, dayDiff(q.startDay, q.quitDate));
  const steps = Math.max(1, Math.ceil(total / 7)); // one step per week
  const step = Math.min(steps - 1, Math.floor(Math.max(0, dayDiff(q.startDay, day)) / 7));
  return Math.max(1, Math.round(q.baseline * (1 - step / steps)));
}

export const smokedOn = (events: SmokeEvent[], day: string) => events.filter((e) => e.kind === 'smoked' && e.day === day).length;

/** 0–1 score for a day: 1 when within the limit, falling as you go over. */
export function quitScore(q: QuitSettings, events: SmokeEvent[], day: string) {
  const limit = limitOn(q, day);
  const n = smokedOn(events, day);
  if (n <= limit) return 1;
  return Math.max(0, 1 - (n - limit) / Math.max(1, q.baseline));
}

export interface QuitStats {
  limit: number;
  today: number;
  score: number;
  /** ms since the last cigarette (or since tracking started) */
  smokeFreeMs: number;
  lastSmokeAt: number | null;
  avoided: number;
  saved: number;
  smokeFreeDays30: number;
  days30: number;
  cravingsBeaten: number;
  daysToQuit: number;
  quitReached: boolean;
}

export function quitStats(q: QuitSettings, events: SmokeEvent[], today: string, now = Date.now()): QuitStats {
  const smoked = events.filter((e) => e.kind === 'smoked');
  const last = smoked.reduce<number | null>((m, e) => (m === null || e.at > m ? e.at : m), null);
  const startMs = new Date(`${q.startDay}T00:00:00`).getTime();
  const byDay = new Map<string, number>();
  for (const e of smoked) byDay.set(e.day, (byDay.get(e.day) ?? 0) + 1);
  let avoided = 0;
  // Count full days plus today so far (today counts once it's lower than baseline pace would allow).
  for (const d of range(q.startDay, today)) {
    if (d === today) continue;
    avoided += Math.max(0, q.baseline - (byDay.get(d) ?? 0));
  }
  const from30 = [addDays(today, -29), q.startDay].sort()[1];
  const window = from30 <= today ? range(from30, today) : [];
  return {
    limit: limitOn(q, today),
    today: byDay.get(today) ?? 0,
    score: quitScore(q, events, today),
    smokeFreeMs: Math.max(0, now - (last ?? startMs)),
    lastSmokeAt: last,
    avoided,
    saved: avoided * q.price,
    smokeFreeDays30: window.filter((d) => !byDay.get(d)).length,
    days30: window.length,
    cravingsBeaten: events.filter((e) => e.kind === 'craving_passed').length,
    daysToQuit: Math.max(0, dayDiff(today, q.quitDate)),
    quitReached: today >= q.quitDate,
  };
}

export function triggerCounts(events: SmokeEvent[]) {
  const out = new Map<SmokeTrigger, number>();
  for (const e of events) if (e.kind === 'smoked' && e.trigger) out.set(e.trigger, (out.get(e.trigger) ?? 0) + 1);
  return [...out.entries()].sort((a, b) => b[1] - a[1]);
}

export const TRIGGER_LABEL: Record<SmokeTrigger, { label: string; emoji: string }> = {
  stress: { label: 'Stress', emoji: '😤' },
  after_meal: { label: 'After a meal', emoji: '🍽️' },
  coffee: { label: 'Coffee / tea', emoji: '☕' },
  alcohol: { label: 'Alcohol', emoji: '🍺' },
  boredom: { label: 'Boredom', emoji: '🥱' },
  social: { label: 'With others', emoji: '👥' },
  habit: { label: 'Just habit', emoji: '🔁' },
  other: { label: 'Other', emoji: '•' },
};

/**
 * What changes after your last cigarette. Timings are the commonly cited ones
 * from public-health sources (U.S. CDC / Surgeon General, American Cancer Society).
 */
export const HEALTH_MILESTONES: { hours: number; title: string; text: string }[] = [
  { hours: 20 / 60, title: '20 minutes', text: 'Heart rate starts to drop back toward normal.' },
  { hours: 12, title: '12 hours', text: 'Carbon monoxide in your blood falls to normal.' },
  { hours: 24 * 2, title: '2 days', text: 'Taste and smell begin to sharpen.' },
  { hours: 24 * 14, title: '2 weeks', text: 'Circulation and lung function start to improve.' },
  { hours: 24 * 30, title: '1 month', text: 'Coughing and shortness of breath start to ease.' },
  { hours: 24 * 90, title: '3 months', text: 'Lung function is noticeably better.' },
  { hours: 24 * 365, title: '1 year', text: 'Added risk of heart disease is about half a smoker’s.' },
];

export function fmtElapsed(ms: number) {
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${mm}m`;
  return `${mm}m`;
}

/**
 * Life regained per cigarette not smoked. A 2024 University College London study
 * (Jackson et al., Journal of Addiction) estimated each cigarette costs about 20 minutes
 * of life on average (17 for men, 22 for women). An average, not a promise.
 */
export const LIFE_MIN_PER_CIG = 20;

/** 100 → "1 h 40 min", 3000 → "2 days 2 h" (short: "1h 40m", "2d 2h") */
export function fmtLife(min: number, short = false) {
  const m = Math.round(min);
  if (short) {
    const d = Math.floor(m / 1440);
    const h = Math.floor((m % 1440) / 60);
    if (d > 0) return `${d}d${h ? ` ${h}h` : ''}`;
    if (h > 0) return `${h}h${m % 60 ? ` ${m % 60}m` : ''}`;
    return `${m}m`;
  }
  if (m < 60) return `${m} min`;
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d > 0) return `${d} day${d === 1 ? '' : 's'}${h ? ` ${h} h` : ''}`;
  return `${h} h${mm ? ` ${mm} min` : ''}`;
}

/** Today against your old normal: cigarettes not smoked and the life that buys back. */
export function todayWin(q: QuitSettings, events: SmokeEvent[], today: string) {
  const smoked = smokedOn(events, today);
  const avoided = Math.max(0, q.baseline - smoked);
  return { smoked, baseline: q.baseline, avoided, minutes: avoided * LIFE_MIN_PER_CIG };
}

/** Triggers that showed up today (cigarettes and cravings both count). */
export function triggersToday(events: SmokeEvent[], today: string) {
  return events.filter((e) => e.day === today && e.trigger).length;
}

/** How often each trigger came up since `from` — smoked vs beaten. */
export function triggerStats(events: SmokeEvent[], from: string) {
  const out = new Map<SmokeTrigger, { smoked: number; beaten: number }>();
  for (const e of events) {
    if (!e.trigger || e.day < from) continue;
    const t = out.get(e.trigger) ?? { smoked: 0, beaten: 0 };
    if (e.kind === 'smoked') t.smoked++;
    else t.beaten++;
    out.set(e.trigger, t);
  }
  return out;
}

/** A ready-made "instead" for each trigger, so setup is one tap. */
export const INSTEAD: Record<SmokeTrigger, string> = {
  stress: 'Take 10 slow breaths',
  after_meal: 'Brush teeth or walk 5 min',
  coffee: 'Chew gum with my coffee',
  alcohol: 'Keep a drink in my smoking hand',
  boredom: 'Play the craving game',
  social: 'Step away and text a friend',
  habit: 'Drink a glass of water',
  other: 'Wait 3 minutes first',
};
