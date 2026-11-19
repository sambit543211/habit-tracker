import type { Habit, HabitLog, HabitPart } from '../types';

/** A combo habit has 2–3 parts sharing its credit ("Workout 70 + Stretch 30"). */
export const isCombo = (h: Pick<Habit, 'parts'>): h is { parts: HabitPart[] } => (h.parts?.length ?? 0) >= 2;

/** Share of the habit done (0–1). Plain habits: done = 1. Combos: the weights of the parts done. */
export function partCredit(h: Pick<Habit, 'parts'>, log?: HabitLog): number {
  if (log?.status !== 'done') return 0;
  if (!isCombo(h) || !log.parts) return 1; // ticked as a whole (or an older log): full credit
  const done = h.parts.filter((p) => log.parts!.includes(p.id)).reduce((s, p) => s + p.weight, 0);
  return Math.min(1, done / 100);
}

/** Done, but not all of it → shown orange. The streak still counts it. */
export const isPartial = (h: Pick<Habit, 'parts'>, log?: HabitLog) => log?.status === 'done' && partCredit(h, log) < 1;

/** Name a combo from its parts: "Workout + Stretch". */
export const comboName = (parts: Pick<HabitPart, 'name'>[]) =>
  parts
    .map((p) => p.name.trim())
    .filter(Boolean)
    .join(' + ');

/** Split 100 between n parts, the first getting any remainder: 2 → 50/50, 3 → 34/33/33. */
export function evenSplit(n: number) {
  const base = Math.floor(100 / n);
  return Array.from({ length: n }, (_, i) => base + (i === 0 ? 100 - base * n : 0));
}

/** Part colours, in order: green, sky, violet. */
export const PART_COLORS = ['var(--habit)', '#38bdf8', '#a78bfa'] as const;

/** Change part i by `delta` points, taking/giving from the next part; every part keeps at least 5. */
export function nudgeWeight(weights: number[], i: number, delta: number) {
  const w = [...weights];
  const j = (i + 1) % w.length;
  const d = Math.max(5 - w[i], Math.min(delta, w[j] - 5));
  w[i] += d;
  w[j] -= d;
  return w;
}
