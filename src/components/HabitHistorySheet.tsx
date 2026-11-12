import { motion } from 'framer-motion';
import { useStore } from '../store';
import { Sheet } from './Sheet';
import { addDays, formatDay, range, weekday } from '../lib/date';
import { habitStreak } from '../lib/score';
import { haptic } from '../lib/feedback';
import type { Habit } from '../types';

const WEEKS = 6;

/**
 * A habit's recent history. Forgot to check in? Tap a day to mark it done
 * (or tap again to clear it). Days you never ticked count as not done.
 */
export function HabitHistorySheet({ habit, today, onClose }: { habit: Habit | null; today: string; onClose: () => void }) {
  const logs = useStore((s) => s.logs);
  const { markHabit, clearHabit } = useStore();
  const habits = useStore((s) => s.habits);
  const plans = useStore((s) => s.plans);
  const startDay = useStore((s) => s.startDay);
  const data = { habits, plans, logs, startDay };
  if (!habit) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;

  // Grid: Monday-first weeks ending with the current week.
  const mondayOffset = (weekday(today) + 6) % 7;
  const start = addDays(today, -mondayOffset - (WEEKS - 1) * 7);
  const days = range(start, addDays(start, WEEKS * 7 - 1));
  const tracked = days.filter((d) => d >= habit.createdDay && d <= today && (!habit.archivedDay || d < habit.archivedDay));
  const done = tracked.filter((d) => logs[d]?.[habit.id]?.status === 'done').length;

  return (
    <Sheet open onClose={onClose}>
      <div className="text-[13px] font-medium tracking-wide text-habit uppercase">Habit history</div>
      <h2 className="mt-1 text-[22px] leading-tight font-semibold tracking-[-0.02em]">{habit.name}</h2>
      <p className="mt-1 text-[14px] text-muted">
        {done} of {tracked.length} days done · 🔥 {habitStreak(data, habit, today)} in a row
      </p>

      <div className="mt-4 grid grid-cols-7 gap-1.5 text-center">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={i} className="text-[12px] font-medium text-faint">
            {d}
          </div>
        ))}
        {days.map((d) => {
          const active = tracked.includes(d);
          const status = logs[d]?.[habit.id]?.status;
          const isDone = status === 'done';
          const label = `${formatDay(d, { weekday: 'long', day: 'numeric', month: 'long' })}: ${isDone ? 'done' : 'not done'}`;
          return (
            <motion.button
              key={d}
              whileTap={active ? { scale: 0.85 } : undefined}
              disabled={!active}
              aria-label={active ? `${label}. Tap to change` : undefined}
              aria-pressed={active ? isDone : undefined}
              onClick={() => {
                haptic(8);
                if (isDone) clearHabit(d, habit.id);
                else markHabit(d, habit.id);
              }}
              className={`relative grid aspect-square place-items-center rounded-xl text-[13px] font-semibold ${
                !active
                  ? 'text-faint opacity-30'
                  : isDone
                    ? 'bg-habit text-black/80'
                    : d === today
                      ? 'border border-line-strong text-text'
                      : 'bg-miss/15 text-miss'
              } ${d === today ? 'ring-2 ring-text/60' : ''}`}
            >
              {Number(d.slice(8))}
            </motion.button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-4 text-[12.5px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded bg-habit" /> Done
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded bg-miss/30" /> Not done
        </span>
      </div>
      <p className="mt-2 text-[13px] text-muted">Forgot to check in? Tap a day to fix it. Your streak and scores update straight away.</p>
      <button onClick={onClose} className="mt-5 min-h-12 w-full rounded-2xl bg-surface-2 text-[15px] font-semibold">
        Done
      </button>
    </Sheet>
  );
}
