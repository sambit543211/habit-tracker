import { motion } from 'framer-motion';
import { useState } from 'react';
import { PlusIcon, StarIcon } from './icons';
import { haptic } from '../lib/feedback';

interface Props {
  onAdd: (title: string, must: boolean) => void;
  /** Called when + is tapped with nothing typed — opens the full editor */
  onDetails?: () => void;
  placeholder: string;
  defaultMust?: boolean;
}

/**
 * Quick-add bar. Type and press + to add instantly; tap + with an empty field
 * to open the full editor (time, note, reminder, if-then).
 */
export function PlanInput({ onAdd, onDetails, placeholder, defaultMust = false }: Props) {
  const [title, setTitle] = useState('');
  const [must, setMust] = useState(defaultMust);
  const submit = () => {
    const t = title.trim();
    haptic(8);
    if (!t) return onDetails?.();
    onAdd(t, must);
    setTitle('');
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-center gap-2 rounded-[20px] border border-line-strong/50 bg-surface py-1.5 pr-1.5 pl-1.5 shadow-[0_6px_24px_rgba(0,0,0,0.12)]"
    >
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        onClick={() => setMust((m) => !m)}
        aria-pressed={must}
        className={`flex h-9 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[12.5px] font-semibold transition-colors ${
          must ? 'border-gold/50 bg-gold/15 text-gold' : 'border-line bg-surface-2 text-muted'
        }`}
      >
        <StarIcon size={14} filled={must} />
        Must-do
      </motion.button>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={placeholder}
        enterKeyHint="done"
        className="min-w-0 flex-1 bg-transparent py-2 outline-none placeholder:text-faint"
      />
      <motion.button
        type="submit"
        whileTap={{ scale: 0.88 }}
        aria-label={title.trim() ? 'Add plan' : 'Add plan with details'}
        className="grid size-10 shrink-0 place-items-center rounded-2xl bg-plan text-white shadow-[0_4px_16px_color-mix(in_srgb,var(--plan)_45%,transparent)]"
      >
        <PlusIcon size={20} strokeWidth={2.6} />
      </motion.button>
    </form>
  );
}
