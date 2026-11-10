import { describe, expect, it } from 'vitest';
import { fmtTime, layoutBlocks, sinceWake, timeBudget, weekStart, windowLength, freeFromNow } from './time';
import type { Plan } from '../types';

const profile = { wake: '08:00', sleep: '02:00' };
const plan = (start: string, duration: number, status: Plan['status'] = 'pending'): Plan & { start: string } => ({
  id: start, title: start, day: 'd', must: false, status, carryCount: 0, createdAt: 0, start, duration,
});

describe('time helpers', () => {
  it('formats 12-hour times', () => {
    expect(fmtTime('18:30')).toBe('6:30 pm');
    expect(fmtTime('00:00')).toBe('12 am');
    expect(fmtTime('12:05')).toBe('12:05 pm');
  });
  it('handles a waking window that crosses midnight', () => {
    expect(windowLength(profile)).toBe(18 * 60);
    expect(sinceWake('01:00', profile)).toBe(17 * 60);
  });
  it('counts overlapping blocks once and ignores dropped plans', () => {
    const b = timeBudget([plan('09:00', 60), plan('09:30', 60), plan('20:00', 30, 'missed')], profile);
    expect(b.planned).toBe(90);
    expect(b.overlaps).toBe(1);
    expect(b.free).toBe(18 * 60 - 90);
  });
  it('computes free time from now', () => {
    // now = 10:00 → 16h left; pending block 10:30-11:30 → 15h free
    expect(freeFromNow([plan('10:30', 60)], profile, 120)).toBe(15 * 60);
  });
  it('lays overlapping blocks side by side', () => {
    const l = layoutBlocks([plan('09:00', 60), plan('09:30', 60), plan('12:00', 30)], profile);
    expect(l.map((x) => [x.col, x.cols])).toEqual([[0, 2], [1, 2], [0, 1]]);
  });
  it('finds the Monday of a week', () => {
    expect(weekStart('2026-11-15')).toBe('2026-11-09'); // Sunday → previous Monday
    expect(weekStart('2026-11-09')).toBe('2026-11-09');
  });
});
