import { Reorder, useDragControls } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useStore, useUI } from '../store';
import { byPosition } from '../lib/score';
import { fmtTime } from '../lib/time';
import { haptic } from '../lib/feedback';
import type { Habit } from '../types';

/** Your habits on Me: tap to edit, drag the ≡ handle to reorder. The order is used everywhere. */
export function HabitList() {
  const habits = useStore((s) => s.habits);
  const reorderHabits = useStore((s) => s.reorderHabits);
  const active = habits.filter((h) => !h.archivedDay).sort(byPosition);
  const [order, setOrder] = useState(active.map((h) => h.id));
  const key = active.map((h) => h.id).join();
  useEffect(() => setOrder(key ? key.split(',') : []), [key]);
  const byId = new Map(active.map((h) => [h.id, h]));

  return (
    <Reorder.Group as="ul" axis="y" values={order} onReorder={setOrder} className="mt-2 flex flex-col">
      {order.map((id) => {
        const h = byId.get(id);
        return h ? <Row key={id} habit={h} onDrop={() => reorderHabits(order)} /> : null;
      })}
    </Reorder.Group>
  );
}

function Row({ habit: h, onDrop }: { habit: Habit; onDrop: () => void }) {
  const controls = useDragControls();
  const editHabit = useUI((s) => s.editHabit);
  return (
    <Reorder.Item
      value={h.id}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDrop}
      className="relative flex list-none items-center border-b border-line bg-surface last:border-b-0"
      whileDrag={{ scale: 1.02, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', zIndex: 2, borderRadius: 14 }}
    >
      <button
        aria-label={`Drag to reorder ${h.name}`}
        onPointerDown={(e) => {
          haptic(6);
          controls.start(e);
        }}
        className="-ml-2 grid size-11 shrink-0 cursor-grab touch-none place-items-center text-faint active:text-text"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          <path d="M5 8h14M5 12h14M5 16h14" />
        </svg>
      </button>
      <button onClick={() => editHabit(h.id)} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 py-2 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{h.name}</span>
          {(h.cue || h.remindAt) && (
            <span className="block truncate text-[12.5px] text-muted">
              {[h.cue && `After I ${h.cue}`, h.remindAt && `⏰ ${fmtTime(h.remindAt)}`].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
        <span className="text-[13px] text-faint">Edit ›</span>
      </button>
    </Reorder.Item>
  );
}
