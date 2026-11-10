import { useEffect, useState } from 'react';
import { dayKeyAt } from './date';

/** Current habit-day key + clock hour, refreshed every 30 s and on focus. */
export function useToday() {
  const read = () => {
    const now = new Date();
    return { today: dayKeyAt(now), hour: now.getHours() };
  };
  const [state, setState] = useState(read);
  useEffect(() => {
    const tick = () =>
      setState((prev) => {
        const next = read();
        return next.today === prev.today && next.hour === prev.hour ? prev : next;
      });
    const id = setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  return state;
}

/** Evening = 7 pm until the 2 am cutoff — time to plan tomorrow. */
export const isEvening = (hour: number) => hour >= 19 || hour < 2;
