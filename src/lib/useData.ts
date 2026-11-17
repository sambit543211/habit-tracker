import { useMemo } from 'react';
import { useStore } from '../store';
import type { Data } from '../types';

/** The scoring inputs as one stable object: changes only when one of its parts changes. */
export function useData(): Data {
  const habits = useStore((s) => s.habits);
  const plans = useStore((s) => s.plans);
  const logs = useStore((s) => s.logs);
  const startDay = useStore((s) => s.startDay);
  const amounts = useStore((s) => s.amounts);
  return useMemo(() => ({ habits, plans, logs, startDay, amounts }), [habits, plans, logs, startDay, amounts]);
}
