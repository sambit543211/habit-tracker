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
  const [remindAt, setRemindAt] = useState('');
  const [pairWith, setPairWith] = useState('');
  const [more, setMore] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!editing) return;
    setName(habit?.name ?? '');
    setCue(habit?.cue ?? '');
    setTiny(habit?.tiny ?? '');
    setRemindAt(habit?.remindAt ?? '');
    setPairWith(habit?.pairWith ?? '');
    setMore(!!(habit?.cue || habit?.tiny || habit?.pairWith));
    setConfirm(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const close = () => editHabit(null);
  const save = () => {
    const n = name.trim();
    if (!n) return;
    const data = { name: n, cue: cue.trim() || undefined, tiny: tiny.trim() || undefined, remindAt: remindAt || undefined, pairWith: pairWith.trim() || undefined };
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

      <label className="mt-4 block text-[13px] font-medium text-muted">Remind me at <span className="text-faint">(optional)</span></label>
      <div className="mt-1.5 flex items-center gap-2">
        <input type="time" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} className={`${field} mt-0 tabular`} />
        {remindAt && (
          <button onClick={() => setRemindAt('')} className="shrink-0 rounded-2xl bg-surface-2 px-4 py-3.5 text-[14px] text-muted">
            Clear
          </button>
        )}
      </div>
      <p className="mt-1.5 text-[12.5px] text-faint">Skipped if you've already done it.</p>

      <button
        onClick={() => setMore((m) => !m)}
        aria-expanded={more}
        className="mt-4 flex min-h-11 w-full items-center justify-between text-[14px] font-medium text-muted"
      >
        More options — trigger, tiny version, pair with
        <motion.span animate={{ rotate: more ? 90 : 0 }} aria-hidden>
          ›
        </motion.span>
      </button>
      {more && (
        <div>
        <label className="mt-2 block text-[13px] font-medium text-muted">After I… <span className="text-faint">(your trigger)</span></label>
        <input value={cue} onChange={(e) => setCue(e.target.value)} placeholder="pour my morning coffee" className={field} />

        <label className="mt-4 block text-[13px] font-medium text-muted">Tiny version for hard days</label>
        <input value={tiny} onChange={(e) => setTiny(e.target.value)} placeholder="Read 1 page" className={field} />

        <label className="mt-4 block text-[13px] font-medium text-muted">Pair it with… <span className="text-faint">(optional)</span></label>
        <input value={pairWith} onChange={(e) => setPairWith(e.target.value)} placeholder="my favourite podcast — only while doing this" className={field} />
        <p className="mt-1.5 text-[12.5px] text-faint">A treat you only allow while doing the habit.</p>
        </div>
      )}

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
