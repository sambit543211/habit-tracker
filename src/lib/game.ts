/**
 * Gamification, derived purely from your history (nothing extra is stored):
 * reliability level, badges, personal bests and the weekly quest.
 */
import type { Data, ReasonCode } from '../types';
import { addDays, range } from './date';
import { dayStats, reasonCounts, streak } from './score';
import { reasonLabel } from './reasons';
import { weekStart } from './time';

// ---------- Reliability level ----------

export const LEVELS = [
  { at: 0, name: 'Starter' },
  { at: 10, name: 'Showing up' },
  { at: 30, name: 'Consistent' },
  { at: 75, name: 'Reliable' },
  { at: 150, name: 'Dependable' },
  { at: 300, name: 'Steadfast' },
  { at: 500, name: 'Unshakeable' },
  { at: 800, name: 'Iron word' },
  { at: 1200, name: 'Legend' },
];

/** Every habit done and every plan done is one promise kept. */
export function promisesKept(data: Data, today: string) {
  if (!data.startDay) return 0;
  let n = 0;
  for (const d of range(data.startDay, today)) {
    const s = dayStats(data, d);
    n += s.habitsDone + s.plansDone;
  }
  return n;
}

export function levelFor(xp: number) {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].at) i++;
  const next = LEVELS[i + 1];
  return {
    level: i + 1,
    name: LEVELS[i].name,
    xp,
    floor: LEVELS[i].at,
    next: next?.at ?? null,
    nextName: next?.name ?? null,
    toNext: next ? next.at - xp : 0,
    progress: next ? (xp - LEVELS[i].at) / (next.at - LEVELS[i].at) : 1,
  };
}

// ---------- Badges + personal bests ----------

export interface Badge {
  id: string;
  emoji: string;
  title: string;
  text: string;
  earned: boolean;
}

export interface Bests {
  streak: number;
  mostInADay: number;
  bestWeek: number | null; // average efficacy of your best full week, 0–1
  perfectDays: number;
}

export function achievements(data: Data, today: string, reviewCount = 0): { badges: Badge[]; bests: Bests; kept: number } {
  const days = data.startDay ? range(data.startDay, today) : [];
  let kept = 0;
  let mostInADay = 0;
  let perfectDays = 0;
  let perfectRun = 0;
  let bestPerfectRun = 0;
  let comeback = false;
  let prevPerfectHabits: boolean | null = null;
  let reasons = 0;
  const weeks = new Map<string, number[]>();
  for (const d of days) {
    const s = dayStats(data, d);
    const n = s.habitsDone + s.plansDone;
    kept += n;
    mostInADay = Math.max(mostInADay, n);
    reasons += s.habitsMissed + s.plansMissed;
    const perfect = s.score === 1 && s.pending === 0;
    if (perfect) {
      perfectDays++;
      bestPerfectRun = Math.max(bestPerfectRun, ++perfectRun);
    } else if (d !== today) perfectRun = 0;
    if (prevPerfectHabits === false && s.perfectHabits) comeback = true;
    if (d !== today) prevPerfectHabits = s.habitsTotal ? s.perfectHabits : prevPerfectHabits;
    if (s.score !== null && d < today) {
      const w = weekStart(d);
      weeks.set(w, [...(weeks.get(w) ?? []), s.score]);
    }
  }
  const fullWeeks = [...weeks.values()].filter((w) => w.length >= 5).map((w) => w.reduce((a, b) => a + b, 0) / w.length);
  const best = streak(data, today).best;
  const B = (id: string, emoji: string, title: string, text: string, earned: boolean): Badge => ({ id, emoji, title, text, earned });
  const badges = [
    B('first', '🌱', 'First promise', 'Keep your first promise', kept >= 1),
    B('week', '🔥', '7-day streak', 'Every habit, 7 days running', best >= 7),
    B('perfect-week', '💎', 'Perfect week', '7 days at 100% in a row', bestPerfectRun >= 7),
    B('month', '🏔️', '30-day streak', 'Every habit, 30 days running', best >= 30),
    B('automatic', '🧠', 'Automatic', '66-day streak — habits on autopilot', best >= 66),
    B('hundred', '💯', '100 promises', 'Keep 100 promises', kept >= 100),
    B('five-hundred', '🏆', '500 promises', 'Keep 500 promises', kept >= 500),
    B('comeback', '↩️', 'Comeback', 'A perfect-habit day right after a miss', comeback),
    B('honest', '🪞', 'Honest', 'Log 10 misses with a reason', reasons >= 10),
    B('reflective', '🗓️', 'Reflective', 'Complete 3 weekly reviews', reviewCount >= 3),
  ];
  return { badges, bests: { streak: best, mostInADay, bestWeek: fullWeeks.length ? Math.max(...fullWeeks) : null, perfectDays }, kept };
}

// ---------- Weekly quest ----------

export interface Quest {
  id: string;
  title: string;
  text: string;
  target: number;
  progress: number;
  done: boolean;
}

