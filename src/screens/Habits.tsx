import { AnimatePresence, motion } from 'framer-motion';
import { useStore, useUI } from '../store';
import { habitRate, habitStreak, habitsOn } from '../lib/score';
import { FlameIcon, PlusIcon } from '../components/icons';

export function Habits({ today }: { today: string }) {
  const habits = useStore((s) => s.habits);
  const plans = useStore((s) => s.plans);
  const logs = useStore((s) => s.logs);
  const startDay = useStore((s) => s.startDay);
  const editHabit = useUI((s) => s.editHabit);
  const data = { habits, plans, logs, startDay };
  const active = habitsOn(data, today);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-end justify-between pt-2">
        <div>
          <div className="text-[13px] font-semibold tracking-[0.08em] text-habit uppercase">Non-negotiables</div>
          <h1 className="text-[30px] leading-tight font-bold tracking-[-0.03em]">Your habits</h1>
        </div>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => editHabit('new')}
          aria-label="New habit"
          className="grid size-11 place-items-center rounded-2xl bg-habit text-black/80 shadow-[0_6px_20px_color-mix(in_srgb,var(--habit)_35%,transparent)]"
        >
          <PlusIcon size={22} strokeWidth={2.4} />
        </motion.button>
      </header>

      <p className="text-[14.5px] leading-relaxed text-muted">
        Every habit, every day. Your streak only grows on days you complete <em>all</em> of them — keep the list short and honest.
      </p>

      <ul className="flex flex-col gap-2.5">
        <AnimatePresence initial={false}>
          {active.map((h) => {
            const rate = habitRate(data, h, today);
            return (
              <motion.li
                key={h.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="list-none"
              >
                <button onClick={() => editHabit(h.id)} className="card flex w-full items-center gap-3.5 px-4 py-3.5 text-left">
                  <span className="h-10 w-1 shrink-0 rounded-full bg-habit" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold tracking-[-0.01em]">{h.name}</span>
                    <span className="block truncate text-[13px] text-muted">
                      {h.cue ? `After I ${h.cue}` : <span className="text-gold">Add a trigger → "After I…"</span>}
                    </span>
                    {(h.tiny || h.pairWith) && (
                      <span className="block truncate text-[12.5px] text-faint">
                        {[h.tiny && `Tiny: ${h.tiny}`, h.pairWith && `🎧 ${h.pairWith}`].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                  <span className="text-right">
                    <span className="flex items-center justify-end gap-1 text-[15px] font-semibold">
                      <FlameIcon size={14} className="text-gold" />
                      {habitStreak(data, h, today)}
                    </span>
                    <span className="tabular block text-[12px] text-muted">{rate === null ? 'new' : `${Math.round(rate * 100)}% · 30d`}</span>
                  </span>
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      {active.length === 0 && (
        <button onClick={() => editHabit('new')} className="rounded-[20px] border border-dashed border-line-strong/60 py-8 text-muted">
          Add your first habit
        </button>
      )}

      {active.length > 6 && (
        <p className="rounded-[20px] border border-gold/30 bg-gold/10 px-4 py-3 text-[13.5px] text-muted">
          <span className="font-semibold text-gold">That's a lot of non-negotiables.</span> Strict streaks reward consistency over volume — consider
          moving some to Plans.
        </p>
      )}
    </div>
  );
}
