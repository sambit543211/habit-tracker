import { motion } from 'framer-motion';
import { useStore, useUI } from '../store';
import { addDays } from '../lib/date';
import { haptic } from '../lib/feedback';
import { ArrowRightIcon, MoonIcon, XIcon } from './icons';

/** Pieces of the Today screen. */

export function Tonight({
  showClose,
  pending,
  tomorrowCount,
  reviewDue,
  onClose,
  onPlan,
  onReview,
}: {
  showClose: boolean;
  pending: number;
  tomorrowCount: number;
  reviewDue: boolean;
  onClose: () => void;
  onPlan: () => void;
  onReview: () => void;
}) {
  const row = 'flex min-h-12 w-full items-center gap-3 px-4 text-left';
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-[20px] border border-plan/30 bg-[color-mix(in_srgb,var(--plan)_8%,var(--surface))]"
      aria-label="Tonight"
    >
      <div className="flex items-center gap-2 px-4 pt-3 pb-1 text-[12px] font-semibold tracking-[0.1em] text-plan uppercase">
        <MoonIcon size={14} /> Tonight
      </div>
      {showClose && (
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            haptic(8);
            onClose();
          }}
          className="mx-3 my-1.5 flex min-h-12 w-[calc(100%-24px)] items-center justify-between rounded-2xl bg-text px-4 text-left text-bg"
        >
          <span className="text-[15px] font-semibold">Close my day</span>
          <span className="text-[13px] font-medium opacity-70">{pending > 0 ? `${pending} to resolve →` : 'See your day →'}</span>
        </motion.button>
      )}
      <button onClick={onPlan} className={row}>
        <span className="flex-1">
          <span className="block text-[15px] font-semibold">Plan tomorrow</span>
          <span className="block text-[12.5px] text-muted">{tomorrowCount ? `${tomorrowCount} planned · tap to review` : 'Write it down tonight, sleep easier.'}</span>
        </span>
        <ArrowRightIcon size={18} className="shrink-0 text-muted" />
      </button>
      {reviewDue && (
        <button onClick={onReview} className={`${row} border-t border-line`}>
          <span className="flex-1">
            <span className="block text-[15px] font-semibold">Weekly review</span>
            <span className="block text-[12.5px] text-muted">3 questions · 2 minutes</span>
          </span>
          <ArrowRightIcon size={18} className="shrink-0 text-muted" />
        </button>
      )}
      <div className="h-1.5" />
    </motion.section>
  );
}

export function ColumnHeader({ title, color, done, total, action }: { title: string; color: string; done: number; total: number; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex h-8 items-center justify-between gap-1 px-0.5">
      <h2 className="flex items-center gap-1.5 text-[15px] font-semibold tracking-[-0.01em]">
        <span className="h-3.5 w-1 rounded-full" style={{ background: color }} />
        {title}
        <span className="tabular text-[12.5px] font-medium text-muted">
          {done}/{total}
        </span>
      </h2>
      {action}
    </div>
  );
}

/**
 * Empty Plans column: offer yesterday's dropped plans as one-tap re-adds.
 */
export function SmartEmptyPlans({ today, onAdd }: { today: string; onAdd: () => void }) {
  const plans = useStore((s) => s.plans);
  const addPlan = useStore((s) => s.addPlan);
  const showToast = useUI((s) => s.showToast);
  const yesterday = addDays(today, -1);
  const dropped = plans.filter((p) => p.day === yesterday && p.status === 'missed').slice(0, 3);
  if (!dropped.length) return <EmptyColumn text="Nothing planned" cta="Plan something" onClick={onAdd} />;
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-dashed border-line-strong/60 p-2.5">
      <div className="text-[12px] font-medium text-muted">From yesterday</div>
      {dropped.map((p) => (
        <motion.button
          key={p.id}
          whileTap={{ scale: 0.96 }}
          onClick={() => {
            haptic(8);
            const id = addPlan(today, p.title, p.must, {
              note: p.note,
              start: p.start,
              duration: p.duration,
              remindOffset: p.remindOffset,
              remindAt: p.remindAt,
            });
            showToast(`Added “${p.title}” for today`, { tone: 'plan', undo: () => useStore.getState().deletePlan(id) });
          }}
          className="flex items-center gap-1.5 rounded-xl bg-surface px-2.5 py-2 text-left text-[12.5px] font-medium"
        >
          <span className="text-plan">＋</span>
          <span className="truncate">Retry: {p.title}</span>
        </motion.button>
      ))}
      <button onClick={onAdd} className="mt-0.5 text-[12.5px] font-semibold text-muted">
        or plan something new →
      </button>
    </div>
  );
}

export function EmptyColumn({ text, cta, onClick }: { text: string; cta: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full flex-col items-center gap-1 rounded-2xl border border-dashed border-line-strong/60 px-2 py-6 text-center"
    >
      <span className="text-[13px] text-muted">{text}</span>
      <span className="text-[13px] font-semibold text-plan">{cta} →</span>
    </button>
  );
}

export function Banner({
  title,
  text,
  tone,
  icon,
  onClick,
  onDismiss,
}: {
  title: string;
  text: string;
  tone: 'habit' | 'plan' | 'miss';
  icon?: React.ReactNode;
  onClick?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="relative flex items-center gap-3 overflow-hidden rounded-[20px] border px-4 py-3"
      style={{
        borderColor: `color-mix(in srgb, var(--${tone}) 30%, transparent)`,
        background: `color-mix(in srgb, var(--${tone}) 10%, var(--surface))`,
      }}
    >
      <button
        onClick={() => {
          haptic(6);
          onClick?.();
        }}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        disabled={!onClick}
      >
        <span
          className="grid size-9 shrink-0 place-items-center rounded-full"
          style={{ background: `color-mix(in srgb, var(--${tone}) 20%, transparent)`, color: `var(--${tone})` }}
        >
          {icon ?? <span className="size-2 rounded-full" style={{ background: `var(--${tone})` }} />}
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold">{title}</span>
          <span className="block truncate text-[13px] text-muted">{text}</span>
        </span>
        {onClick && <ArrowRightIcon size={18} className="ml-auto shrink-0 text-muted" />}
      </button>
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss" className="grid size-8 shrink-0 place-items-center rounded-full text-muted">
          <XIcon size={16} />
        </button>
      )}
    </motion.div>
  );
}
