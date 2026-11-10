import { describe, expect, it } from 'vitest';
import { dayKeyAt, addDays } from './date';
import { dayStats, streak, openPastItems, planCapacity } from './score';
import type { Data, Plan } from '../types';

const plan = (day: string, status: Plan['status'], id = Math.random().toString()): Plan => ({
  id, title: id, day, must: false, status, carryCount: 0, createdAt: 0,
});

const base = (): Data => ({
  habits: [
    { id: 'a', name: 'A', createdDay: '2026-11-01' },
    { id: 'b', name: 'B', createdDay: '2026-11-01' },
  ],
  logs: {},
  plans: [],
  startDay: '2026-11-01',
});

describe('day cutoff', () => {
  it('counts 1:30 am as the previous day', () => {
    expect(dayKeyAt(new Date(2026, 10, 11, 1, 30))).toBe('2026-11-10');
    expect(dayKeyAt(new Date(2026, 10, 11, 2, 0))).toBe('2026-11-11');
  });
  it('adds days across month ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
  });
});

describe('efficacy score', () => {
  it('weights habits and plans 50/50', () => {
    const d = base();
    d.logs['2026-11-02'] = { a: { status: 'done', at: 0 }, b: { status: 'done', at: 0 } };
    d.plans = [plan('2026-11-02', 'done'), plan('2026-11-02', 'pending'), plan('2026-11-02', 'missed'), plan('2026-11-02', 'carried')];
    const s = dayStats(d, '2026-11-02');
    expect(s.habitPct).toBe(1);
    expect(s.planPct).toBe(0.25);
    expect(s.score).toBeCloseTo(0.625);
    expect(s.plansMissed).toBe(2); // carried counts as not done
  });
  it('falls back to habits only when there are no plans', () => {
    const d = base();
    d.logs['2026-11-02'] = { a: { status: 'done', at: 0 } };
    expect(dayStats(d, '2026-11-02').score).toBe(0.5);
  });
});

describe('strict streak', () => {
  const done = { status: 'done' as const, at: 0 };
  it('breaks on any incomplete day and keeps best', () => {
    const d = base();
    d.logs['2026-11-01'] = { a: done, b: done };
    d.logs['2026-11-02'] = { a: done, b: done };
    d.logs['2026-11-03'] = { a: done }; // incomplete → breaks
    d.logs['2026-11-04'] = { a: done, b: done };
    const s = streak(d, '2026-11-05');
    expect(s.best).toBe(2);
    expect(s.current).toBe(1); // today (11-05) not done yet, doesn't break
    expect(s.todayDone).toBe(false);
  });
  it('resets once a full day passes incomplete', () => {
    const d = base();
    d.logs['2026-11-01'] = { a: done, b: done };
    expect(streak(d, '2026-11-03').current).toBe(0);
  });
});

describe('open past items', () => {
  it('lists unresolved habits and plans from previous days only', () => {
    const d = base();
    d.logs['2026-11-02'] = { a: { status: 'done', at: 0 } };
    d.plans = [plan('2026-11-02', 'pending', 'p1'), plan('2026-11-03', 'pending', 'today')];
    const items = openPastItems(d, '2026-11-03');
    expect(items.filter((i) => i.day === '2026-11-02').map((i) => i.id).sort()).toEqual(['b', 'p1']);
    expect(items.some((i) => i.id === 'today')).toBe(false);
  });
});

describe('plan capacity', () => {
  it('needs at least 3 planned days', () => {
    const d = base();
    d.plans = [plan('2026-11-08', 'done'), plan('2026-11-09', 'done')];
    expect(planCapacity(d, '2026-11-10')).toBeNull();
    d.plans.push(plan('2026-11-07', 'missed'), plan('2026-11-07', 'done'));
    expect(planCapacity(d, '2026-11-10')).toBeCloseTo(1);
  });
});
