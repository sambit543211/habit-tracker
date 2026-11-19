import { motion } from 'framer-motion';
import { useStore, useUI } from '../store';
import { Sheet } from './Sheet';
import { PART_COLORS, isCombo, partCredit } from '../lib/parts';
import { haptic } from '../lib/feedback';

/** "What did you do?" for a combo habit: tick the parts you did. Any part keeps the streak. */
export function PartsSheet() {
  const target = useUI((s) => s.parts);
  const close = () => useUI.getState().openParts(null);
  const habit = useStore((s) => s.habits.find((h) => h.id === target?.id));
  const log = useStore((s) => (target ? s.logs[target.day]?.[target.id] : undefined));
  const setParts = useStore((s) => s.setParts);
  const showToast = useUI((s) => s.showToast);
  if (!target || !habit || !isCombo(habit)) return <Sheet open={false} onClose={close}>{null}</Sheet>;

  const all = habit.parts.map((p) => p.id);
  // Ticked as a whole earlier (or by Siri): every part counts as done.
  const done = log?.status === 'done' ? (log.parts ?? all) : [];
  const credit = partCredit(habit, log);
  const pct = Math.round(credit * 100);
  const set = (ids: string[]) => {
    haptic(ids.length > done.length ? 12 : 6);
    setParts(target.day, habit.id, ids);
    if (ids.length === all.length && done.length < all.length) {
      showToast(`${habit.name} — all done 💪`, { tone: 'habit' });
      close();
    }
  };
  const toggle = (id: string) => set(done.includes(id) ? done.filter((x) => x !== id) : [...done, id]);

  return (
    <Sheet open onClose={close}>
      <div className="text-[13px] font-medium tracking-wide text-habit uppercase">What did you do?</div>
      <h2 className="mt-1 text-[22px] leading-tight font-semibold tracking-[-0.02em]">{habit.name}</h2>

      {/* The split bar: done parts in colour, the rest faded */}
      <div className="mt-4 flex h-4 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        {habit.parts.map((p, i) => (
          <motion.div
            key={p.id}
            className="h-full"
            style={{ width: `${p.weight}%`, background: PART_COLORS[i] }}
            animate={{ opacity: done.includes(p.id) ? 1 : 0.18 }}
          />
        ))}
      </div>
      <p className="mt-2 text-[14px] font-medium tabular" style={{ color: credit === 1 ? 'var(--habit)' : credit > 0 ? 'var(--part)' : 'var(--muted)' }}>
        {credit === 1 ? '100% — full day 🎉' : credit > 0 ? `${pct}% — streak kept 🔥` : 'Nothing yet'}
      </p>

      <div className="mt-4 flex flex-col gap-2">
        {habit.parts.map((p, i) => {
          const on = done.includes(p.id);
          return (
            <motion.button
              key={p.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => toggle(p.id)}
              aria-pressed={on}
              className="flex min-h-14 items-center gap-3 rounded-2xl border px-4 text-left"
              style={{ borderColor: on ? PART_COLORS[i] : 'var(--line)', background: on ? `color-mix(in srgb, ${PART_COLORS[i]} 14%, var(--surface))` : 'var(--surface-2)' }}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-full border-2" style={{ borderColor: PART_COLORS[i], background: on ? PART_COLORS[i] : 'transparent' }}>
                {on && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,.78)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M6 12.5l4 4L18 8.5" />
                  </svg>
                )}
              </span>
              <span className="min-w-0 flex-1 text-[16px] font-medium">{p.name}</span>
              <span className="shrink-0 text-[14px] font-semibold text-muted tabular">{p.weight}%</span>
            </motion.button>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => set(all)}
          disabled={done.length === all.length}
          className="min-h-12 rounded-2xl bg-habit text-[15px] font-semibold text-black/80 disabled:opacity-40"
        >
          {all.length === 2 ? '✓ Both' : '✓ All of it'}
        </button>
        <button onClick={() => (done.length ? set([]) : close())} className="min-h-12 rounded-2xl bg-surface-2 text-[15px] font-semibold">
          {done.length ? 'Clear' : 'Not yet'}
        </button>
      </div>
      <p className="mt-3 text-center text-[12.5px] text-faint">Any part keeps your streak · swipe the row left if you didn't do it</p>
    </Sheet>
  );
}
