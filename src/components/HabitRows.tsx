import type { ReactNode } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useStore, useUI } from '../store';
import type { Habit, HabitLog } from '../types';
import { ItemRow } from './ItemRow';
import { reasonLabel } from '../lib/reasons';

/** Trackable habit rows for a given day. */
export function HabitRows({ habits, day, showTiny }: { habits: Habit[]; day: string; showTiny?: boolean }) {
  const logs = useStore((s) => s.logs[day]);
  const { markHabit, clearHabit } = useStore();
  const openMiss = useUI((s) => s.openMiss);

  return (
    <ul className="flex flex-col gap-2">
      <AnimatePresence initial={false}>
        {habits.map((h) => {
          const log = logs?.[h.id] as HabitLog | undefined;
          const status: 'pending' | 'done' | 'missed' = log?.status ?? 'pending';
          let subtitle: ReactNode = h.cue ? `After I ${h.cue}` : undefined;
          if (status === 'missed')
            subtitle = (
              <span>
                <span className="text-miss">{reasonLabel(log?.miss?.reason)}</span>
                {log?.miss?.nextTime ? ` · Next: ${log.miss.nextTime}` : log?.miss?.note ? ` · ${log.miss.note}` : ''}
              </span>
            );
          else if (status === 'pending' && showTiny && h.tiny)
            subtitle = <span className="text-gold">Short on time? Just: {h.tiny}</span>;
          return (
            <ItemRow
              key={h.id}
              accent="habit"
              title={h.name}
              subtitle={subtitle}
              status={status}
              onDone={() => markHabit(day, h.id)}
              onMiss={() => openMiss({ kind: 'habit', id: h.id, day })}
              onUndo={() => clearHabit(day, h.id)}
            />
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
