import type { ReactNode } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useStore, useUI } from '../store';
import type { Habit, HabitLog } from '../types';
import { ItemRow } from './ItemRow';
import { reasonLabel } from '../lib/reasons';

/** Trackable habit rows for a given day. */
export function HabitRows({
  habits,
  day,
  showTiny,
  compact,
  hintId,
  onHintDone,
}: {
  habits: Habit[];
  day: string;
  showTiny?: boolean;
  compact?: boolean;
  hintId?: string;
  onHintDone?: () => void;
}) {
  const logs = useStore((s) => s.logs[day]);
  const { markHabit, clearHabit } = useStore();
  const openMiss = useUI((s) => s.openMiss);
  const showToast = useUI((s) => s.showToast);

  return (
    <ul className={`flex flex-col ${compact ? 'gap-1.5' : 'gap-2'}`}>
      <AnimatePresence initial={false}>
        {habits.map((h) => {
          const log = logs?.[h.id] as HabitLog | undefined;
          const status: 'pending' | 'done' | 'missed' = log?.status ?? 'pending';
          const base = [h.cue ? `After I ${h.cue}` : null, h.pairWith ? `🎧 with ${h.pairWith}` : null].filter(Boolean).join(' · ');
          let subtitle: ReactNode = base || undefined;
          if (status === 'missed')
            subtitle = (
              <span>
                <span className="text-miss">{reasonLabel(log?.miss?.reason)}</span>
                {log?.miss?.nextTime ? ` · Next: ${log.miss.nextTime}` : log?.miss?.note ? ` · ${log.miss.note}` : ''}
              </span>
            );
          else if (status === 'pending' && showTiny && h.tiny)
            subtitle = <span className="text-gold">{compact ? `Or just: ${h.tiny}` : `Short on time? Just: ${h.tiny}`}</span>;
          return (
            <ItemRow
              key={h.id}
              accent="habit"
              title={h.name}
              subtitle={subtitle}
              status={status}
              onDone={() => {
                markHabit(day, h.id);
                showToast(`${h.name} — done`, { tone: 'habit', undo: () => clearHabit(day, h.id) });
              }}
              onMiss={() => openMiss({ kind: 'habit', id: h.id, day })}
              onUndo={() => clearHabit(day, h.id)}
              compact={compact}
              hint={h.id === hintId}
              onHintDone={onHintDone}
            />
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
