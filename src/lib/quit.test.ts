import { describe, expect, it } from 'vitest';
import { fmtElapsed, limitOn, quitScore, quitStats, triggerCounts } from './quit';
import type { QuitSettings, SmokeEvent } from '../types';

const reduce: QuitSettings = { enabled: true, mode: 'reduce', baseline: 12, price: 20, startDay: '2026-11-01', quitDate: '2026-11-29' };
const cold: QuitSettings = { ...reduce, mode: 'cold', quitDate: '2026-11-08' };
const smoke = (day: string, at: number, trigger?: SmokeEvent['trigger']): SmokeEvent => ({ id: `${day}-${at}`, day, at, kind: 'smoked', trigger });

describe('daily limit', () => {
  it('steps down weekly to zero on the quit date', () => {
    expect(limitOn(reduce, '2026-11-01')).toBe(12);
    expect(limitOn(reduce, '2026-11-08')).toBe(9);
    expect(limitOn(reduce, '2026-11-15')).toBe(6);
    expect(limitOn(reduce, '2026-11-22')).toBe(3);
    expect(limitOn(reduce, '2026-11-29')).toBe(0);
    expect(limitOn(reduce, '2026-12-25')).toBe(0);
  });
  it('cold turkey is baseline until the quit date, then zero', () => {
    expect(limitOn(cold, '2026-11-07')).toBe(12);
    expect(limitOn(cold, '2026-11-08')).toBe(0);
  });
});

describe('score and stats', () => {
  it('is 100% within the limit and drops when over', () => {
    const ev = [smoke('2026-11-08', 1), smoke('2026-11-08', 2), smoke('2026-11-08', 3)];
    expect(quitScore(cold, ev, '2026-11-08')).toBeCloseTo(0.75);
    expect(quitScore(reduce, ev, '2026-11-08')).toBe(1);
  });
  it('counts cigarettes avoided, money saved and smoke-free days', () => {
    const t = (d: string, h: number) => new Date(`${d}T${String(h).padStart(2, '0')}:00:00`).getTime();
    const ev = [smoke('2026-11-01', t('2026-11-01', 9)), smoke('2026-11-01', t('2026-11-01', 13)), smoke('2026-11-02', t('2026-11-02', 10))];
    const s = quitStats(reduce, ev, '2026-11-04', t('2026-11-04', 10));
    expect(s.avoided).toBe(10 + 11 + 12); // 3 finished days
    expect(s.saved).toBe(33 * 20);
    expect(s.smokeFreeDays30).toBe(2); // 11-03 and today so far
    expect(s.days30).toBe(4);
    expect(fmtElapsed(s.smokeFreeMs)).toBe('2d 0h');
    expect(s.daysToQuit).toBe(25);
  });
  it('ranks triggers', () => {
    const ev = [smoke('d', 1, 'stress'), smoke('d', 2, 'stress'), smoke('d', 3, 'coffee')];
    expect(triggerCounts(ev)).toEqual([['stress', 2], ['coffee', 1]]);
  });
});
