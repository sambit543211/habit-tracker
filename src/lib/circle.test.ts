import { describe, expect, it } from 'vitest';
import { circleScore, groupStreak, linkStreak, todayStatus, type CircleData, type CircleGoal } from './circle';

const link = (user_id: string, days: string) => ({ user_id, habit_id: user_id, habit: 'H', days });

describe('circle helpers', () => {
  it('reads today and streaks from the day string', () => {
    expect(todayStatus(link('a', 'dd-'))).toBe('open');
    expect(todayStatus(link('a', 'ddm'))).toBe('missed');
    expect(linkStreak('mddd')).toBe(3);
    expect(linkStreak('mdd-')).toBe(2); // open today doesn't break it
    expect(linkStreak('ddm')).toBe(0);
  });
  it('group streak needs everyone, and waits for today', () => {
    const g = (a: string, b: string): CircleGoal => ({ id: 'g', name: 'Gym', emoji: '', created_by: null, links: [link('a', a), link('b', b)] });
    expect(groupStreak(g('mddd', 'dddd'), 2)).toBe(3);
    expect(groupStreak(g('ddd-', 'dddd'), 2)).toBe(3); // a hasn't done today yet
    expect(groupStreak(g('dddm', 'dddd'), 2)).toBe(0);
    expect(groupStreak(g('dddd', 'dddd'), 3)).toBe(0); // third member hasn't linked a habit
  });
  it('scores my linked goals for today', () => {
    const data: CircleData = {
      me: 'a', invite: null,
      circle: { id: 'c', name: 'c', owner: 'a', members: [], reactions: [], goals: [
        { id: '1', name: 'Gym', emoji: '', created_by: null, links: [link('a', 'dd'), link('b', 'd-')] },
        { id: '2', name: 'Diet', emoji: '', created_by: null, links: [link('a', 'd-')] },
        { id: '3', name: 'Read', emoji: '', created_by: null, links: [link('b', 'dd')] },
      ] },
    };
    expect(circleScore(data)).toEqual({ done: 1, total: 2, score: 0.5 });
    expect(circleScore({ ...data, me: 'z' })).toBeNull();
  });
});
