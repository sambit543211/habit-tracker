import type { Plan } from '../types';
import { fmtDuration, fmtTime } from './time';

/** "6 pm · 30m · note · If-then ✓" summary, or null when there's nothing to show. */
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** [1,3,5] → "Mon, Wed, Fri"; every day → "Daily"; Mon–Fri → "Weekdays" */
export const repeatLabel = (days: number[]) => {
  const s = [...days].sort().join(',');
  if (s === '0,1,2,3,4,5,6') return 'Daily';
  if (s === '1,2,3,4,5') return 'Weekdays';
  if (s === '0,6') return 'Weekends';
  return [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DAY[d]).join(', ');
};

export function planMetaText(plan: Plan, withCarry = true): string | null {
  const bits: string[] = [];
  if (plan.repeat?.length) bits.push(`🔁 ${repeatLabel(plan.repeat)}`);
  if (plan.start) bits.push(`${fmtTime(plan.start)} · ${fmtDuration(Math.max(15, plan.duration ?? 15))}`);
  else if (plan.remindAt) bits.push(`⏰ ${fmtTime(plan.remindAt)}`);
  if (plan.note) bits.push(plan.note);
  if (withCarry && plan.carryCount > 0) bits.push(`Moved ${plan.carryCount}×`);
  return bits.length ? bits.join(' · ') : null;
}
