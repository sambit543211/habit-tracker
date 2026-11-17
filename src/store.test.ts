import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './store';
import { habitsOn } from './lib/score';
import type { Plan } from './types';

const plan = (id: string, day: string, status: Plan['status'] = 'pending', extra: Partial<Plan> = {}): Plan => ({
  id, title: id, day, must: false, status, carryCount: 0, createdAt: 1, ...extra,
});
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('rollOverPlans', () => {
  beforeEach(() => useStore.setState({ plans: [] }));

  it('moves unfinished past plans to today and remembers the first day', () => {
    useStore.setState({ plans: [plan(A, '2026-11-10'), plan(B, '2026-11-10', 'done'), plan('t', '2026-11-12')] });
    expect(useStore.getState().rollOverPlans('2026-11-12')).toBe(1);
    const plans = useStore.getState().plans;
    const old = plans.find((p) => p.id === A)!;
    const copy = plans.find((p) => p.id === old.carriedTo)!;
    expect(old.status).toBe('carried');
    expect(copy).toMatchObject({ day: '2026-11-12', status: 'pending', originDay: '2026-11-10', carryCount: 1 });
    expect(plans.find((p) => p.id === B)!.status).toBe('done');
    expect(plans).toHaveLength(4);
  });

  it('is idempotent and keeps the original day across several roll-overs', () => {
    useStore.setState({ plans: [plan(A, '2026-11-10')] });
    useStore.getState().rollOverPlans('2026-11-11');
    expect(useStore.getState().rollOverPlans('2026-11-11')).toBe(0);
    useStore.getState().rollOverPlans('2026-11-13');
    const today = useStore.getState().plans.filter((p) => p.day === '2026-11-13');
    expect(today).toHaveLength(1);
    expect(today[0]).toMatchObject({ originDay: '2026-11-10', carryCount: 2 });
    expect(today[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('habit order', () => {
  beforeEach(() => useStore.getState().reset());
  it('new habits go last and reorder sticks', () => {
    const s = useStore.getState();
    s.addHabit({ name: 'A' });
    s.addHabit({ name: 'B' });
    s.addHabit({ name: 'C' });
    const ids = useStore.getState().habits.map((h) => h.id);
    expect(useStore.getState().habits.map((h) => h.position)).toEqual([1, 2, 3]);
    useStore.getState().reorderHabits([ids[2], ids[0], ids[1]]);
    const today = useStore.getState().habits[0].createdDay;
    expect(habitsOn(useStore.getState(), today).map((h) => h.name)).toEqual(['C', 'A', 'B']);
  });
});

describe('startFreshLocal', () => {
  beforeEach(() => useStore.getState().reset());
  it('wipes history, keeps habits and upcoming plans, starts on the day', () => {
    const s = useStore.getState();
    s.addHabit({ name: 'Read' });
    const h = useStore.getState().habits[0];
    useStore.setState({
      logs: { '2026-11-14': { [h.id]: { status: 'done', at: 1 } } },
      plans: [plan('old', '2026-11-14'), plan('next', '2026-11-16')],
      levelSeen: 4,
      badgesSeen: ['first'],
    });
    useStore.getState().startFreshLocal('2026-11-16', true);
    const st = useStore.getState();
    expect(st.logs).toEqual({});
    expect(st.plans.map((p) => p.id)).toEqual(['next']);
    expect(st.habits[0].createdDay).toBe('2026-11-16');
    expect(st.startDay).toBe('2026-11-16');
    expect(st.levelSeen).toBe(0);
    expect(st.badgesSeen).toEqual([]);
  });
});

describe('repeating plans', () => {
  beforeEach(() => useStore.setState({ plans: [] }));
  it('makes one copy per matching day and does not pile up missed ones', () => {
    // 2026-11-16 is a Monday
    useStore.setState({ plans: [plan(A, '2026-11-16', 'pending', { title: 'Physio', start: '18:00', duration: 60, repeat: [1, 3, 5] })] });
    useStore.getState().makeRepeats(['2026-11-17', '2026-11-18']); // Tue, Wed
    useStore.getState().makeRepeats(['2026-11-18']); // again: no duplicate
    const copies = useStore.getState().plans.filter((p) => p.id !== A);
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ day: '2026-11-18', title: 'Physio', start: '18:00', status: 'pending' });
    // Next day starts: the missed template is closed, not carried forward
    expect(useStore.getState().rollOverPlans('2026-11-17')).toBe(0);
    expect(useStore.getState().plans.find((p) => p.id === A)!.status).toBe('missed');
  });
});
