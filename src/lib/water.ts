import type { Habit } from '../types';
import { activityOf } from './nudgeLines';

/** Smallest amount you log in one tap. */
export const WATER_STEP = 200;

/**
 * Daily water target in ml for a water habit, read from its name:
 * "Drink 3L water" → 3000, "Water 2.5 litres" → 2500, "8 glasses" → 2000, "1500ml" → 1500.
 * Any other water habit → 2 L. Not a water habit → null.
 */
export function waterTarget(h: Pick<Habit, 'name'>): number | null {
  if (activityOf(h.name) !== 'water') return null;
  const n = h.name.toLowerCase();
  const l = n.match(/(\d+(?:[.,]\d+)?)\s*(?:l|ltr|litres?|liters?)\b/);
  if (l) return Math.round(parseFloat(l[1].replace(',', '.')) * 1000);
  const ml = n.match(/(\d{3,4})\s*ml\b/);
  if (ml) return +ml[1];
  const glasses = n.match(/(\d+)\s*glass/);
  if (glasses) return +glasses[1] * 250;
  return 2000;
}

/** 1200 → "1.2 L", 800 → "800 ml" */
export const fmtWater = (ml: number) => (ml >= 1000 ? `${(ml / 1000).toFixed(ml % 1000 === 0 ? 0 : 1)} L` : `${ml} ml`);

/** Short "done / target" that fits a narrow row: 400 of 3000 → "0.4 / 3 L", 600 of 800 → "600 / 800 ml". */
export const fmtWaterPair = (ml: number, goal: number) => {
  if (goal < 1000) return `${ml} / ${goal} ml`;
  const l = (n: number) => String(+(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1));
  return `${l(ml)} / ${l(goal)} L`;
};
