import { describe, expect, it } from 'vitest';
import { comboName, evenSplit, isPartial, partCredit } from './parts';
import { dayStats } from './score';
import type { Data } from '../types';

const move = { parts: [{ id: 'w', name: 'Workout', weight: 70 }, { id: 's', name: 'Stretch', weight: 30 }] };

describe('combo habits', () => {
  it('credit is the weight of the parts done', () => {
    expect(partCredit(move, { status: 'done', at: 0, parts: ['w'] })).toBe(0.7);
    expect(partCredit(move, { status: 'done', at: 0, parts: ['s'] })).toBe(0.3);
    expect(partCredit(move, { status: 'done', at: 0, parts: ['w', 's'] })).toBe(1);
    expect(partCredit(move, { status: 'done', at: 0 })).toBe(1); // ticked as a whole
    expect(partCredit(move, { status: 'missed', at: 0 })).toBe(0);
    expect(partCredit({}, { status: 'done', at: 0 })).toBe(1);
  });
  it('partial = done but not all', () => {
    expect(isPartial(move, { status: 'done', at: 0, parts: ['s'] })).toBe(true);
    expect(isPartial(move, { status: 'done', at: 0, parts: ['w', 's'] })).toBe(false);
  });
  it('names and splits', () => {
    expect(comboName([{ name: 'Workout' }, { name: ' Stretch ' }])).toBe('Workout + Stretch');
    expect(evenSplit(2)).toEqual([50, 50]);
    expect(evenSplit(3)).toEqual([34, 33, 33]);
  });
  it('day score uses the combo share', () => {
    const data: Data = {
      habits: [
        { id: 'm', name: 'Workout + Stretch', createdDay: '2026-11-01', ...move },
        { id: 'r', name: 'Read', createdDay: '2026-11-01' },
      ],
      plans: [],
      logs: { '2026-11-19': { m: { status: 'done', at: 0, parts: ['s'] }, r: { status: 'done', at: 0 } } },
      startDay: '2026-11-01',
    } as Data;
    const s = dayStats(data, '2026-11-19');
    expect(s.habitsDone).toBe(2); // both count as done for the streak
    expect(s.score).toBeCloseTo((0.3 + 1) / 2);
  });
});
