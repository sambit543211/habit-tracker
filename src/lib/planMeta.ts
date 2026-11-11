import type { Plan } from '../types';
import { fmtDuration, fmtTime } from './time';

/** "6 pm · 30m · note · If-then ✓" summary, or null when there's nothing to show. */
export function planMetaText(plan: Plan, withCarry = true): string | null {
  const bits: string[] = [];
  if (plan.start) bits.push(`${fmtTime(plan.start)} · ${fmtDuration(Math.max(15, plan.duration ?? 15))}`);
  else if (plan.remindAt) bits.push(`⏰ ${fmtTime(plan.remindAt)}`);
  if (plan.note) bits.push(plan.note);
  if (plan.ifThen) bits.push('If-then ✓');
  if (withCarry && plan.carryCount > 0) bits.push(`Moved ${plan.carryCount}×`);
  return bits.length ? bits.join(' · ') : null;
}
