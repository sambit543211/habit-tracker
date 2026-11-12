import { AnimatePresence } from 'framer-motion';
import { useStore, useUI } from '../store';
import type { Plan } from '../types';
import { ItemRow } from './ItemRow';
import { StarIcon } from './icons';
import { reasonLabel } from '../lib/reasons';
import { planMetaText } from '../lib/planMeta';

/** Trackable plan rows (today / past days). Must-dos first. */
export function PlanRows({ plans, compact }: { plans: Plan[]; compact?: boolean }) {
  const { markPlan, clearPlan } = useStore();
  const openMiss = useUI((s) => s.openMiss);
  const editPlan = useUI((s) => s.editPlan);
  const showToast = useUI((s) => s.showToast);
  const sorted = [...plans].sort(
    (a, b) => lateDays(b) - lateDays(a) || Number(b.must) - Number(a.must) || (a.start ?? '99').localeCompare(b.start ?? '99') || a.createdAt - b.createdAt,
  );
  return (
    <ul className={`flex flex-col ${compact ? 'gap-1.5' : 'gap-2'}`}>
      <AnimatePresence initial={false}>
        {sorted.map((p) => (
          <ItemRow
            key={p.id}
            accent="plan"
            title={p.title}
            status={p.status}
            leading={p.must ? <StarIcon size={14} filled className="shrink-0 text-gold" /> : undefined}
            subtitle={planSubtitle(p)}
            badge={carryBadge(p)}
            tint={lateColor(p)}
            onDone={() => {
              markPlan(p.id);
              showToast(`${p.title} — done`, { tone: 'plan', undo: () => clearPlan(p.id) });
            }}
            onMiss={() => openMiss({ kind: 'plan', id: p.id })}
            onUndo={() => clearPlan(p.id)}
            onOpen={() => editPlan({ id: p.id })}
            compact={compact}
          />
        ))}
      </AnimatePresence>
    </ul>
  );
}

export function planSubtitle(p: Plan) {
  if (p.status === 'missed' || p.status === 'carried') {
    const what = p.status === 'carried' ? 'Moved forward' : reasonLabel(p.miss?.reason);
    return (
      <span>
        <span className="text-miss">{p.status === 'carried' ? '→ ' : ''}{what}</span>
        {p.status === 'carried' && p.miss?.reason && ` · ${reasonLabel(p.miss.reason)}`}
        {p.miss?.note && ` · ${p.miss.note}`}
      </span>
    );
  }
  return planMetaText(p, false) ?? undefined;
}

/** Whole days a plan is overdue (0 = planned for this day). */
export const lateDays = (p: Plan) =>
  p.originDay ? Math.max(0, Math.round((new Date(`${p.day}T12:00:00`).getTime() - new Date(`${p.originDay}T12:00:00`).getTime()) / 86400_000)) : 0;

/** Severity colour for an overdue plan: 1 day amber, 2 days orange, 3+ red. */
export const lateColor = (p: Plan) => {
  const n = lateDays(p);
  return n >= 3 ? 'var(--miss)' : n === 2 ? '#f97316' : n === 1 ? 'var(--gold)' : undefined;
};

/** "2 days late" as its own chip, so the signal is never cut off. */
export function carryBadge(p: Plan) {
  const n = lateDays(p);
  if (p.status !== 'pending' || n < 1) return undefined;
  const color = lateColor(p)!;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold"
      style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}
    >
      {n === 1 ? 'From yesterday' : `${n} days late`}
      {n >= 3 ? ' · still worth it?' : ''}
    </span>
  );
}