const dayHasReason = (data: Data, day: string, reason: ReasonCode) =>
  Object.values(data.logs[day] ?? {}).some((l) => l.status === 'missed' && l.miss?.reason === reason) ||
  data.plans.some((p) => p.day === day && (p.status === 'missed' || p.status === 'carried') && p.miss?.reason === reason);

/**
 * One small challenge per week, drawn from your own data: beat last week's
 * top miss reason three days running — or, if last week was clean, land
 * three perfect-habit days.
 */
export function weeklyQuest(data: Data, today: string): Quest | null {
  if (!data.startDay) return null;
  const mon = weekStart(today);
  const counts = reasonCounts(data, addDays(mon, -7), addDays(mon, -1));
  const top = (Object.entries(counts) as [ReasonCode, number][]).sort((a, b) => b[1] - a[1])[0];
  const days = range(mon, today);
  const closed = (d: string) => d < today || dayStats(data, d).pending === 0;

  if (top && top[1] >= 2) {
    const [reason] = top;
    let run = 0;
    let bestRun = 0;
    for (const d of days) {
      if (!closed(d)) break;
      if (d < data.startDay || dayStats(data, d).score === null) continue;
      if (dayHasReason(data, d, reason)) run = 0;
      else bestRun = Math.max(bestRun, ++run);
    }
    const label = reasonLabel(reason).toLowerCase();
    return {
      id: `${mon}:reason:${reason}`,
      title: `Beat “${label}” 3 days in a row`,
      text: `It was your top miss reason last week (${top[1]}×).`,
      target: 3,
      progress: Math.min(3, bestRun),
      done: bestRun >= 3,
    };
  }
  const perfect = days.filter((d) => dayStats(data, d).perfectHabits).length;
  return {
    id: `${mon}:perfect`,
    title: '3 perfect-habit days this week',
    text: 'Every habit done on three days.',
    target: 3,
    progress: Math.min(3, perfect),
    done: perfect >= 3,
  };
}

// ---------- Pace ----------

/**
 * How many habits you've usually finished by this time of day (last 14 days),
 * compared with today. Null until there are 3 days of timestamped history.
 */
export function pace(data: Data, today: string, nowSinceWake: number, wakeMin: number) {
  let total = 0;
  let n = 0;
  for (const d of range(addDays(today, -14), addDays(today, -1))) {
    const logs = Object.values(data.logs[d] ?? {}).filter((l) => l.status === 'done' && l.at > 0);
    if (!logs.length) continue;
    n++;
    total += logs.filter((l) => {
      const t = new Date(l.at);
      return (t.getHours() * 60 + t.getMinutes() - wakeMin + 1440) % 1440 <= nowSinceWake;
    }).length;
  }
  if (n < 3) return null;
  const usual = Math.round(total / n);
  const doneNow = Object.values(data.logs[today] ?? {}).filter((l) => l.status === 'done').length;
  return { usual, doneNow, diff: doneNow - usual };
}

// ---------- Weekly summary for an accountability partner ----------

export function weekSummary(data: Data, today: string, name: string | undefined, experiment?: string) {
  const mon = weekStart(today);
  const days = range(mon, today);
  let hd = 0, ht = 0, pd = 0, pt = 0;
  const scores: number[] = [];
  for (const d of days) {
    const s = dayStats(data, d);
    hd += s.habitsDone; ht += s.habitsTotal; pd += s.plansDone; pt += s.plansTotal;
    if (s.score !== null && (d < today || s.pending === 0)) scores.push(s.score);
  }
  const avg = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) : null;
  const prev = range(addDays(mon, -7), addDays(mon, -1)).map((d) => dayStats(data, d).score).filter((x): x is number => x !== null);
  const prevAvg = prev.length ? Math.round((prev.reduce((a, b) => a + b, 0) / prev.length) * 100) : null;
  const top = (Object.entries(reasonCounts(data, mon, today)) as [ReasonCode, number][]).sort((a, b) => b[1] - a[1])[0];
  const st = streak(data, today);
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const lines = [
    `${name ? `${name}'s` : 'My'} week on Keep (${fmt(mon)} – ${fmt(today)})`,
    avg !== null ? `Efficacy: ${avg}%${prevAvg !== null ? ` (${avg >= prevAvg ? '↑' : '↓'}${Math.abs(avg - prevAvg)} vs last week)` : ''}` : null,
    `Habits kept: ${hd}/${ht}`,
    `Plans done: ${pd}/${pt}`,
    `Streak: ${st.current} day${st.current === 1 ? '' : 's'}`,
    top ? `Top miss reason: ${reasonLabel(top[0]).toLowerCase()} (${top[1]}×)` : 'No misses logged 🎉',
    experiment ? `Next week I'm trying: ${experiment}` : null,
    'Hold me to it.',
  ];
  return lines.filter(Boolean).join('\n');
}
