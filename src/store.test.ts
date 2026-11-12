import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './store';
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
