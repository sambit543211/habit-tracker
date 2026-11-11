import { describe, expect, it } from 'vitest';
import { achievements, levelFor, pace, weeklyQuest, weekSummary } from './game';
import { streak } from './score';
import { addDays, range } from './date';
import type { Data } from '../types';

const done = { status: 'done' as const, at: 0 };
const base = (start: string): Data => ({ habits: [{ id: 'a', name: 'A', createdDay: start }], logs: {}, plans: [], startDay: start });
const fill = (d: Data, from: string, to: string) => { for (const k of range(from, to)) d.logs[k] = { a: done }; };

describe('streak shields', () => {
  it('earns a shield every 7 perfect days and spends it on a miss', () => {
    const d = base('2026-10-01');
    fill(d, '2026-10-01', '2026-10-07'); // 7 perfect → 1 shield
    // 10-08 missed, 10-09..10-10 perfect
    fill(d, '2026-10-09', '2026-10-10');
    const strict = streak(d, '2026-10-11');
    const shielded = streak(d, '2026-10-11', true);
    expect(strict.current).toBe(2);
    expect(shielded.current).toBe(9);
    expect(shielded.shields).toBe(0);
    expect(shielded.shieldedDays).toEqual(['2026-10-08']);
  });
  it('resets when no shield is available and holds at most 2', () => {
    const d = base('2026-10-01');
    fill(d, '2026-10-01', '2026-10-03');
    fill(d, '2026-10-05', '2026-10-06');
    expect(streak(d, '2026-10-07', true).current).toBe(2);
    const long = base('2026-09-01');
    fill(long, '2026-09-01', '2026-09-30');
    const s = streak(long, '2026-10-01', true);
    expect(s.shields).toBe(2);
    expect(s.toNextShield).toBe(0);
  });
});

describe('level', () => {
  it('maps promises kept to a level with progress', () => {
    expect(levelFor(0)).toMatchObject({ level: 1, name: 'Starter', toNext: 10 });
    expect(levelFor(30)).toMatchObject({ level: 3, name: 'Consistent', progress: 0 });
    expect(levelFor(5000)).toMatchObject({ level: 9, next: null, progress: 1 });
  });
});

describe('achievements', () => {
  it('awards streak, perfect-week and comeback badges', () => {
    const d = base('2026-10-01');
    fill(d, '2026-10-01', '2026-10-07');
    fill(d, '2026-10-09', '2026-10-09');
    const { badges, bests, kept } = achievements(d, '2026-10-10');
    const earned = badges.filter((b) => b.earned).map((b) => b.id);
    expect(earned).toEqual(expect.arrayContaining(['first', 'week', 'perfect-week', 'comeback']));
    expect(earned).not.toContain('month');
    expect(kept).toBe(8);
    expect(bests.streak).toBe(7);
  });
});

describe('weekly quest', () => {
  it('targets last week’s top miss reason', () => {
    // 2026-11-09 is a Monday
    const d = base('2026-11-01');
    d.logs['2026-11-03'] = { a: { status: 'missed', miss: { reason: 'distracted' }, at: 0 } };
    d.logs['2026-11-05'] = { a: { status: 'missed', miss: { reason: 'distracted' }, at: 0 } };
    fill(d, '2026-11-09', '2026-11-10');
    const q = weeklyQuest(d, '2026-11-11')!;
    expect(q.title).toContain('distracted');
    expect(q.progress).toBe(2); // Mon + Tue clean, today still open
    expect(q.done).toBe(false);
    d.logs['2026-11-11'] = { a: done };
    expect(weeklyQuest(d, '2026-11-11')!.done).toBe(true);
  });
  it('falls back to perfect days after a clean week', () => {
    const d = base('2026-11-01');
    fill(d, '2026-11-01', '2026-11-10');
    expect(weeklyQuest(d, '2026-11-11')).toMatchObject({ title: '3 perfect-habit days this week', progress: 2 });
  });
});

describe('pace', () => {
  it('compares today with your usual count by this time', () => {
    const d = base('2026-11-01');
    for (const k of range('2026-11-07', '2026-11-10')) d.logs[k] = { a: { status: 'done', at: new Date(`${k}T10:00:00`).getTime() } };
    expect(pace(d, '2026-11-11', 60, 480)).toMatchObject({ usual: 0, diff: 0 }); // 9 am: nothing usually done yet
    expect(pace(d, '2026-11-11', 180, 480)).toMatchObject({ usual: 1, diff: -1 }); // 11 am: usually 1, today 0
    d.logs['2026-11-11'] = { a: done };
    expect(pace(d, '2026-11-11', 180, 480)!.diff).toBe(0);
    expect(pace(base('2026-11-01'), '2026-11-11', 180, 480)).toBeNull();
  });
});

describe('week summary', () => {
  it('produces a shareable text', () => {
    const d = base('2026-11-01');
    fill(d, '2026-11-02', '2026-11-10');
    const t = weekSummary(d, addDays('2026-11-10', 1), 'Sambit', 'phone outside bedroom');
    expect(t).toContain("Sambit's week on Keep");
    expect(t).toContain('Habits kept: 2/3');
    expect(t).toContain('phone outside bedroom');
  });
});
