import { describe, expect, it } from 'vitest';
import { parsePlan } from './parsePlan';

describe('parsePlan', () => {
  it.each([
    ['Gym 7pm 1h', { title: 'Gym', start: '19:00', duration: 60 }],
    ['Call mom at 18:30 for 20 min', { title: 'Call mom', start: '18:30', duration: 20 }],
    ['Report 10-12', { title: 'Report', start: '10:00', duration: 120 }],
    ['Deep work 10am-12:30pm', { title: 'Deep work', start: '10:00', duration: 150 }],
    ['Read at 7 30m', { title: 'Read', start: '19:00', duration: 30 }], // before wake time → evening
    ['Run at 9 30m', { title: 'Run', start: '09:00', duration: 30 }],
    ['Standup 9:15am', { title: 'Standup', start: '09:15', duration: 30 }],
    ['Walk 7.30 pm 1.5h', { title: 'Walk', start: '19:30', duration: 90 }],
    ['Lunch 12pm 45 min', { title: 'Lunch', start: '12:00', duration: 45 }],
    ['Late study 12am 1h', { title: 'Late study', start: '00:00', duration: 60 }],
  ])('%s', (input, expected) => {
    expect(parsePlan(input)).toEqual(expected);
  });

  it('leaves plain titles alone (numbers without am/pm or "at" are not times)', () => {
    expect(parsePlan('Read 10 pages')).toEqual({ title: 'Read 10 pages', start: undefined, duration: undefined });
    expect(parsePlan('Buy 2 notebooks')).toEqual({ title: 'Buy 2 notebooks', start: undefined, duration: undefined });
  });

  it('ignores a duration without a time', () => {
    expect(parsePlan('Clean desk 15m')).toEqual({ title: 'Clean desk', start: undefined, duration: undefined });
  });

  it('enforces the 15-minute minimum', () => {
    expect(parsePlan('Stretch 8pm 5m').duration).toBe(15);
  });
});
