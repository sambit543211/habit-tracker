import { AnimatePresence } from 'framer-motion';
import { useStore, useUI } from '../store';
import type { Plan } from '../types';
import { ItemRow } from './ItemRow';
import { StarIcon } from './icons';
import { reasonLabel } from '../lib/reasons';

/** Trackable plan rows (today / past days). Must-dos first. */
export function PlanRows({ plans }: { plans: Plan[] }) {
  const { markPlan, clearPlan } = useStore();
  const openMiss = useUI((s) => s.openMiss);
  const sorted = [...plans].sort((a, b) => Number(b.must) - Number(a.must) || a.createdAt - b.createdAt);
  return (
    <ul className="flex flex-col gap-2">
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
  if (p.carryCount > 0)
    return <span className={p.carryCount >= 3 ? 'text-miss' : 'text-gold'}>Moved {p.carryCount}×{p.carryCount >= 3 ? ' — still worth doing?' : ''}</span>;
  return undefined;
}
