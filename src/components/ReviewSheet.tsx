import { useMemo } from 'react';
import { useStore, useUI } from '../store';
import { openPastItems } from '../lib/score';
import { formatDay } from '../lib/date';
import { Sheet } from './Sheet';
import { HabitRows } from './HabitRows';
import { PlanRows } from './PlanRows';

/** Close out unresolved items from previous days. */
export function ReviewSheet({ today }: { today: string }) {
  const open = useUI((s) => s.reviewOpen);
  const setReview = useUI((s) => s.setReview);
  const habits = useStore((s) => s.habits);
  const plans = useStore((s) => s.plans);
  const logs = useStore((s) => s.logs);
  const startDay = useStore((s) => s.startDay);

  const items = useMemo(
    () => openPastItems({ habits, plans, logs, startDay }, today),
    [habits, plans, logs, startDay, today],
  );
  const days = [...new Set(items.map((i) => i.day))].sort().reverse();

  return (
    <Sheet open={open} onClose={() => setReview(false)}>
      <h2 className="text-[22px] font-semibold tracking-[-0.02em]">Close the loop</h2>
      <p className="mt-1 text-[14px] text-muted">
        Be honest about what happened. Tick what you did, cross what you didn't.
      </p>
      {days.length === 0 && (
        <div className="py-10 text-center text-muted">
          <div className="text-4xl">✨</div>
          <div className="mt-2 font-medium text-text">All caught up</div>
        </div>
      )}
      {days.map((day) => {
        const dayItems = items.filter((i) => i.day === day);
        const hs = habits.filter((h) => dayItems.some((i) => i.kind === 'habit' && i.id === h.id));
        const ps = plans.filter((p) => dayItems.some((i) => i.kind === 'plan' && i.id === p.id));
        return (
          <section key={day} className="mt-5">
            <h3 className="mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">
              {formatDay(day, { weekday: 'long', day: 'numeric', month: 'short' })}
            </h3>
            <div className="flex flex-col gap-2">
              {hs.length > 0 && <HabitRows habits={hs} day={day} />}
              {ps.length > 0 && <PlanRows plans={ps} />}
            </div>
          </section>
        );
      })}
      <button onClick={() => setReview(false)} className="mt-6 w-full rounded-2xl bg-surface-2 py-3.5 font-semibold">
        Done
      </button>
    </Sheet>
  );
}
