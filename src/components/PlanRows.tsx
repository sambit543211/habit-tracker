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
  const sorted = [...plans].sort(
    (a, b) => Number(b.must) - Number(a.must) || (a.start ?? '99').localeCompare(b.start ?? '99') || a.createdAt - b.createdAt,
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
            onDone={() => markPlan(p.id)}
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
  if (p.carryCount >= 3) return <span className="text-miss">Moved {p.carryCount}× — still worth doing?</span>;
  const meta = planMetaText(p);
  return meta ? <span className={p.carryCount > 0 ? 'text-gold' : ''}>{meta}</span> : undefined;
}
