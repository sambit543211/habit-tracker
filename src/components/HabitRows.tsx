import type { ReactNode } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useStore, useUI } from '../store';
import type { Habit, HabitLog } from '../types';
import { ItemRow } from './ItemRow';
import { reasonLabel } from '../lib/reasons';
import { useData } from '../lib/useData';
import { weekCount } from '../lib/score';
import { WATER_STEP, fmtWaterPair, waterTarget } from '../lib/water';
import { haptic } from '../lib/feedback';
import { PART_COLORS, isCombo, partCredit } from '../lib/parts';

/** Trackable habit rows for a given day. */
export function HabitRows({
  habits,
  day,
  showTiny,
  compact,
}: {
  habits: Habit[];
  day: string;
  showTiny?: boolean;
  compact?: boolean;
}) {
  const logs = useStore((s) => s.logs[day]);
  const data = useData();
  const amounts = useStore((s) => s.amounts[day]);
  const addWater = useStore((s) => s.addWater);
  const openWater = useUI((s) => s.openWater);
  const { markHabit, clearHabit, setParts } = useStore();
  const openParts = useUI((s) => s.openParts);
  const openMiss = useUI((s) => s.openMiss);
  const showToast = useUI((s) => s.showToast);

  return (
    <ul className={`flex flex-col ${compact ? 'gap-1.5' : 'gap-2'}`}>
      <AnimatePresence initial={false}>
        {habits.map((h) => {
          const log = logs?.[h.id] as HabitLog | undefined;
          const skipped = log?.miss?.reason === 'skip';
          const status: 'pending' | 'done' | 'missed' = log?.status ?? 'pending';
          const base = [
            h.perWeek ? `${weekCount(data, h, day)} of ${h.perWeek} this week` : null,
            h.cue ? `After I ${h.cue}` : null,
            h.pairWith ? `🎧 with ${h.pairWith}` : null,
          ]
            .filter(Boolean)
            .join(' · ');
          let subtitle: ReactNode = base || undefined;
          if (skipped) subtitle = <span className="text-muted">🛌 Skipped today</span>;
          else if (status === 'missed')
            subtitle = (
              <span>
                <span className="text-miss">{reasonLabel(log?.miss?.reason)}</span>
                {log?.miss?.nextTime ? ` · Next: ${log.miss.nextTime}` : log?.miss?.note ? ` · ${log.miss.note}` : ''}
              </span>
            );
          const goal = waterTarget(h);
          if (goal && status !== 'missed') {
            const ml = amounts?.[h.id] ?? 0;
            subtitle = (
              <span className="block">
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <span className="block h-full rounded-full bg-sky-400 transition-[width] duration-500" style={{ width: `${Math.min(100, (ml / goal) * 100)}%` }} />
                </span>
                <span className="mt-0.5 block tabular text-sky-400">
                  {fmtWaterPair(ml, goal)}
                </span>
              </span>
            );
          } else if (isCombo(h) && status !== 'missed') {
            // Split bar + one chip per part. Tap a chip to tick just that part.
            const done = status === 'done' ? (log?.parts ?? h.parts.map((p) => p.id)) : [];
            const credit = partCredit(h, log);
            subtitle = (
              <span className="block">
                <span className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  {h.parts.map((p, i) => (
                    <span
                      key={p.id}
                      className="block h-full transition-opacity duration-300"
                      style={{ width: `${p.weight}%`, background: PART_COLORS[i], opacity: done.includes(p.id) ? 1 : 0.15 }}
                    />
                  ))}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-1">
                  {h.parts.map((p, i) => {
                    const on = done.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          haptic(on ? 6 : 10);
                          setParts(day, h.id, on ? done.filter((x) => x !== p.id) : [...done, p.id]);
                        }}
                        aria-pressed={on}
                        aria-label={`${p.name}, ${p.weight}%${on ? ', done' : ''}`}
                        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11.5px] font-medium ${on ? 'text-text' : 'text-faint'}`}
                        style={{ background: on ? `color-mix(in srgb, ${PART_COLORS[i]} 22%, transparent)` : 'var(--surface-2)' }}
                      >
                        <span className="size-1.5 rounded-full" style={{ background: PART_COLORS[i] }} aria-hidden />
                        {p.name}
                        {on && ' ✓'}
                      </button>
                    );
                  })}
                  {credit > 0 && credit < 1 && <span className="text-[11.5px] font-semibold text-part tabular">{Math.round(credit * 100)}%</span>}
                </span>
              </span>
            );
          } else if (status === 'pending' && showTiny && h.tiny)
            subtitle = <span className="text-gold">{compact ? `Or just: ${h.tiny}` : `Short on time? Just: ${h.tiny}`}</span>;
          return (
            <ItemRow
              key={h.id}
              accent="habit"
              title={h.name}
              subtitle={subtitle}
              status={skipped ? 'carried' : status === 'done' && partCredit(h, log) < 1 ? 'partial' : status}
              onDone={() => {
                if (isCombo(h)) return openParts({ id: h.id, day });
                markHabit(day, h.id);
                showToast(`${h.name} — done`, { tone: 'habit', undo: () => clearHabit(day, h.id) });
              }}
              onMiss={() => openMiss({ kind: 'habit', id: h.id, day })}
              onUndo={() => (isCombo(h) && status === 'done' ? openParts({ id: h.id, day }) : clearHabit(day, h.id))}
              onOpen={goal ? () => openWater({ id: h.id, day }) : isCombo(h) ? () => openParts({ id: h.id, day }) : undefined}
              trailing={
                goal && status === 'pending' ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      haptic(8);
                      addWater(day, h.id, WATER_STEP);
                    }}
                    aria-label={`Add ${WATER_STEP} ml`}
                    className={`shrink-0 rounded-full bg-sky-400/15 font-bold text-sky-400 ${compact ? 'self-center px-2 py-1.5 text-[12px]' : 'px-3 py-2 text-[13px]'}`}
                  >
                    +{WATER_STEP}
                  </button>
                ) : undefined
              }
              compact={compact}
            />
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
