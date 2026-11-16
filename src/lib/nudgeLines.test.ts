import { describe, expect, it } from 'vitest';
import { activityOf, NUDGE_LINES, CHEER_LINES, NUDGE_BODY } from './nudgeLines';

describe('activityOf', () => {
  it('matches the goal or habit to an activity', () => {
    expect(activityOf('Gym', 'Workout 30 min')).toBe('move');
    expect(activityOf('Hydrate', 'Drink 2L water')).toBe('water');
    expect(activityOf('Read 10 pages')).toBe('read');
    expect(activityOf('Read news')).toBe('read');
    expect(activityOf('Meditate 5 min')).toBe('mind');
    expect(activityOf('No phone in bed')).toBe('sleep');
    expect(activityOf('Clean eating')).toBe('food');
    expect(activityOf('Learn Spanish')).toBe('learn');
    expect(activityOf('Journal')).toBe('write');
    expect(activityOf('No smoking')).toBe('quit');
    expect(activityOf('Call mom')).toBe('other');
  });
  it('has lines for every activity', () => {
    for (const a of Object.keys(NUDGE_BODY)) {
      expect(NUDGE_LINES[a as keyof typeof NUDGE_LINES].length).toBeGreaterThanOrEqual(4);
      expect(CHEER_LINES[a as keyof typeof CHEER_LINES].length).toBeGreaterThan(0);
    }
  });
});

import fn from '../../supabase/functions/send-reminders/index.ts?raw';
import client from './nudgeLines.ts?raw';
import { NUDGE_BODY as BODY } from './nudgeLines';

describe('server copy', () => {
  it('the notification function uses the same activity words', () => {
    for (const text of Object.values(BODY)) expect(fn).toContain(text);
    const rules = [...client.matchAll(/\['(\w+)', (\/.+\/i)\]/g)].map((m) => m[0]);
    expect(rules.length).toBe(9);
    for (const r of rules) expect(fn).toContain(r);
  });
});
