import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore, useUI } from '../store';
import { Sheet } from './Sheet';

export function HabitEditor() {
  const editing = useUI((s) => s.editingHabit);
  const editHabit = useUI((s) => s.editHabit);
  const habits = useStore((s) => s.habits);
  const { addHabit, updateHabit, archiveHabit } = useStore();
  const habit = editing && editing !== 'new' ? habits.find((h) => h.id === editing) : undefined;

  const [name, setName] = useState('');
  const [cue, setCue] = useState('');
  const [tiny, setTiny] = useState('');
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!editing) return;
    setName(habit?.name ?? '');
    setCue(habit?.cue ?? '');
    setTiny(habit?.tiny ?? '');
    setConfirm(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const close = () => editHabit(null);
  const save = () => {
    const n = name.trim();
    if (!n) return;
    const data = { name: n, cue: cue.trim() || undefined, tiny: tiny.trim() || undefined };
    if (habit) updateHabit(habit.id, data);
    else addHabit(data);
    close();
  };

  const field = 'mt-1.5 w-full rounded-2xl border border-line bg-surface-2 px-4 py-3.5 outline-none focus:border-line-strong placeholder:text-faint';

  return (
    <Sheet open={!!editing} onClose={close}>
      <h2 className="text-[22px] font-semibold tracking-[-0.02em]">{habit ? 'Edit habit' : 'New habit'}</h2>
      <p className="mt-1 text-[14px] text-muted">A daily non-negotiable. Small and specific wins.</p>

      <label className="mt-5 block text-[13px] font-medium text-muted">I will…</label>
      <input autoFocus={!habit} value={name} onChange={(e) => setName(e.target.value)} placeholder="Read 10 pages" className={field} />

      <label className="mt-4 block text-[13px] font-medium text-muted">After I… <span className="text-faint">(your trigger)</span></label>
      <input value={cue} onChange={(e) => setCue(e.target.value)} placeholder="pour my morning coffee" className={field} />
      <p className="mt-1.5 text-[12.5px] text-faint">
        "After X, I will Y" plans roughly double follow-through (Gollwitzer & Sheeran, 2006).
      </p>

      <label className="mt-4 block text-[13px] font-medium text-muted">Tiny version for hard days</label>
      <input value={tiny} onChange={(e) => setTiny(e.target.value)} placeholder="Read 1 page" className={field} />

      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={save}
        disabled={!name.trim()}
        className="mt-6 w-full rounded-2xl bg-text py-4 text-[16px] font-semibold text-bg disabled:opacity-30"
      >
        {habit ? 'Save' : 'Add habit'}
      </motion.button>

      {habit && (
        <button
          onClick={() => {
            if (!confirm) return setConfirm(true);
            archiveHabit(habit.id);
            close();
          }}
          className={`mt-2 w-full py-3 text-[14px] font-medium ${confirm ? 'text-miss' : 'text-faint'}`}
        >
          {confirm ? 'Tap again to remove (history is kept)' : 'Remove habit'}
        </button>
      )}
    </Sheet>
  );
}
