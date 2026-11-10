import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { useStore } from '../store';

/**
 * A quiet, optional one-liner before bed. Only shown in the last two hours
 * before your sleep time — deliberately low-key.
 */
export function BedtimeNote({ day }: { day: string }) {
  const saved = useStore((s) => s.reflections[day]);
  const setReflection = useStore((s) => s.setReflection);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');

  if (saved && !editing) {
    return (
      <button
        onClick={() => {
          setText(saved);
          setEditing(true);
        }}
        className="flex w-full items-start gap-2 px-1 text-left text-[13px] text-faint"
      >
        <span>🌙</span>
        <span className="italic">“{saved}”</span>
      </button>
    );
  }

  return (
    <AnimatePresence initial={false}>
      {editing ? (
        <motion.form
          key="form"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          onSubmit={(e) => {
            e.preventDefault();
            setReflection(day, text);
            setEditing(false);
          }}
          className="flex gap-2 overflow-hidden"
        >
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="One thing I learned today…"
            maxLength={200}
            className="min-w-0 flex-1 rounded-2xl border border-line bg-surface/60 px-4 py-2.5 text-[14px] outline-none placeholder:text-faint focus:border-line-strong"
          />
          <button type="submit" className="shrink-0 rounded-2xl bg-surface-2 px-4 text-[14px] font-medium text-muted">
            Save
          </button>
        </motion.form>
      ) : (
        <motion.button
          key="cta"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => {
            setText('');
            setEditing(true);
          }}
          className="w-full px-1 text-left text-[13px] text-faint"
        >
          🌙 One line before bed? <span className="underline decoration-dotted underline-offset-2">Add a reflection</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
